-- Round 4: keep gift records refundable across lantern deletion, cap the
-- rebuilt patrons array, restore the not-found guard.

-- Preserve gift rows when a lantern is purged (so refunds/records survive),
-- instead of cascade-deleting the money trail.
alter table public.gifts alter column lantern_id drop not null;
alter table public.gifts drop constraint if exists gifts_lantern_id_fkey;
alter table public.gifts
  add constraint gifts_lantern_id_fkey
  foreign key (lantern_id) references public.lanterns(id) on delete set null;

create or replace function public.record_gift(
  p_lantern_id uuid, p_stripe_session_id text, p_amount_cents integer, p_patron_name text, p_payment_intent text default null
) returns json language plpgsql security definer set search_path = public as $$
declare v_name text; v_low text; v_bad text; v_state text; v_rows integer; v_target uuid;
begin
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    return json_build_object('ok', false, 'error', 'bad_amount'); end if;
  if p_stripe_session_id is null or char_length(p_stripe_session_id) < 10 then
    return json_build_object('ok', false, 'error', 'bad_session'); end if;
  select case when hidden or deleted_at is not null then 'unavailable' else 'ok' end
    into v_state from lanterns where id = p_lantern_id;
  -- if the lantern is gone, detach the gift (lantern_id null) so it is still
  -- recorded and refundable rather than throwing a foreign-key violation
  v_target := case when v_state is null then null else p_lantern_id end;

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
    values (v_target, p_stripe_session_id, p_amount_cents, v_name, p_payment_intent);
  exception
    when unique_violation then
      return json_build_object('ok', true, 'duplicate', true);
    when foreign_key_violation then
      -- lantern vanished between the check and insert — detach and record
      insert into gifts (lantern_id, stripe_session_id, amount_cents, patron_name, payment_intent)
      values (null, p_stripe_session_id, p_amount_cents, v_name, p_payment_intent)
      on conflict (stripe_session_id) do nothing;
      return json_build_object('ok', true, 'brightened', false, 'note', 'lantern_unavailable');
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

-- Cap the rebuilt patrons array to 12 (matching record_gift's invariant) and
-- support partial reversals (adjust by a delta rather than always zeroing).
create or replace function public.reverse_gift_pi(p_payment_intent text, p_refund_cents integer default null) returns json
language plpgsql security definer set search_path = public as $$
declare v_gift record; v_new_cents integer; v_names text[]; v_full boolean;
begin
  if p_payment_intent is null then return json_build_object('ok', false, 'error', 'no_pi'); end if;
  select * into v_gift from gifts where payment_intent = p_payment_intent order by created_at limit 1;
  if v_gift.id is null then return json_build_object('ok', false, 'error', 'gift_not_found'); end if;
  if v_gift.reversed then return json_build_object('ok', true, 'already_reversed', true); end if;
  -- full reversal unless a smaller partial refund amount is given
  v_full := p_refund_cents is null or p_refund_cents >= v_gift.amount_cents;
  if v_full then
    update gifts set reversed = true where id = v_gift.id;
  else
    update gifts set amount_cents = greatest(amount_cents - p_refund_cents, 0) where id = v_gift.id;
  end if;
  if v_gift.lantern_id is not null then
    select coalesce(sum(amount_cents), 0) into v_new_cents from gifts where lantern_id = v_gift.lantern_id and not reversed;
    select coalesce((array_agg(distinct patron_name) filter (where patron_name is not null))[1:12], '{}') into v_names
      from gifts where lantern_id = v_gift.lantern_id and not reversed;
    update lanterns set gift_cents = greatest(v_new_cents, 0), patrons = v_names where id = v_gift.lantern_id;
  end if;
  return json_build_object('ok', true, 'lantern_id', v_gift.lantern_id, 'full', v_full);
end $$;
revoke all on function public.reverse_gift_pi(text, integer) from public, anon, authenticated;
grant execute on function public.reverse_gift_pi(text, integer) to service_role;
drop function if exists public.reverse_gift_pi(text);
drop function if exists public.reverse_gift(text);

-- record whether the external classifier is configured, for /admin + /health
insert into public.settings (key, value) values ('classifier', 'false'::jsonb)
  on conflict (key) do nothing;
create or replace function public.set_classifier(p_on boolean) returns void
language sql security definer set search_path = public as $$
  update settings set value = to_jsonb(p_on) where key = 'classifier';
$$;
revoke all on function public.set_classifier(boolean) from public, anon, authenticated;
grant execute on function public.set_classifier(boolean) to service_role;
create or replace function public.get_settings_public() returns json
language sql security definer set search_path = public stable as $$
  select json_object_agg(key, value) from settings where key in ('accepting','classifier','visible_count');
$$;
grant execute on function public.get_settings_public() to service_role;
