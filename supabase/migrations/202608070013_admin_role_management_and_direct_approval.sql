-- PHASE 9: PROTECTED ADMIN MANAGEMENT + DIRECT ADMIN PUBLISHING
-- Primary super admin can switch confirmed registered users between member/admin.
-- Ordinary admins can publish their own additions immediately and moderate requests,
-- but cannot grant or revoke administrator access.

begin;

create schema if not exists private;

-- Audit role changes outside the exposed public schema.
create table if not exists private.admin_role_audit (
  id bigint generated always as identity primary key,
  target_user_id uuid not null,
  previous_role text not null,
  new_role text not null,
  changed_by uuid not null,
  changed_at timestamptz not null default now()
);

revoke all on table private.admin_role_audit from public, anon, authenticated;

create index if not exists admin_role_audit_target_changed_idx
  on private.admin_role_audit (target_user_id, changed_at desc);

-- Only the protected primary administrator can read the temporary user-management list.
create or replace function public.list_registered_users_for_role_management(
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text,
  is_primary_admin boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role = 'super_admin'
      and p.is_primary_admin = true
  ) then
    raise exception 'Not authorized to manage administrators';
  end if;

  return query
  select
    p.id,
    p.email,
    p.display_name,
    p.role,
    p.is_primary_admin,
    p.created_at,
    u.last_sign_in_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.account_status = 'active'
    and u.email_confirmed_at is not null
    and (
      v_search is null
      or coalesce(p.display_name, '') ilike '%' || v_search || '%'
      or coalesce(p.email, '') ilike '%' || v_search || '%'
    )
  order by p.is_primary_admin desc, p.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.list_registered_users_for_role_management(text, integer, integer)
  from public, anon;
grant execute on function public.list_registered_users_for_role_management(text, integer, integer)
  to authenticated;

-- Temporary role switcher: only member/admin until the full RBAC screen is implemented.
create or replace function public.set_basic_user_role(
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_role text;
  v_is_primary boolean;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role = 'super_admin'
      and p.is_primary_admin = true
  ) then
    raise exception 'Only the primary administrator can change administrator access';
  end if;

  if p_role not in ('member', 'admin') then
    raise exception 'Only member/admin roles are available in this temporary role screen';
  end if;

  select p.role, p.is_primary_admin
  into v_previous_role, v_is_primary
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = p_user_id
    and p.account_status = 'active'
    and u.email_confirmed_at is not null
  for update;

  if v_previous_role is null then
    raise exception 'Registered user not found';
  end if;

  if v_is_primary then
    raise exception 'The primary administrator role is protected';
  end if;

  if v_previous_role = p_role then
    return;
  end if;

  update public.profiles
  set role = p_role,
      updated_at = now()
  where id = p_user_id;

  -- Keep authorization metadata server-controlled and synchronized.
  update auth.users
  set raw_app_meta_data =
    (coalesce(raw_app_meta_data, '{}'::jsonb) - 'is_primary_admin')
    || jsonb_build_object('app_role', p_role)
  where id = p_user_id;

  insert into private.admin_role_audit(target_user_id, previous_role, new_role, changed_by)
  values (p_user_id, v_previous_role, p_role, auth.uid());
end;
$$;

revoke all on function public.set_basic_user_role(uuid, text)
  from public, anon;
grant execute on function public.set_basic_user_role(uuid, text)
  to authenticated;

-- Administrators may INSERT already-approved public records they create themselves.
-- Members keep the existing pending-only policies from earlier migrations.
drop policy if exists "Admins can directly publish families" on public.families;
create policy "Admins can directly publish families"
on public.families for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'approved'
  and approved_by = (select auth.uid())
  and approved_at is not null
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

drop policy if exists "Admins can directly publish people" on public.people;
create policy "Admins can directly publish people"
on public.people for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'approved'
  and approved_by = (select auth.uid())
  and approved_at is not null
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

drop policy if exists "Admins can directly publish events" on public.events;
create policy "Admins can directly publish events"
on public.events for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'approved'
  and approved_by = (select auth.uid())
  and approved_at is not null
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

drop policy if exists "Admins can directly publish relationships" on public.person_relationships;
create policy "Admins can directly publish relationships"
on public.person_relationships for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'approved'
  and approved_by = (select auth.uid())
  and approved_at is not null
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

drop policy if exists "Admins can directly publish memberships" on public.person_family_memberships;
create policy "Admins can directly publish memberships"
on public.person_family_memberships for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'approved'
  and approved_by = (select auth.uid())
  and approved_at is not null
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

notify pgrst, 'reload schema';

commit;
