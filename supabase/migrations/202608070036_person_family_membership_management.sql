create or replace function public.update_person_family_membership(
  p_membership_id uuid,
  p_family_id uuid,
  p_membership_type text,
  p_notes text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.person_family_memberships%rowtype;
  v_is_admin boolean := false;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = v_uid
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  ) into v_is_admin;

  select *
  into v_row
  from public.person_family_memberships m
  where m.id = p_membership_id
  for update;

  if not found then
    raise exception 'membership not found';
  end if;

  if not v_is_admin and not (v_row.created_by = v_uid and v_row.status = 'pending') then
    raise exception 'not allowed';
  end if;

  if p_membership_type not in ('birth', 'marriage', 'paternal', 'maternal', 'guardian', 'other') then
    raise exception 'invalid membership type';
  end if;

  if p_family_id is null or not exists (
    select 1 from public.families f where f.id = p_family_id and f.status = 'approved'
  ) then
    raise exception 'family not found';
  end if;

  if exists (
    select 1
    from public.person_family_memberships m
    where m.person_id = v_row.person_id
      and m.family_id = p_family_id
      and m.membership_type = p_membership_type
      and m.status in ('pending', 'approved')
      and m.id <> p_membership_id
  ) then
    raise exception 'membership already exists';
  end if;

  update public.person_family_memberships
  set family_id = p_family_id,
      membership_type = p_membership_type,
      notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_membership_id;

  if v_row.status = 'approved' and v_row.is_primary then
    update public.people
    set family_id = p_family_id
    where id = v_row.person_id;
  end if;

  return v_row.status;
end;
$$;

create or replace function public.delete_person_family_membership(
  p_membership_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.person_family_memberships%rowtype;
  v_is_admin boolean := false;
  v_next_id uuid := null;
  v_next_family_id uuid := null;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = v_uid
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  ) into v_is_admin;

  select *
  into v_row
  from public.person_family_memberships m
  where m.id = p_membership_id
  for update;

  if not found then
    raise exception 'membership not found';
  end if;

  if not v_is_admin and not (v_row.created_by = v_uid and v_row.status = 'pending') then
    raise exception 'not allowed';
  end if;

  delete from public.person_family_memberships
  where id = p_membership_id;

  if v_row.status = 'approved' and v_row.is_primary then
    select m.id, m.family_id
    into v_next_id, v_next_family_id
    from public.person_family_memberships m
    where m.person_id = v_row.person_id
      and m.status = 'approved'
    order by (m.membership_type = 'birth') desc, m.created_at asc, m.id
    limit 1
    for update;

    if v_next_id is null then
      update public.people
      set family_id = null
      where id = v_row.person_id;
    else
      update public.person_family_memberships
      set is_primary = true
      where id = v_next_id;

      update public.people
      set family_id = v_next_family_id
      where id = v_row.person_id;
    end if;
  end if;

  return 'deleted';
end;
$$;

revoke all on function public.update_person_family_membership(uuid, uuid, text, text) from public;
revoke all on function public.update_person_family_membership(uuid, uuid, text, text) from anon;
grant execute on function public.update_person_family_membership(uuid, uuid, text, text) to authenticated;

revoke all on function public.delete_person_family_membership(uuid) from public;
revoke all on function public.delete_person_family_membership(uuid) from anon;
grant execute on function public.delete_person_family_membership(uuid) to authenticated;

comment on function public.update_person_family_membership(uuid, uuid, text, text) is 'Safely edit a family membership. Admins can edit approved records; members can edit only their own pending records.';
comment on function public.delete_person_family_membership(uuid) is 'Safely delete a family membership and repair the primary-family pointer when needed.';
