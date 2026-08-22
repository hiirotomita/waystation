-- Round 5: urgent reports hide at 2 distinct urgent reporters (respecting
-- report_immune, atomic in the RPC); partial-refund-correct gift reversal.
drop function if exists public.reverse_gift_pi(text, integer);
drop function if exists public.reverse_gift_pi(text);

create or replace function public.report_lantern(
  p_id uuid, p_ip_hash text, p_reason text default null
) returns json language plpgsql security definer set search_path = public as $$
declare v_recent integer; v_global integer; v_row record; v_distinct integer; v_urgent integer; v_inserted integer := 0; v_hidden boolean := false;
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
  select count(*) into v_urgent from reports where lantern_id = p_id and reason = 'harmful_illegal';
  if (v_distinct >= 4 or v_urgent >= 2) and not v_row.report_immune then
    update lanterns set report_count = v_distinct, hidden = true where id = p_id;
    v_hidden := true;
    insert into moderation_log (action, lantern_id, note)
      values ('auto_hide', p_id, v_distinct || ' reports (' || v_urgent || ' urgent)');
  else
    update lanterns set report_count = v_distinct where id = p_id;
  end if;
  return json_build_object('ok', true, 'reports', v_distinct, 'urgent', v_urgent, 'hidden', v_hidden);
end $$;
revoke all on function public.report_lantern(uuid, text, text) from public, anon, authenticated;
grant execute on function public.report_lantern(uuid, text, text) to service_role;

alter table public.gifts add column if not exists refunded_cents integer not null default 0;

create function public.reverse_gift_pi(p_payment_intent text, p_total_refunded_cents integer default null) returns json
language plpgsql security definer set search_path = public as $$
declare v_gift record; v_new_cents integer; v_names text[]; v_refunded integer;
begin
  if p_payment_intent is null then return json_build_object('ok', false, 'error', 'no_pi'); end if;
  select * into v_gift from gifts where payment_intent = p_payment_intent order by created_at limit 1;
  if v_gift.id is null then return json_build_object('ok', false, 'error', 'gift_not_found'); end if;
  v_refunded := coalesce(p_total_refunded_cents, v_gift.amount_cents);
  v_refunded := least(greatest(v_refunded, v_gift.refunded_cents), v_gift.amount_cents);
  update gifts set refunded_cents = v_refunded, reversed = (v_refunded >= amount_cents) where id = v_gift.id;
  if v_gift.lantern_id is not null then
    select coalesce(sum(greatest(amount_cents - refunded_cents, 0)), 0) into v_new_cents
      from gifts where lantern_id = v_gift.lantern_id;
    select coalesce((array_agg(distinct patron_name) filter (where patron_name is not null and amount_cents - refunded_cents > 0))[1:12], '{}') into v_names
      from gifts where lantern_id = v_gift.lantern_id;
    update lanterns set gift_cents = greatest(v_new_cents, 0), patrons = v_names where id = v_gift.lantern_id;
  end if;
  return json_build_object('ok', true, 'lantern_id', v_gift.lantern_id, 'refunded', v_refunded);
end $$;
revoke all on function public.reverse_gift_pi(text, integer) from public, anon, authenticated;
grant execute on function public.reverse_gift_pi(text, integer) to service_role;
