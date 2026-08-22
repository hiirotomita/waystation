-- Store the Stripe PaymentIntent on each gift so charge-level events
-- (refund/dispute) can be matched back to the gift and reversed.

alter table public.gifts add column if not exists payment_intent text;

create or replace function public.record_gift(
  p_lantern_id uuid, p_stripe_session_id text, p_amount_cents integer, p_patron_name text, p_payment_intent text default null
) returns json language plpgsql security definer set search_path = public as $$
declare v_name text; v_low text; v_bad text; v_state text; v_rows integer;
begin
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    return json_build_object('ok', false, 'error', 'bad_amount'); end if;
  if p_stripe_session_id is null or char_length(p_stripe_session_id) < 10 then
    return json_build_object('ok', false, 'error', 'bad_session'); end if;
  select case when hidden or deleted_at is not null then 'unavailable' else 'ok' end
    into v_state from lanterns where id = p_lantern_id;
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
    insert into gifts (lantern_id, stripe_session_id, amount_cents, patron_name, payment_intent)
    values (p_lantern_id, p_stripe_session_id, p_amount_cents, v_name, p_payment_intent);
  exception when unique_violation then
    return json_build_object('ok', true, 'duplicate', true);
  end;
  if v_state = 'ok' then
    update lanterns set gift_cents = gift_cents + p_amount_cents,
      patrons = case when v_name is not null and not (v_name = any(patrons)) and cardinality(patrons) < 12
        then patrons || v_name else patrons end where id = p_lantern_id;
    get diagnostics v_rows = row_count;
    return json_build_object('ok', true, 'brightened', v_rows > 0);
  end if;
  return json_build_object('ok', true, 'brightened', false, 'note', 'lantern_unavailable');
end $$;
revoke all on function public.record_gift(uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.record_gift(uuid, text, integer, text, text) to service_role;

create or replace function public.reverse_gift_pi(p_payment_intent text) returns json
language plpgsql security definer set search_path = public as $$
declare v_gift record; v_new_cents integer; v_names text[];
begin
  if p_payment_intent is null then return json_build_object('ok', false, 'error', 'no_pi'); end if;
  select * into v_gift from gifts where payment_intent = p_payment_intent order by created_at limit 1;
  if v_gift.id is null then return json_build_object('ok', false, 'error', 'gift_not_found'); end if;
  if v_gift.reversed then return json_build_object('ok', true, 'already_reversed', true); end if;
  update gifts set reversed = true where id = v_gift.id;
  select coalesce(sum(amount_cents), 0) into v_new_cents from gifts where lantern_id = v_gift.lantern_id and not reversed;
  select coalesce(array_agg(distinct patron_name) filter (where patron_name is not null), '{}') into v_names
    from gifts where lantern_id = v_gift.lantern_id and not reversed;
  update lanterns set gift_cents = greatest(v_new_cents, 0), patrons = v_names where id = v_gift.lantern_id;
  return json_build_object('ok', true, 'lantern_id', v_gift.lantern_id, 'new_cents', v_new_cents);
end $$;
revoke all on function public.reverse_gift_pi(text) from public, anon, authenticated;
grant execute on function public.reverse_gift_pi(text) to service_role;

drop function if exists public.record_gift(uuid, text, integer, text);
