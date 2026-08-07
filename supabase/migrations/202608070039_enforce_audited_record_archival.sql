-- Prevent administrators from bypassing the archive audit trail through a direct table UPDATE.
-- The SECURITY DEFINER archive_community_record RPC remains the only supported path to status='archived'.

drop policy if exists "Admins can manage families" on public.families;
create policy "Admins can manage families"
on public.families for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid())
    and p.account_status = 'active'
    and p.role in ('admin', 'super_admin')
))
with check (
  status <> 'archived'
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

drop policy if exists "Admins can manage people" on public.people;
create policy "Admins can manage people"
on public.people for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid())
    and p.account_status = 'active'
    and p.role in ('admin', 'super_admin')
))
with check (
  status <> 'archived'
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

notify pgrst, 'reload schema';
