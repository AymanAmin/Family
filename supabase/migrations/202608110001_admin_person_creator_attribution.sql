-- Exposes person-creation attribution only to platform administrators.
-- This keeps profile data protected by RLS for regular members while allowing
-- admins to audit who originally added a person record.

create or replace function public.get_admin_person_creator_attribution(p_person_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  role text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin', 'super_admin')
      and p.account_status = 'active'
  ) then
    raise exception 'Not authorized to view creator attribution.' using errcode = '42501';
  end if;

  return query
  select
    pe.created_by,
    coalesce(nullif(btrim(pr.display_name), ''), nullif(btrim(pr.email), ''), 'مستخدم مسجل') as display_name,
    pr.email,
    coalesce(pr.role, 'member') as role,
    pe.created_at
  from public.people pe
  left join public.profiles pr on pr.id = pe.created_by
  where pe.id = p_person_id
  limit 1;
end;
$$;

revoke all on function public.get_admin_person_creator_attribution(uuid) from public;
revoke all on function public.get_admin_person_creator_attribution(uuid) from anon;
grant execute on function public.get_admin_person_creator_attribution(uuid) to authenticated;

comment on function public.get_admin_person_creator_attribution(uuid) is
  'Admin-only audit helper returning the account that originally created a person record.';
