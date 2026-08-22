-- Gifts touch money-backed display state: only the server (service role,
-- key held in Vercel env only) may record them. The public anon key cannot.
revoke execute on function public.record_gift(uuid, text, integer, text) from anon, authenticated, public;
grant execute on function public.record_gift(uuid, text, integer, text) to service_role;
