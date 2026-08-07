-- PHASE 13: FULL ROLE FOUNDATIONS + SCOPED MODERATION
-- Roles become real database permissions, not UI labels.
-- - linked member => verified_member automatically
-- - family_moderator => limited to explicitly assigned families
-- - content_moderator => public events/content only
-- - admin/super_admin => broad moderation; direct publishing remains admin-only
-- - primary super admin alone manages roles/scopes

begin;

create schema if not exists private;
create extension if not exists pg_trgm with schema extensions;

create table if not exists private.admin_role_audit (
  id bigint generated always as identity primary key,
  target_user_id uuid not null,
  previous_role text not null,
  new_role text not null,
  changed_by uuid not null,
  changed_at timestamptz not null default now()
);
revoke all on table private.admin_role_audit from public, anon, authenticated;

create table if not exists public.family_moderator_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, family_id)
);

create index if not exists family_moderator_assignments_user_idx
  on public.family_moderator_assignments (user_id, family_id);
create index if not exists family_moderator_assignments_family_idx
  on public.family_moderator_assignments (family_id, user_id);
create index if not exists profiles_display_name_trgm_idx
  on public.profiles using gin (display_name extensions.gin_trgm_ops)
  where account_status = 'active';
create index if not exists profiles_email_trgm_idx
  on public.profiles using gin (email extensions.gin_trgm_ops)
  where account_status = 'active';

alter table public.family_moderator_assignments enable row level security;
revoke all on table public.family_moderator_assignments from anon, authenticated;
grant select on table public.family_moderator_assignments to authenticated;

drop policy if exists "Users can read own family moderator scopes" on public.family_moderator_assignments;
create policy "Users can read own family moderator scopes"
on public.family_moderator_assignments for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role = 'super_admin'
      and p.is_primary_admin = true
  )
);

create or replace function private.is_primary_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.account_status = 'active'
      and p.role = 'super_admin'
      and p.is_primary_admin = true
  );
$$;

create or replace function private.active_role(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = p_user_id
    and p.account_status = 'active';
$$;

create or replace function private.has_family_moderator_scope(p_user_id uuid, p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_family_id is not null and exists (
    select 1
    from public.family_moderator_assignments a
    where a.user_id = p_user_id
      and a.family_id = p_family_id
  );
$$;

create or replace function private.person_in_family_moderator_scope(p_user_id uuid, p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.people p
    where p.id = p_person_id
      and (
        private.has_family_moderator_scope(p_user_id, p.family_id)
        or exists (
          select 1
          from public.person_family_memberships m
          join public.family_moderator_assignments a
            on a.family_id = m.family_id
           and a.user_id = p_user_id
          where m.person_id = p.id
            and m.status = 'approved'
        )
      )
  );
$$;

revoke all on function private.is_primary_admin(uuid) from public, anon, authenticated;
revoke all on function private.active_role(uuid) from public, anon, authenticated;
revoke all on function private.has_family_moderator_scope(uuid, uuid) from public, anon, authenticated;
revoke all on function private.person_in_family_moderator_scope(uuid, uuid) from public, anon, authenticated;

create or replace function private.sync_app_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set raw_app_meta_data =
    (coalesce(raw_app_meta_data, '{}'::jsonb) - 'is_primary_admin')
    || jsonb_build_object('app_role', p_role)
  where id = p_user_id;
end;
$$;
revoke all on function private.sync_app_role(uuid, text) from public, anon, authenticated;

-- Primary-admin role setter. verified_member is derived from account linking;
-- family_moderator is derived from explicit family assignments.
create or replace function public.set_platform_user_role(
  p_user_id uuid,
  p_role text
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
begin
  if not private.is_primary_admin(auth.uid()) then
    raise exception 'Only the primary administrator can change platform roles';
  end if;

  if p_role not in ('member', 'content_moderator', 'admin') then
    raise exception 'Use family scope assignment for family moderators; verified membership is automatic';
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

  v_next_role := case
    when p_role = 'member' and v_linked_person_id is not null then 'verified_member'
    else p_role
  end;

  if v_previous_role = 'family_moderator' then
    delete from public.family_moderator_assignments where user_id = p_user_id;
  end if;

  if v_previous_role <> v_next_role then
    update public.profiles
    set role = v_next_role, updated_at = now()
    where id = p_user_id;

    insert into private.admin_role_audit(target_user_id, previous_role, new_role, changed_by)
    values (p_user_id, v_previous_role, v_next_role, auth.uid());
  end if;

  perform private.sync_app_role(p_user_id, v_next_role);
  return v_next_role;
end;
$$;

revoke all on function public.set_platform_user_role(uuid, text) from public, anon;
grant execute on function public.set_platform_user_role(uuid, text) to authenticated;

-- Keep the temporary member/admin function compatible with the new role model.
create or replace function public.set_basic_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_role not in ('member', 'admin') then
    raise exception 'Only member/admin are accepted by this compatibility function';
  end if;
  perform public.set_platform_user_role(p_user_id, p_role);
end;
$$;
revoke all on function public.set_basic_user_role(uuid, text) from public, anon;
grant execute on function public.set_basic_user_role(uuid, text) to authenticated;

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
  if not exists (select 1 from public.families f where f.id = p_family_id and f.status = 'approved') then
    raise exception 'Family not found or not approved';
  end if;

  if p_enabled then
    -- Family moderation is a dedicated scoped role, not an extra hidden permission.
    delete from public.family_moderator_assignments where user_id = p_user_id and family_id <> p_family_id and v_previous_role <> 'family_moderator';
    insert into public.family_moderator_assignments(user_id, family_id, assigned_by)
    values (p_user_id, p_family_id, auth.uid())
    on conflict (user_id, family_id) do nothing;

    v_next_role := 'family_moderator';
  else
    delete from public.family_moderator_assignments
    where user_id = p_user_id and family_id = p_family_id;

    if exists (select 1 from public.family_moderator_assignments a where a.user_id = p_user_id) then
      v_next_role := 'family_moderator';
    else
      v_next_role := case when v_linked_person_id is not null then 'verified_member' else 'member' end;
    end if;
  end if;

  if v_previous_role <> v_next_role then
    update public.profiles set role = v_next_role, updated_at = now() where id = p_user_id;
    insert into private.admin_role_audit(target_user_id, previous_role, new_role, changed_by)
    values (p_user_id, v_previous_role, v_next_role, auth.uid());
  end if;

  perform private.sync_app_role(p_user_id, v_next_role);
  return v_next_role;
end;
$$;

revoke all on function public.set_family_moderator_assignment(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_family_moderator_assignment(uuid, uuid, boolean) to authenticated;

create or replace function public.list_family_moderator_assignments(p_user_id uuid)
returns table (
  family_id uuid,
  family_name text,
  origin_place text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_primary_admin(auth.uid()) then
    raise exception 'Only the primary administrator can inspect family moderator scopes';
  end if;

  return query
  select a.family_id, f.name, f.origin_place
  from public.family_moderator_assignments a
  join public.families f on f.id = a.family_id
  where a.user_id = p_user_id
  order by f.name;
end;
$$;

revoke all on function public.list_family_moderator_assignments(uuid) from public, anon;
grant execute on function public.list_family_moderator_assignments(uuid) to authenticated;

-- Account linking automatically promotes a plain member to verified_member.
create or replace function public.review_account_link_request(
  p_request_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_person_id uuid;
  v_role text;
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  if private.active_role(auth.uid()) not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  select r.user_id, r.person_id
  into v_user_id, v_person_id
  from public.account_link_requests r
  where r.id = p_request_id and r.status = 'pending'
  for update;

  if v_user_id is null then
    raise exception 'Request not found or already reviewed';
  end if;

  if p_status = 'approved' and not exists (
    select 1 from public.people p where p.id = v_person_id and p.status = 'approved'
  ) then
    raise exception 'The person record must be approved before linking an account';
  end if;

  update public.account_link_requests
  set status = p_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;

  if p_status = 'approved' then
    update public.profiles
    set linked_person_id = v_person_id,
        role = case when role = 'member' then 'verified_member' else role end,
        updated_at = now()
    where id = v_user_id
    returning role into v_role;

    perform private.sync_app_role(v_user_id, v_role);
  end if;
end;
$$;

revoke all on function public.review_account_link_request(uuid, text) from public, anon;
grant execute on function public.review_account_link_request(uuid, text) to authenticated;

-- Scope-aware primary moderation feed. Same return shape as phase 11.
create or replace function public.list_pending_moderation_feed(
  p_limit integer default 16,
  p_offset integer default 0
)
returns table (
  id uuid,
  table_name text,
  title text,
  subtitle text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.active_role(auth.uid());
  v_limit integer := greatest(1, least(coalesce(p_limit, 16), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if v_role not in ('family_moderator', 'content_moderator', 'admin', 'super_admin') then
    raise exception 'Not authorized to review pending content';
  end if;

  return query
  with pending as (
    select f.id, 'families'::text table_name, f.name::text title,
           coalesce(nullif(f.origin_place, ''), 'عائلة جديدة')::text subtitle, f.created_at
    from public.families f
    where f.status = 'pending'
      and (
        v_role in ('admin', 'super_admin')
        or (v_role = 'family_moderator' and f.created_by <> auth.uid()
            and private.has_family_moderator_scope(auth.uid(), f.id))
      )

    union all

    select p.id, 'people'::text, p.full_name::text,
           coalesce(nullif(f.name, ''), 'شخص جديد')::text, p.created_at
    from public.people p
    left join public.families f on f.id = p.family_id
    where p.status = 'pending'
      and (
        v_role in ('admin', 'super_admin')
        or (v_role = 'family_moderator' and p.created_by <> auth.uid()
            and private.person_in_family_moderator_scope(auth.uid(), p.id))
      )

    union all

    select e.id, 'events'::text, e.title::text,
           case e.event_type
             when 'death' then 'وفاة وعزاء'
             when 'wedding' then 'زواج'
             when 'birth' then 'مولود'
             when 'naming' then 'سماية'
             when 'graduation' then 'تخرج ونجاح'
             when 'general' then 'مناسبة عامة'
             else coalesce(nullif(e.event_type, ''), 'مناسبة')
           end::text,
           e.created_at
    from public.events e
    where e.status = 'pending'
      and (
        v_role in ('admin', 'super_admin')
        or (v_role = 'content_moderator' and e.created_by <> auth.uid())
        or (v_role = 'family_moderator' and e.created_by <> auth.uid()
            and private.has_family_moderator_scope(auth.uid(), e.family_id))
      )

    union all

    select r.id, 'person_relationships'::text,
           (coalesce(s.full_name, 'شخص أول') || ' — ' || coalesce(t.full_name, 'شخص ثانٍ'))::text,
           case r.relation_type
             when 'parent' then 'والد أو والدة'
             when 'child' then 'ابن أو ابنة'
             when 'spouse' then 'زوج أو زوجة'
             when 'sibling' then 'أخ أو أخت'
             when 'guardian' then 'ولي أو وصي'
             else 'صلة أخرى'
           end::text,
           r.created_at
    from public.person_relationships r
    left join public.people s on s.id = r.source_person_id
    left join public.people t on t.id = r.target_person_id
    where r.status = 'pending'
      and (
        v_role in ('admin', 'super_admin')
        or (v_role = 'family_moderator' and r.created_by <> auth.uid()
            and private.person_in_family_moderator_scope(auth.uid(), r.source_person_id)
            and private.person_in_family_moderator_scope(auth.uid(), r.target_person_id))
      )

    union all

    select l.id, 'account_link_requests'::text,
           coalesce(p.full_name, 'طلب ربط حساب')::text,
           'طلب إثبات أن الحساب يعود لهذا الشخص'::text,
           l.created_at
    from public.account_link_requests l
    left join public.people p on p.id = l.person_id
    where l.status = 'pending'
      and v_role in ('admin', 'super_admin')
  )
  select q.id, q.table_name, q.title, q.subtitle, q.created_at
  from pending q
  order by q.created_at asc, q.id
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.list_pending_moderation_feed(integer, integer) from public, anon;
grant execute on function public.list_pending_moderation_feed(integer, integer) to authenticated;

-- One protected review endpoint for primary queue records.
create or replace function public.review_pending_moderation_record(
  p_table_name text,
  p_record_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.active_role(auth.uid());
  v_created_by uuid;
  v_family_id uuid;
  v_source_id uuid;
  v_target_id uuid;
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;
  if v_role not in ('family_moderator', 'content_moderator', 'admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  if p_table_name = 'account_link_requests' then
    if v_role not in ('admin', 'super_admin') then raise exception 'Not authorized for account verification'; end if;
    perform public.review_account_link_request(p_record_id, p_status);
    return;
  elsif p_table_name = 'families' then
    select f.created_by, f.id into v_created_by, v_family_id
    from public.families f where f.id = p_record_id and f.status = 'pending' for update;
    if v_created_by is null then raise exception 'Request not found or already reviewed'; end if;
    if v_role = 'family_moderator' and (v_created_by = auth.uid() or not private.has_family_moderator_scope(auth.uid(), v_family_id)) then raise exception 'Outside assigned family scope or own request'; end if;
    if v_role = 'content_moderator' then raise exception 'Content moderators cannot review families'; end if;
    update public.families set status=p_status, approved_by=auth.uid(), approved_at=case when p_status='approved' then now() else null end where id=p_record_id;
  elsif p_table_name = 'people' then
    select p.created_by, p.family_id into v_created_by, v_family_id
    from public.people p where p.id = p_record_id and p.status = 'pending' for update;
    if v_created_by is null then raise exception 'Request not found or already reviewed'; end if;
    if v_role = 'family_moderator' and (v_created_by = auth.uid() or not private.person_in_family_moderator_scope(auth.uid(), p_record_id)) then raise exception 'Outside assigned family scope or own request'; end if;
    if v_role = 'content_moderator' then raise exception 'Content moderators cannot review people'; end if;
    update public.people set status=p_status, approved_by=auth.uid(), approved_at=case when p_status='approved' then now() else null end where id=p_record_id;
  elsif p_table_name = 'events' then
    select e.created_by, e.family_id into v_created_by, v_family_id
    from public.events e where e.id = p_record_id and e.status = 'pending' for update;
    if v_created_by is null then raise exception 'Request not found or already reviewed'; end if;
    if v_role = 'content_moderator' and v_created_by = auth.uid() then raise exception 'Moderators cannot approve their own request'; end if;
    if v_role = 'family_moderator' and (v_created_by = auth.uid() or not private.has_family_moderator_scope(auth.uid(), v_family_id)) then raise exception 'Outside assigned family scope or own request'; end if;
    update public.events set status=p_status, approved_by=auth.uid(), approved_at=case when p_status='approved' then now() else null end where id=p_record_id;
  elsif p_table_name = 'person_relationships' then
    select r.created_by, r.source_person_id, r.target_person_id into v_created_by, v_source_id, v_target_id
    from public.person_relationships r where r.id = p_record_id and r.status = 'pending' for update;
    if v_created_by is null then raise exception 'Request not found or already reviewed'; end if;
    if v_role = 'family_moderator' and (v_created_by = auth.uid()
      or not private.person_in_family_moderator_scope(auth.uid(), v_source_id)
      or not private.person_in_family_moderator_scope(auth.uid(), v_target_id)) then raise exception 'Outside assigned family scope or own request'; end if;
    if v_role = 'content_moderator' then raise exception 'Content moderators cannot review relationships'; end if;
    update public.person_relationships set status=p_status, approved_by=auth.uid(), approved_at=case when p_status='approved' then now() else null end where id=p_record_id;
  else
    raise exception 'Unsupported moderation table';
  end if;
end;
$$;

revoke all on function public.review_pending_moderation_record(text, uuid, text) from public, anon;
grant execute on function public.review_pending_moderation_record(text, uuid, text) to authenticated;

-- Scope-aware secondary queue. Same return shape as phase 12.
create or replace function public.list_pending_secondary_moderation_feed(
  p_limit integer default 13,
  p_offset integer default 0
)
returns table (
  id uuid,
  request_type text,
  title text,
  subtitle text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.active_role(auth.uid());
  v_limit integer := greatest(1, least(coalesce(p_limit, 13), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if v_role not in ('family_moderator', 'content_moderator', 'admin', 'super_admin') then
    raise exception 'Not authorized to review pending changes';
  end if;

  return query
  with pending as (
    select e.id, 'edit'::text request_type,
      case e.entity_type when 'families' then 'تعديل بيانات عائلة' when 'people' then 'تعديل بيانات شخص' when 'events' then 'تعديل مناسبة' else 'تعديل سجل' end::text title,
      coalesce(nullif(e.proposed_data->>'full_name',''), nullif(e.proposed_data->>'name',''), nullif(e.proposed_data->>'title',''), nullif(e.proposed_data->>'origin_place',''), nullif(e.proposed_data->>'location_name',''), 'راجع البيانات المقترحة ثم اعتمد أو ارفض.')::text subtitle,
      e.created_at
    from public.content_edit_requests e
    where e.status='pending'
      and (
        v_role in ('admin','super_admin')
        or (v_role='content_moderator' and e.requested_by<>auth.uid() and e.entity_type='events')
        or (v_role='family_moderator' and e.requested_by<>auth.uid() and (
          (e.entity_type='families' and private.has_family_moderator_scope(auth.uid(), e.record_id))
          or (e.entity_type='people' and private.person_in_family_moderator_scope(auth.uid(), e.record_id))
          or (e.entity_type='events' and exists (select 1 from public.events ev where ev.id=e.record_id and private.has_family_moderator_scope(auth.uid(), ev.family_id)))
        ))
      )

    union all

    select m.id, 'membership'::text,
      (coalesce(p.full_name,'شخص') || ' ← ' || coalesce(f.name,'عائلة'))::text,
      (case m.membership_type when 'birth' then 'بالنسب / عائلة الأصل' when 'marriage' then 'بالزواج' when 'paternal' then 'من جهة الأب' when 'maternal' then 'من جهة الأم' when 'guardian' then 'وصاية أو كفالة' else 'انتماء آخر' end
       || case when m.is_primary then ' · عائلة أساسية' else '' end
       || case when nullif(m.notes,'') is not null then ' · '||m.notes else '' end)::text,
      m.created_at
    from public.person_family_memberships m
    left join public.people p on p.id=m.person_id
    left join public.families f on f.id=m.family_id
    where m.status='pending'
      and (
        v_role in ('admin','super_admin')
        or (v_role='family_moderator' and m.created_by<>auth.uid() and private.has_family_moderator_scope(auth.uid(), m.family_id))
      )
  )
  select q.id,q.request_type,q.title,q.subtitle,q.created_at
  from pending q order by q.created_at asc,q.id limit v_limit offset v_offset;
end;
$$;

revoke all on function public.list_pending_secondary_moderation_feed(integer, integer) from public, anon;
grant execute on function public.list_pending_secondary_moderation_feed(integer, integer) to authenticated;

-- Unified protected review endpoint for edit requests and family memberships.
create or replace function public.review_secondary_moderation_request(
  p_request_type text,
  p_request_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.active_role(auth.uid());
  v_edit public.content_edit_requests%rowtype;
  v_membership public.person_family_memberships%rowtype;
  v_event_family_id uuid;
begin
  if p_status not in ('approved','rejected') then raise exception 'Invalid review status'; end if;
  if v_role not in ('family_moderator','content_moderator','admin','super_admin') then raise exception 'Not authorized'; end if;

  if p_request_type = 'membership' then
    select * into v_membership from public.person_family_memberships where id=p_request_id and status='pending' for update;
    if v_membership.id is null then raise exception 'Request not found or already reviewed'; end if;
    if v_role not in ('admin','super_admin') then
      if v_role <> 'family_moderator' or v_membership.created_by=auth.uid() or not private.has_family_moderator_scope(auth.uid(),v_membership.family_id) then
        raise exception 'Outside assigned family scope or own request';
      end if;
    end if;
    update public.person_family_memberships set status=p_status, approved_by=auth.uid(), approved_at=case when p_status='approved' then now() else null end where id=p_request_id;
    return;
  end if;

  if p_request_type <> 'edit' then raise exception 'Unsupported secondary request type'; end if;

  select * into v_edit from public.content_edit_requests where id=p_request_id and status='pending' for update;
  if v_edit.id is null then raise exception 'Request not found or already reviewed'; end if;

  if v_role not in ('admin','super_admin') then
    if v_edit.requested_by=auth.uid() then raise exception 'Moderators cannot approve their own request'; end if;
    if v_role='content_moderator' and v_edit.entity_type<>'events' then raise exception 'Content moderator scope is limited to events'; end if;
    if v_role='family_moderator' then
      if v_edit.entity_type='families' and not private.has_family_moderator_scope(auth.uid(),v_edit.record_id) then raise exception 'Outside assigned family scope'; end if;
      if v_edit.entity_type='people' and not private.person_in_family_moderator_scope(auth.uid(),v_edit.record_id) then raise exception 'Outside assigned family scope'; end if;
      if v_edit.entity_type='events' then
        select e.family_id into v_event_family_id from public.events e where e.id=v_edit.record_id;
        if not private.has_family_moderator_scope(auth.uid(),v_event_family_id) then raise exception 'Outside assigned family scope'; end if;
      end if;
    end if;
  end if;

  if p_status='approved' then
    if v_edit.entity_type='families' then
      update public.families set
        name=case when v_edit.proposed_data?'name' then trim(v_edit.proposed_data->>'name') else name end,
        description=case when v_edit.proposed_data?'description' then nullif(trim(v_edit.proposed_data->>'description'),'') else description end,
        origin_place=case when v_edit.proposed_data?'origin_place' then nullif(trim(v_edit.proposed_data->>'origin_place'),'') else origin_place end
      where id=v_edit.record_id;
    elsif v_edit.entity_type='people' then
      update public.people set
        full_name=case when v_edit.proposed_data?'full_name' then trim(v_edit.proposed_data->>'full_name') else full_name end,
        gender=case when v_edit.proposed_data?'gender' then nullif(v_edit.proposed_data->>'gender','') else gender end,
        birth_year=case when v_edit.proposed_data?'birth_year' then nullif(v_edit.proposed_data->>'birth_year','')::integer else birth_year end,
        is_deceased=case when v_edit.proposed_data?'is_deceased' then coalesce((v_edit.proposed_data->>'is_deceased')::boolean,false) else is_deceased end,
        death_date=case when v_edit.proposed_data?'death_date' then nullif(v_edit.proposed_data->>'death_date','')::date else death_date end,
        description=case when v_edit.proposed_data?'description' then nullif(trim(v_edit.proposed_data->>'description'),'') else description end
      where id=v_edit.record_id;
    elsif v_edit.entity_type='events' then
      update public.events set
        event_type=case when v_edit.proposed_data?'event_type' then v_edit.proposed_data->>'event_type' else event_type end,
        title=case when v_edit.proposed_data?'title' then trim(v_edit.proposed_data->>'title') else title end,
        description=case when v_edit.proposed_data?'description' then nullif(trim(v_edit.proposed_data->>'description'),'') else description end,
        event_date=case when v_edit.proposed_data?'event_date' then nullif(v_edit.proposed_data->>'event_date','')::date else event_date end,
        location_name=case when v_edit.proposed_data?'location_name' then nullif(trim(v_edit.proposed_data->>'location_name'),'') else location_name end,
        family_id=case when v_edit.proposed_data?'family_id' then nullif(v_edit.proposed_data->>'family_id','')::uuid else family_id end
      where id=v_edit.record_id;
    end if;
  end if;

  update public.content_edit_requests set status=p_status, reviewed_by=auth.uid(), reviewed_at=now(), updated_at=now() where id=p_request_id;
end;
$$;

revoke all on function public.review_secondary_moderation_request(text, uuid, text) from public, anon;
grant execute on function public.review_secondary_moderation_request(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
