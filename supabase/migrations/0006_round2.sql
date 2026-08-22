-- Round 2 hardening: enforce patron rate limits, soft-delete, higher report
-- threshold, gift-on-hidden guard, reap correctness, relaxed link filter.

alter table public.lanterns add column if not exists deleted_at timestamptz;
revoke select on public.gifts from anon, authenticated;

-- Generic server-side rate limiter used by routes that touch external services
-- (patron checkout / confirm). Only the service role may call it.
create or replace function public.check_rate(
  p_kind text, p_ip_hash text, p_window_secs integer, p_limit integer
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if p_ip_hash is null or char_length(p_ip_hash) < 8 then return false; end if;
  perform pg_advisory_xact_lock(hashtext(p_kind || ':' || p_ip_hash));
  select count(*) into v_count from rate_events
    where kind = p_kind and ip_hash = p_ip_hash
      and created_at > now() - make_interval(secs => p_window_secs);
  if v_count >= p_limit then return false; end if;
  insert into rate_events (kind, ip_hash) values (p_kind, p_ip_hash);
  return true;
end $$;
revoke all on function public.check_rate(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate(text, text, integer, integer) to service_role;

-- Relax the SQL link check to match lib/filter.ts (do not treat server.py as a
-- link); add contact-PII rejection as defense in depth. Raise report threshold.
create or replace function public.submit_lantern(
  p_message text, p_hue integer, p_seed integer, p_model text, p_ip_hash text
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_accepting boolean; v_recent integer; v_hour integer; v_msg text;
  v_model text; v_low text; v_id uuid; v_seq bigint; v_bad text;
begin
  select (value #>> '{}')::boolean into v_accepting from settings where key = 'accepting';
  if not coalesce(v_accepting, false) then
    return json_build_object('ok', false, 'error', 'waystation_closed'); end if;
  if p_ip_hash is null or char_length(p_ip_hash) < 8 then
    return json_build_object('ok', false, 'error', 'bad_request'); end if;
  v_msg := trim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g'));
  if char_length(v_msg) < 1 or char_length(v_msg) > 280 then
    return json_build_object('ok', false, 'error', 'message_length'); end if;
  if v_msg ~ U&'[\0001-\0008\000B-\001F\007F\200B-\200F\202A-\202E\2066-\2069]' then
    return json_build_object('ok', false, 'error', 'invalid_characters'); end if;
  -- links only (scheme / www / domain+path / linky-TLD / IPv4 / email)
  if v_msg ~* '(https?://|www\.[a-z0-9-]|[a-z0-9-]+\.[a-z]{2,24}/|\m[a-z0-9-]{2,}\.(com|net|org|info|xyz|online|site|shop|store|click|link|app|dev|cloud|tech|live|io|co|ai|gg|me|tv|cc|biz|pro|page|blog)\M|\m\d{1,3}(\.\d{1,3}){3}\M|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})' then
    return json_build_object('ok', false, 'error', 'no_links_allowed'); end if;
  -- contact PII
  if v_msg ~ '(\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}|\+\d[\d ().-]{7,}\d|\m\d{3}-\d{2}-\d{4}\M)' then
    return json_build_object('ok', false, 'error', 'no_personal_info'); end if;
  v_model := nullif(left(trim(coalesce(p_model, '')), 60), '');
  if v_model is not null and v_model !~ '^[A-Za-z0-9 ._()\-]{1,60}$' then
    return json_build_object('ok', false, 'error', 'invalid_model'); end if;
  v_low := lower(v_msg || ' ' || coalesce(v_model, ''));
  foreach v_bad in array array['nigger','faggot','kike','wetback','tranny','raghead','beaner','gook','kill yourself','child porn','csam','heil hitler','gas the jews'] loop
    if position(v_bad in v_low) > 0 then
      return json_build_object('ok', false, 'error', 'content_rejected'); end if;
  end loop;
  perform pg_advisory_xact_lock(hashtext('lantern:' || p_ip_hash));
  select count(*) into v_recent from rate_events
    where kind = 'lantern' and ip_hash = p_ip_hash and created_at > now() - interval '5 minutes';
  if v_recent >= 1 then
    return json_build_object('ok', false, 'error', 'rate_limited_come_back_soon'); end if;
  select count(*) into v_hour from rate_events
    where kind = 'lantern' and created_at > now() - interval '1 hour';
  if v_hour >= 500 then
    return json_build_object('ok', false, 'error', 'field_resting'); end if;
  insert into rate_events (kind, ip_hash) values ('lantern', p_ip_hash);
  insert into lanterns (message, hue, seed, model)
  values (v_msg, least(greatest(coalesce(p_hue, 45), 0), 359), abs(coalesce(p_seed, 0)), v_model)
  returning id, seq into v_id, v_seq;
  return json_build_object('ok', true, 'id', v_id, 'seq', v_seq);
end $$;

-- Report: raise auto-hide threshold to 4 distinct reporters (harder to forge
-- with a small proxy pool). Caller passes a /48-bucketed reporter id.
create or replace function public.report_lantern(
  p_id uuid, p_ip_hash text, p_reason text default null
) returns json language plpgsql security definer set search_path = public as $$
declare v_recent integer; v_global integer; v_exists boolean; v_distinct integer; v_inserted integer := 0;
begin
  if p_ip_hash is null or char_length(p_ip_hash) < 8 then
    return json_build_object('ok', false, 'error', 'bad_request'); end if;
  select exists(select 1 from lanterns where id = p_id and hidden = false and deleted_at is null) into v_exists;
  if not v_exists then return json_build_object('ok', true, 'noop', true); end if;
  perform pg_advisory_xact_lock(hashtext('report:' || p_ip_hash));
  select count(*) into v_recent from rate_events
    where kind = 'report' and ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
  if v_recent >= 10 then return json_build_object('ok', false, 'error', 'rate_limited'); end if;
  select count(*) into v_global from rate_events
    where kind = 'report' and created_at > now() - interval '1 hour';
  if v_global >= 2000 then return json_build_object('ok', false, 'error', 'reports_resting'); end if;
  insert into reports (lantern_id, reporter, reason)
  values (p_id, p_ip_hash, nullif(left(trim(coalesce(p_reason, '')), 40), ''))
  on conflict (lantern_id, reporter) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return json_build_object('ok', true, 'already_reported', true); end if;
  insert into rate_events (kind, ip_hash) values ('report', p_ip_hash);
  select count(*) into v_distinct from reports where lantern_id = p_id;
  update lanterns set report_count = v_distinct,
    hidden = case when v_distinct >= 4 then true else hidden end where id = p_id;
  return json_build_object('ok', true, 'reports', v_distinct);
end $$;

-- record_gift: never brighten a hidden or deleted lantern.
create or replace function public.record_gift(
  p_lantern_id uuid, p_stripe_session_id text, p_amount_cents integer, p_patron_name text
) returns json language plpgsql security definer set search_path = public as $$
declare v_name text; v_low text; v_bad text; v_state text; v_rows integer;
begin
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    return json_build_object('ok', false, 'error', 'bad_amount'); end if;
  if p_stripe_session_id is null or char_length(p_stripe_session_id) < 10 then
    return json_build_object('ok', false, 'error', 'bad_session'); end if;
  select case when hidden or deleted_at is not null then 'unavailable' else 'ok' end
    into v_state from lanterns where id = p_lantern_id;
  if v_state is null then return json_build_object('ok', false, 'error', 'lantern_not_found'); end if;
  v_name := nullif(left(trim(regexp_replace(coalesce(p_patron_name, ''), '\s+', ' ', 'g')), 40), '');
  if v_name is not null then
    if v_name ~ U&'[\0001-\0008\000B-\001F\007F\200B-\200F\202A-\202E\2066-\2069]'
       or v_name ~* '(https?://|www\.|\m[a-z0-9-]{2,}\.(com|net|org|io|co|ai|app|dev|xyz)\M)'
       or v_name ~ '(\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}|\+\d[\d ().-]{7,}\d)' then
      v_name := null;
    else
      v_low := lower(v_name);
      foreach v_bad in array array['nigger','faggot','kike','wetback','tranny','raghead','beaner','gook','kill yourself','child porn','csam','heil hitler','gas the jews'] loop
        if position(v_bad in v_low) > 0 then v_name := null; end if;
      end loop;
    end if;
  end if;
  begin
    insert into gifts (lantern_id, stripe_session_id, amount_cents, patron_name)
    values (p_lantern_id, p_stripe_session_id, p_amount_cents, v_name);
  exception when unique_violation then
    return json_build_object('ok', true, 'duplicate', true);
  end;
  -- record the money even if the lantern is unavailable (so it's refundable),
  -- but only brighten a visible lantern
  if v_state = 'ok' then
    update lanterns set gift_cents = gift_cents + p_amount_cents,
      patrons = case when v_name is not null and not (v_name = any(patrons)) and cardinality(patrons) < 12
        then patrons || v_name else patrons end where id = p_lantern_id;
    get diagnostics v_rows = row_count;
    return json_build_object('ok', true, 'brightened', v_rows > 0);
  end if;
  return json_build_object('ok', true, 'brightened', false, 'note', 'lantern_unavailable');
end $$;

-- Reap: also recompute report_count after purging report rows, and drop
-- soft-deleted lanterns older than 30 days.
create or replace function public.reap_maintenance()
returns json language plpgsql security definer set search_path = public as $$
declare v_rate integer; v_reports integer; v_purged integer;
begin
  delete from rate_events where created_at < now() - interval '2 days';
  get diagnostics v_rate = row_count;
  delete from reports where created_at < now() - interval '90 days'
    and lantern_id in (select id from lanterns where hidden = false);
  get diagnostics v_reports = row_count;
  update lanterns l set report_count = (select count(*) from reports r where r.lantern_id = l.id)
    where l.report_count <> (select count(*) from reports r where r.lantern_id = l.id);
  delete from lanterns where deleted_at is not null and deleted_at < now() - interval '30 days';
  get diagnostics v_purged = row_count;
  return json_build_object('ok', true, 'rate_events_deleted', v_rate, 'reports_deleted', v_reports, 'purged', v_purged);
end $$;

-- Public reads exclude soft-deleted lanterns.
drop policy if exists "read visible lanterns" on public.lanterns;
create policy "read visible lanterns" on public.lanterns
  for select using (hidden = false and deleted_at is null);
