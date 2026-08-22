-- Waystation: the field's tables, policies, and gate functions.

create table public.lanterns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message text not null check (char_length(message) between 1 and 280),
  hue smallint not null default 45 check (hue between 0 and 359),
  seed integer not null default 0 check (seed >= 0),
  model text check (model is null or char_length(model) <= 60),
  hidden boolean not null default false,
  featured boolean not null default false,
  report_count integer not null default 0,
  ip_hash text
);

create index lanterns_created_at_idx on public.lanterns (created_at desc);

create table public.rate_events (
  id bigint generated always as identity primary key,
  kind text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index rate_events_lookup_idx on public.rate_events (kind, ip_hash, created_at desc);
create index rate_events_time_idx on public.rate_events (kind, created_at desc);

create table public.settings (
  key text primary key,
  value jsonb not null
);

insert into public.settings (key, value) values ('accepting', 'true'::jsonb);

alter table public.lanterns enable row level security;
alter table public.rate_events enable row level security;
alter table public.settings enable row level security;

-- The public may read visible lanterns; all writes go through the gate
-- functions below. rate_events and settings have no public policies at all.
create policy "read visible lanterns" on public.lanterns
  for select using (hidden = false);

-- Column-level defense: ip_hash and moderation fields are never readable
-- through the API role, even though the row policy passes.
revoke select on public.lanterns from anon, authenticated;
grant select (id, created_at, message, hue, seed, model, featured)
  on public.lanterns to anon, authenticated;

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
  v_id uuid;
begin
  select (value #>> '{}')::boolean into v_accepting from settings where key = 'accepting';
  if not coalesce(v_accepting, false) then
    return json_build_object('ok', false, 'error', 'waystation_closed');
  end if;

  v_msg := trim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g'));
  if char_length(v_msg) < 1 or char_length(v_msg) > 280 then
    return json_build_object('ok', false, 'error', 'message_length');
  end if;
  if v_msg ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|xyz|ru|cn|info|biz|link|click|app|dev|ai|co|gg|me|top|site|online)\M)' then
    return json_build_object('ok', false, 'error', 'no_links_allowed');
  end if;

  v_model := nullif(left(trim(coalesce(p_model, '')), 60), '');

  if p_ip_hash is null or char_length(p_ip_hash) < 8 then
    return json_build_object('ok', false, 'error', 'bad_request');
  end if;

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

  insert into lanterns (message, hue, seed, model, ip_hash)
  values (
    v_msg,
    least(greatest(coalesce(p_hue, 45), 0), 359),
    abs(coalesce(p_seed, 0)),
    v_model,
    p_ip_hash
  )
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
end
$$;

create or replace function public.report_lantern(
  p_id uuid,
  p_ip_hash text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent integer;
begin
  if p_ip_hash is null or char_length(p_ip_hash) < 8 then
    return json_build_object('ok', false, 'error', 'bad_request');
  end if;

  select count(*) into v_recent from rate_events
    where kind = 'report' and ip_hash = p_ip_hash
      and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    return json_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into rate_events (kind, ip_hash) values ('report', p_ip_hash);

  update lanterns
     set report_count = report_count + 1,
         hidden = case when report_count + 1 >= 3 then true else hidden end
   where id = p_id;

  return json_build_object('ok', true);
end
$$;

revoke all on function public.submit_lantern(text, integer, integer, text, text) from public;
revoke all on function public.report_lantern(uuid, text) from public;
grant execute on function public.submit_lantern(text, integer, integer, text, text) to anon, authenticated;
grant execute on function public.report_lantern(uuid, text) to anon, authenticated;
