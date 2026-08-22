-- Waystation hardening: close the write path, make moderation real, make
-- positions stable, and stop retaining reversible personal data.
-- Addresses the launch audit (security, trust & safety, database, privacy).

-- 1. Stable spiral index. Positions must never depend on which window the
--    client fetched, and must never move when new lanterns arrive.
alter table public.lanterns
  add column if not exists seq bigint generated always as identity,
  add column if not exists seeded boolean not null default false;

update public.lanterns set seeded = true where ip_hash = 'seed_launch_night';

grant select (seq, seeded) on public.lanterns to anon, authenticated;

-- 2. Privacy: nothing reads lanterns.ip_hash (rate limiting uses rate_events).
--    A salted hash of an IP is reversible personal data; do not retain it.
alter table public.lanterns drop column if exists ip_hash;

-- 3. Real distinct-reporter moderation, enforced by a primary key.
create table if not exists public.reports (
  lantern_id uuid not null references public.lanterns(id) on delete cascade,
  reporter text not null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (lantern_id, reporter)
);
alter table public.reports enable row level security;

-- 4. Gifts must be removable with their lantern (illegal content takedown).
alter table public.gifts drop constraint if exists gifts_lantern_id_fkey;
alter table public.gifts
  add constraint gifts_lantern_id_fkey
  foreign key (lantern_id) references public.lanterns(id) on delete cascade;

-- 5. A separate readable switch so the field can be darkened without a deploy.
insert into public.settings (key, value)
  values ('readable', 'true'::jsonb)
  on conflict (key) do nothing;

-- 6. Rewrite submit_lantern: advisory lock closes the check-then-insert race;
--    a defense-in-depth blocklist runs at the true trust boundary; the caller
--    identity is trusted because only service_role may execute this now.
create or replace function public.submit_lantern(
  p_message text,
  p_hue integer,
  p_seed integer,
  p_model text,
  p_ip_hash text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_accepting boolean;
  v_recent integer;
  v_hour integer;
  v_msg text;
  v_model text;
  v_low text;
  v_id uuid;
  v_seq bigint;
  v_bad text;
begin
  select (value #>> '{}')::boolean into v_accepting from settings where key = 'accepting';
  if not coalesce(v_accepting, false) then
    return json_build_object('ok', false, 'error', 'waystation_closed');
  end if;

  if p_ip_hash is null or char_length(p_ip_hash) < 8 then
    return json_build_object('ok', false, 'error', 'bad_request');
  end if;

  v_msg := trim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g'));
  if char_length(v_msg) < 1 or char_length(v_msg) > 280 then
    return json_build_object('ok', false, 'error', 'message_length');
  end if;
  if v_msg ~ U&'[\0001-\0008\000B-\001F\007F\200B-\200F\202A-\202E\2066-\2069]' then
    return json_build_object('ok', false, 'error', 'invalid_characters');
  end if;
  if v_msg ~* '(https?://|www\.|\m[a-z0-9-]+\.[a-z]{2,24}\M|\m\d{1,3}(\.\d{1,3}){3}\M)' then
    return json_build_object('ok', false, 'error', 'no_links_allowed');
  end if;

  v_model := nullif(left(trim(coalesce(p_model, '')), 60), '');
  if v_model is not null and v_model !~ '^[A-Za-z0-9 ._()\-]{1,60}$' then
    return json_build_object('ok', false, 'error', 'invalid_model');
  end if;

  v_low := lower(v_msg || ' ' || coalesce(v_model, ''));
  foreach v_bad in array array[
    'nigger','faggot','kike','wetback','tranny','raghead','beaner','gook',
    'kill yourself','child porn','csam','heil hitler','gas the jews'
  ] loop
    if position(v_bad in v_low) > 0 then
      return json_build_object('ok', false, 'error', 'content_rejected');
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtext('lantern:' || p_ip_hash));

  select count(*) into v_recent from rate_events
    where kind = 'lantern' and ip_hash = p_ip_hash
      and created_at > now() - interval '5 minutes';
  if v_recent >= 1 then
    return json_build_object('ok', false, 'error', 'rate_limited_come_back_soon');
  end if;

  select count(*) into v_hour from rate_events
    where kind = 'lantern' and created_at > now() - interval '1 hour';
  if v_hour >= 500 then
    return json_build_object('ok', false, 'error', 'field_resting');
  end if;

  insert into rate_events (kind, ip_hash) values ('lantern', p_ip_hash);

  insert into lanterns (message, hue, seed, model)
  values (
    v_msg,
    least(greatest(coalesce(p_hue, 45), 0), 359),
    abs(coalesce(p_seed, 0)),
    v_model
  )
  returning id, seq into v_id, v_seq;

  return json_build_object('ok', true, 'id', v_id, 'seq', v_seq);
end
$$;

-- 7. Rewrite report_lantern: distinct reporters (PK), a global cap, and an
--    existence check. It still works while the field is closed to new writes.
create or replace function public.report_lantern(
  p_id uuid,
  p_ip_hash text,
  p_reason text default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent integer;
  v_global integer;
  v_exists boolean;
  v_distinct integer;
  v_inserted integer := 0;
begin
  if p_ip_hash is null or char_length(p_ip_hash) < 8 then
    return json_build_object('ok', false, 'error', 'bad_request');
  end if;

  select exists(select 1 from lanterns where id = p_id and hidden = false) into v_exists;
  if not v_exists then
    return json_build_object('ok', true, 'noop', true);
  end if;

  perform pg_advisory_xact_lock(hashtext('report:' || p_ip_hash));

  select count(*) into v_recent from rate_events
    where kind = 'report' and ip_hash = p_ip_hash
      and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    return json_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select count(*) into v_global from rate_events
    where kind = 'report' and created_at > now() - interval '1 hour';
  if v_global >= 2000 then
    return json_build_object('ok', false, 'error', 'reports_resting');
  end if;

  insert into reports (lantern_id, reporter, reason)
  values (p_id, p_ip_hash, nullif(left(trim(coalesce(p_reason, '')), 40), ''))
  on conflict (lantern_id, reporter) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return json_build_object('ok', true, 'already_reported', true);
  end if;

  insert into rate_events (kind, ip_hash) values ('report', p_ip_hash);

  select count(*) into v_distinct from reports where lantern_id = p_id;

  update lanterns
     set report_count = v_distinct,
         hidden = case when v_distinct >= 3 then true else hidden end
   where id = p_id;

  return json_build_object('ok', true, 'reports', v_distinct);
end
$$;

-- 8. Rewrite record_gift: sanitize the patron name at the true boundary, and
--    never brighten a lantern that no longer exists / is hidden.
create or replace function public.record_gift(
  p_lantern_id uuid,
  p_stripe_session_id text,
  p_amount_cents integer,
  p_patron_name text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_low text;
  v_bad text;
  v_visible boolean;
  v_rows integer;
begin
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    return json_build_object('ok', false, 'error', 'bad_amount');
  end if;
  if p_stripe_session_id is null or char_length(p_stripe_session_id) < 10 then
    return json_build_object('ok', false, 'error', 'bad_session');
  end if;

  select (hidden = false) into v_visible from lanterns where id = p_lantern_id;
  if v_visible is null then
    return json_build_object('ok', false, 'error', 'lantern_not_found');
  end if;

  v_name := nullif(left(trim(regexp_replace(coalesce(p_patron_name, ''), '\s+', ' ', 'g')), 40), '');
  if v_name is not null then
    if v_name ~ U&'[\0001-\0008\000B-\001F\007F\200B-\200F\202A-\202E\2066-\2069]'
       or v_name ~* '(https?://|www\.|\m[a-z0-9-]+\.[a-z]{2,24}\M|\m\d{1,3}(\.\d{1,3}){3}\M)' then
      v_name := null;
    else
      v_low := lower(v_name);
      foreach v_bad in array array[
        'nigger','faggot','kike','wetback','tranny','raghead','beaner','gook',
        'kill yourself','child porn','csam','heil hitler','gas the jews'
      ] loop
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

  update lanterns
     set gift_cents = gift_cents + p_amount_cents,
         patrons = case
           when v_name is not null and not (v_name = any(patrons)) and cardinality(patrons) < 12
             then patrons || v_name
           else patrons
         end
   where id = p_lantern_id;
  get diagnostics v_rows = row_count;

  return json_build_object('ok', true, 'brightened', v_rows > 0);
end
$$;

-- 9. Close the write path: only the server (service_role) may mutate.
drop function if exists public.report_lantern(uuid, text);
revoke execute on function public.submit_lantern(text, integer, integer, text, text) from anon, authenticated, public;
revoke execute on function public.report_lantern(uuid, text, text) from anon, authenticated, public;
grant execute on function public.submit_lantern(text, integer, integer, text, text) to service_role;
grant execute on function public.report_lantern(uuid, text, text) to service_role;

-- 10. Revoke all direct table writes from the public roles.
revoke insert, update, delete on public.lanterns from anon, authenticated;
revoke insert, update, delete on public.settings from anon, authenticated;
revoke insert, update, delete on public.gifts from anon, authenticated;
revoke insert, update, delete on public.rate_events from anon, authenticated;
revoke select on public.settings from anon, authenticated;
revoke select on public.rate_events from anon, authenticated;
revoke select on public.reports from anon, authenticated;

alter table public.lanterns force row level security;
alter table public.settings force row level security;
alter table public.gifts force row level security;
alter table public.rate_events force row level security;
alter table public.reports force row level security;
