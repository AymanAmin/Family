-- The trigger helper is invoked only by PostgreSQL and must not be callable as an RPC.
revoke all on function public.enforce_person_photo_admin_only() from public, anon, authenticated;
