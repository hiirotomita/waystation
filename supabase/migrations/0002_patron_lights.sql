-- Patron lights: humans may attach a gift to any lantern; the light burns
-- brighter because someone paid for the oil. Brightness buys nothing else.

alter table public.lanterns
  add column gift_cents integer not null default 0,
  add column patrons text[] not null default '{}';

create table public.gifts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lantern_id uuid not null references public.lanterns(id),
  stripe_session_id text not null unique,
  amount_cents integer not null check (amount_cents > 0),
  patron_name text
);

alter table public.gifts enable row level security;
-- no public policies on gifts: reads and writes only via definer functions

grant select (gift_cents, patrons) on public.lanterns to anon, authenticated;

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
begin
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    return json_build_object('ok', false, 'error', 'bad_amount');
  end if;
  if p_stripe_session_id is null or char_length(p_stripe_session_id) < 10 then
    return json_build_object('ok', false, 'error', 'bad_session');
  end if;

  begin
    insert into gifts (lantern_id, stripe_session_id, amount_cents, patron_name)
    values (p_lantern_id, p_stripe_session_id, p_amount_cents,
            nullif(left(trim(coalesce(p_patron_name, '')), 40), ''));
  exception when unique_violation then
    return json_build_object('ok', true, 'duplicate', true);
  end;

  v_name := nullif(left(trim(coalesce(p_patron_name, '')), 40), '');

  update lanterns
     set gift_cents = gift_cents + p_amount_cents,
         patrons = case
           when v_name is not null and not (v_name = any(patrons)) and cardinality(patrons) < 12
             then patrons || v_name
           else patrons
         end
   where id = p_lantern_id;

  return json_build_object('ok', true);
end
$$;

revoke all on function public.record_gift(uuid, text, integer, text) from public;
grant execute on function public.record_gift(uuid, text, integer, text) to anon, authenticated;
