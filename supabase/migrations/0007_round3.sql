-- Round 3: break report re-hide loops, atomic hold, gift reversal, cheap count.

alter table public.lanterns add column if not exists report_immune boolean not null default false;
alter table public.gifts add column if not exists reversed boolean not null default false;

-- Maintained visible count so the public GET never runs an O(n) COUNT scan.
insert into public.settings (key, value)
  values ('visible_count', to_jsonb((select count(*) from lanterns where hidden = false and deleted_at is null)))
  on conflict (key) do update set value = excluded.value;

create or replace function public.sync_visible_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update settings set value = to_jsonb((select count(*) from lanterns where hidden = false and deleted_at is null))
    where key = 'visible_count';
  return null;
end $$;
drop trigger if exists trg_visible_count on public.lanterns;
create trigger trg_visible_count after insert or update or delete on public.lanterns
  for each statement execute function public.sync_visible_count();

create or replace function public.get_visible_count() returns bigint
language sql security definer set search_path = public stable as $$
  select coalesce((value #>> '{}')::bigint, 0) from settings where key = 'visible_count';
$$;
grant execute on function public.get_visible_count() to anon, authenticated, service_role;

-- submit_lantern gains a hold flag so held content is NEVER briefly public.
create or replace function public.submit_lantern(
  p_message text, p_hue integer, p_seed integer, p_model text, p_ip_hash text, p_hold boolean default false
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
  if v_msg ~* '(https?://|www\.[a-z0-9-]|[a-z0-9-]+\.[a-z]{2,24}/|\m[a-z0-9-]{2,}\.(com|net|org|info|xyz|online|site|shop|store|click|link|app|dev|cloud|tech|live|io|co|ai|gg|me|tv|cc|biz|pro|page|blog)\M|\m\d{1,3}(\.\d{1,3}){3}\M|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})' then
    return json_build_object('ok', false, 'error', 'no_links_allowed'); end if;
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
  insert into lanterns (message, hue, seed, model, hidden)
  values (v_msg, least(greatest(coalesce(p_hue, 45), 0), 359), abs(coalesce(p_seed, 0)), v_model, coalesce(p_hold, false))
  returning id, seq into v_id, v_seq;
  return json_build_object('ok', true, 'id', v_id, 'seq', v_seq);
end $$;
revoke all on function public.submit_lantern(text, integer, integer, text, text, boolean) from public, anon, authenticated;
grant execute on function public.submit_lantern(text, integer, integer, text, text, boolean) to service_role;

-- report_lantern: never auto-hide a lantern an operator has cleared (immune),
-- and log the auto-hide to moderation_log.
create or replace function public.report_lantern(
  p_id uuid, p_ip_hash text, p_reason text default null
) returns json language plpgsql security definer set search_path = public as $$
declare v_recent integer; v_global integer; v_row record; v_distinct integer; v_inserted integer := 0;
begin
  if p_ip_hash is null or char_length(p_ip_hash) < 8 then
    return json_build_object('ok', false, 'error', 'bad_request'); end if;
  select id, report_immune into v_row from lanterns where id = p_id and hidden = false and deleted_at is null;
  if v_row.id is null then return json_build_object('ok', true, 'noop', true); end if;
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
  if v_distinct >= 4 and not v_row.report_immune then
    update lanterns set report_count = v_distinct, hidden = true where id = p_id;
    insert into moderation_log (action, lantern_id, note) values ('auto_hide', p_id, 'reached ' || v_distinct || ' distinct reports');
  else
    update lanterns set report_count = v_distinct where id = p_id;
  end if;
  return json_build_object('ok', true, 'reports', v_distinct);
end $$;
revoke all on function public.report_lantern(uuid, text, text) from public, anon, authenticated;
grant execute on function public.report_lantern(uuid, text, text) to service_role;

-- Reverse a gift on refund/dispute: dim the lantern and rebuild the patron list
-- from the remaining non-reversed gifts.
create or replace function public.reverse_gift(p_session_id text) returns json
language plpgsql security definer set search_path = public as $$
declare v_gift record; v_new_cents integer; v_names text[];
begin
  select * into v_gift from gifts where stripe_session_id = p_session_id;
  if v_gift.id is null then return json_build_object('ok', false, 'error', 'gift_not_found'); end if;
  if v_gift.reversed then return json_build_object('ok', true, 'already_reversed', true); end if;
  update gifts set reversed = true where id = v_gift.id;
  select coalesce(sum(amount_cents), 0) into v_new_cents from gifts
    where lantern_id = v_gift.lantern_id and not reversed;
  select coalesce(array_agg(distinct patron_name) filter (where patron_name is not null), '{}') into v_names
    from gifts where lantern_id = v_gift.lantern_id and not reversed;
  update lanterns set gift_cents = greatest(v_new_cents, 0), patrons = v_names where id = v_gift.lantern_id;
  return json_build_object('ok', true, 'lantern_id', v_gift.lantern_id, 'new_cents', v_new_cents);
end $$;
revoke all on function public.reverse_gift(text) from public, anon, authenticated;
grant execute on function public.reverse_gift(text) to service_role;
