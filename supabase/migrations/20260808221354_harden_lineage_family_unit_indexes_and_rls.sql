begin;

create index if not exists lineages_created_by_idx on public.lineages(created_by);
create index if not exists lineages_approved_by_idx on public.lineages(approved_by) where approved_by is not null;
create index if not exists lineage_branches_created_by_idx on public.lineage_branches(created_by);
create index if not exists lineage_branches_approved_by_idx on public.lineage_branches(approved_by) where approved_by is not null;
create index if not exists family_units_created_by_idx on public.family_units(created_by);
create index if not exists family_units_approved_by_idx on public.family_units(approved_by) where approved_by is not null;

-- Keep SELECT in one policy per authenticated role; split admin writes by action.
drop policy if exists "Admins can manage lineages" on public.lineages;
drop policy if exists "Admins can insert lineages" on public.lineages;
drop policy if exists "Admins can update lineages" on public.lineages;
drop policy if exists "Admins can delete lineages" on public.lineages;
create policy "Admins can insert lineages" on public.lineages for insert to authenticated
with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')));
create policy "Admins can update lineages" on public.lineages for update to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')))
with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')));
create policy "Admins can delete lineages" on public.lineages for delete to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')));

drop policy if exists "Admins can manage lineage branches" on public.lineage_branches;
drop policy if exists "Admins can insert lineage branches" on public.lineage_branches;
drop policy if exists "Admins can update lineage branches" on public.lineage_branches;
drop policy if exists "Admins can delete lineage branches" on public.lineage_branches;
create policy "Admins can insert lineage branches" on public.lineage_branches for insert to authenticated
with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')));
create policy "Admins can update lineage branches" on public.lineage_branches for update to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')))
with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')));
create policy "Admins can delete lineage branches" on public.lineage_branches for delete to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')));

drop policy if exists "Admins can manage family units" on public.family_units;
drop policy if exists "Admins can insert family units" on public.family_units;
drop policy if exists "Admins can update family units" on public.family_units;
drop policy if exists "Admins can delete family units" on public.family_units;
create policy "Admins can insert family units" on public.family_units for insert to authenticated
with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')));
create policy "Admins can update family units" on public.family_units for update to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')))
with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')));
create policy "Admins can delete family units" on public.family_units for delete to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')));

notify pgrst,'reload schema';
commit;
