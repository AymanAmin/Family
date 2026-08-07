-- SECURITY HARDENING: edit requests must only be created through request_content_edit().
begin;

revoke insert on table public.content_edit_requests from authenticated;
drop policy if exists "Members can submit edit requests" on public.content_edit_requests;

-- The SECURITY DEFINER RPC remains the only write entry point for owners.
grant execute on function public.request_content_edit(text, uuid, jsonb) to authenticated;

commit;
