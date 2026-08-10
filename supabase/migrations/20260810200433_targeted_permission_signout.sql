-- Targeted permission-change sign-out.
-- A permission mutation broadcasts only to the affected user's private Realtime topic.
-- The client listening on that topic performs Supabase Auth signOut(), which emits SIGNED_OUT locally.

create or replace function private.notify_permission_change(
  p_user_id uuid,
  p_reason text default 'permissions_changed'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'user_id', p_user_id,
      'reason', coalesce(nullif(trim(p_reason), ''), 'permissions_changed'),
      'changed_at', now()
    ),
    'permissions_changed',
    'user:' || p_user_id::text || ':permissions',
    true
  );
end;
$$;

revoke all on function private.notify_permission_change(uuid, text) from public, anon, authenticated;

-- Only the authenticated user whose UUID is embedded in the topic can join it.
drop policy if exists "users_receive_own_permission_events" on realtime.messages;
create policy "users_receive_own_permission_events"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) = 'user:' || (select auth.uid())::text || ':permissions'
);

-- Keep app_role in Auth metadata synchronized and notify only when the effective role claim changes.
create or replace function private.sync_app_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_app_role text;
begin
  select u.raw_app_meta_data ->> 'app_role'
  into v_previous_app_role
  from auth.users u
  where u.id = p_user_id
  for update;

  update auth.users
  set raw_app_meta_data =
    (coalesce(raw_app_meta_data, '{}'::jsonb) - 'is_primary_admin')
    || jsonb_build_object('app_role', p_role)
  where id = p_user_id;

  if v_previous_app_role is distinct from p_role then
    perform private.notify_permission_change(p_user_id, 'role_changed');
  end if;
end;
$$;

-- Family scope changes can alter permissions even when the role remains family_moderator.
create or replace function public.set_family_moderator_assignment(
  p_user_id uuid,
  p_family_id uuid,
  p_enabled boolean default true
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_role text;
  v_next_role text;
  v_linked_person_id uuid;
  v_is_primary boolean;
  v_scope_changed boolean := false;
  v_rows integer := 0;
begin
  if not private.is_primary_admin(auth.uid()) then
    raise exception 'Only the primary administrator can manage family moderator scopes';
  end if;

  select p.role, p.linked_person_id, p.is_primary_admin
  into v_previous_role, v_linked_person_id, v_is_primary
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
  if not exists (
    select 1 from public.families f
    where f.id = p_family_id and f.status = 'approved'
  ) then
    raise exception 'Family not found or not approved';
  end if;

  if p_enabled then
    delete from public.family_moderator_assignments
    where user_id = p_user_id
      and family_id <> p_family_id
      and v_previous_role <> 'family_moderator';
    get diagnostics v_rows = row_count;
    v_scope_changed := v_scope_changed or v_rows > 0;

    insert into public.family_moderator_assignments(user_id, family_id, assigned_by)
    values (p_user_id, p_family_id, auth.uid())
    on conflict (user_id, family_id) do nothing;
    get diagnostics v_rows = row_count;
    v_scope_changed := v_scope_changed or v_rows > 0;

    v_next_role := 'family_moderator';
  else
    delete from public.family_moderator_assignments
    where user_id = p_user_id and family_id = p_family_id;
    get diagnostics v_rows = row_count;
    v_scope_changed := v_scope_changed or v_rows > 0;

    if exists (
      select 1 from public.family_moderator_assignments a
      where a.user_id = p_user_id
    ) then
      v_next_role := 'family_moderator';
    else
      v_next_role := case
        when v_linked_person_id is not null then 'verified_member'
        else 'member'
      end;
    end if;
  end if;

  if v_previous_role <> v_next_role then
    update public.profiles
    set role = v_next_role, updated_at = now()
    where id = p_user_id;

    insert into private.admin_role_audit(target_user_id, previous_role, new_role, changed_by)
    values (p_user_id, v_previous_role, v_next_role, auth.uid());
  end if;

  perform private.sync_app_role(p_user_id, v_next_role);

  if v_scope_changed and v_previous_role = v_next_role then
    perform private.notify_permission_change(p_user_id, 'family_scope_changed');
  end if;

  return v_next_role;
end;
$$;

-- Structured moderator scope changes also need a targeted sign-out when the role itself stays unchanged.
create or replace function public.set_moderator_scope_assignment(
  p_user_id uuid,
  p_scope_type text,
  p_scope_id uuid,
  p_enabled boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_role text;
  v_next_role text;
  v_linked_person_id uuid;
  v_is_primary boolean;
  v_scope_changed boolean := false;
  v_rows integer := 0;
begin
  if not private.is_primary_admin(auth.uid()) then
    raise exception 'Only the primary administrator can manage moderator scopes';
  end if;
  if p_scope_type not in ('household','lineage','branch')
     or not private.scope_reference_exists(p_scope_type,p_scope_id) then
    raise exception 'Scope not found';
  end if;

  select p.role,p.linked_person_id,p.is_primary_admin
  into v_previous_role,v_linked_person_id,v_is_primary
  from public.profiles p
  join auth.users u on u.id=p.id
  where p.id=p_user_id
    and p.account_status='active'
    and u.email_confirmed_at is not null
  for update;

  if v_previous_role is null then
    raise exception 'Registered user not found';
  end if;
  if v_is_primary then
    raise exception 'The primary administrator role is protected';
  end if;

  if p_enabled then
    insert into public.moderator_scope_assignments(user_id,scope_type,scope_id,assigned_by)
    values(p_user_id,p_scope_type,p_scope_id,auth.uid())
    on conflict(user_id,scope_type,scope_id) do nothing;
    get diagnostics v_rows = row_count;
    v_scope_changed := v_rows > 0;
    v_next_role := 'family_moderator';
  else
    delete from public.moderator_scope_assignments
    where user_id=p_user_id and scope_type=p_scope_type and scope_id=p_scope_id;
    get diagnostics v_rows = row_count;
    v_scope_changed := v_rows > 0;

    if exists(select 1 from public.moderator_scope_assignments a where a.user_id=p_user_id) then
      v_next_role := 'family_moderator';
    else
      v_next_role := case
        when v_linked_person_id is not null then 'verified_member'
        else 'member'
      end;
    end if;
  end if;

  if v_previous_role<>v_next_role then
    update public.profiles
    set role=v_next_role,updated_at=now()
    where id=p_user_id;

    insert into private.admin_role_audit(target_user_id,previous_role,new_role,changed_by)
    values(p_user_id,v_previous_role,v_next_role,auth.uid());
  end if;

  perform private.sync_app_role(p_user_id,v_next_role);

  if v_scope_changed and v_previous_role = v_next_role then
    perform private.notify_permission_change(p_user_id, 'moderator_scope_changed');
  end if;

  return v_next_role;
end;
$$;