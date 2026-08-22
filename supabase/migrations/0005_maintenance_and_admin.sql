-- Scheduled maintenance + an append-only moderation audit log.

create or replace function public.reap_maintenance()
returns json language plpgsql security definer set search_path = public as $$
declare v_rate integer; v_reports integer;
begin
  delete from rate_events where created_at < now() - interval '2 days';
  get diagnostics v_rate = row_count;
  delete from reports where created_at < now() - interval '90 days'
    and lantern_id in (select id from lanterns where hidden = false);
  get diagnostics v_reports = row_count;
  return json_build_object('ok', true, 'rate_events_deleted', v_rate, 'reports_deleted', v_reports);
end $$;
revoke all on function public.reap_maintenance() from public, anon, authenticated;
grant execute on function public.reap_maintenance() to service_role;

create table if not exists public.moderation_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  action text not null,
  lantern_id uuid,
  note text
);
alter table public.moderation_log enable row level security;
revoke all on public.moderation_log from anon, authenticated;
