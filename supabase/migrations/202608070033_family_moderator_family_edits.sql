create or replace function public.can_request_content_edit(
  p_entity_type text,
  p_record_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_role text;
begin
  if auth.uid() is null then
    return false;
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = auth.uid()
    and p.account_status = 'active';

  if v_role is null then
    return false;
  end if;

  if v_role in ('admin', 'super_admin') then
    return true;
  end if;

  if p_entity_type = 'families' then
    select f.created_by into v_owner
    from public.families f
    where f.id = p_record_id;

    if v_owner is null then
      return false;
    end if;

    return v_owner = auth.uid()
      or (
        v_role = 'family_moderator'
        and private.has_family_moderator_scope(auth.uid(), p_record_id)
      );
  elsif p_entity_type = 'people' then
    select p.created_by into v_owner
    from public.people p
    where p.id = p_record_id;
  elsif p_entity_type = 'events' then
    select e.created_by into v_owner
    from public.events e
    where e.id = p_record_id;
  else
    return false;
  end if;

  return v_owner = auth.uid();
end;
$$;

grant execute on function public.can_request_content_edit(text, uuid) to authenticated;

create or replace function public.request_content_edit(
  p_entity_type text,
  p_record_id uuid,
  p_proposed_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_owner uuid;
  v_role text;
  v_is_admin boolean := false;
  v_can_edit boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_entity_type not in ('families', 'people', 'events') then
    raise exception 'Unsupported entity type';
  end if;

  if p_proposed_data is null or jsonb_typeof(p_proposed_data) <> 'object' then
    raise exception 'Invalid proposed data';
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = auth.uid()
    and p.account_status = 'active';

  if v_role is null then
    raise exception 'Account is not active';
  end if;

  v_is_admin := v_role in ('admin', 'super_admin');

  if p_entity_type = 'families' then
    select f.created_by into v_owner
    from public.families f
    where f.id = p_record_id;

    v_can_edit := v_owner = auth.uid()
      or v_is_admin
      or (
        v_role = 'family_moderator'
        and private.has_family_moderator_scope(auth.uid(), p_record_id)
      );
  elsif p_entity_type = 'people' then
    select p.created_by into v_owner
    from public.people p
    where p.id = p_record_id;
    v_can_edit := v_owner = auth.uid() or v_is_admin;
  else
    select e.created_by into v_owner
    from public.events e
    where e.id = p_record_id;
    v_can_edit := v_owner = auth.uid() or v_is_admin;
  end if;

  if v_owner is null then
    raise exception 'Record not found';
  end if;

  if not v_can_edit then
    raise exception 'You are not allowed to edit this record';
  end if;

  -- Administrators apply immediately. Owners and scoped family moderators
  -- always create a pending request so the published record is unchanged
  -- until an administrator approves the edit.
  if v_is_admin then
    if p_entity_type = 'families' then
      update public.families
      set
        name = case when p_proposed_data ? 'name' then trim(p_proposed_data ->> 'name') else name end,
        description = case when p_proposed_data ? 'description' then nullif(trim(p_proposed_data ->> 'description'), '') else description end,
        origin_place = case when p_proposed_data ? 'origin_place' then nullif(trim(p_proposed_data ->> 'origin_place'), '') else origin_place end,
        updated_at = now()
      where id = p_record_id;
    elsif p_entity_type = 'people' then
      update public.people
      set
        full_name = case when p_proposed_data ? 'full_name' then trim(p_proposed_data ->> 'full_name') else full_name end,
        gender = case when p_proposed_data ? 'gender' then nullif(p_proposed_data ->> 'gender', '') else gender end,
        birth_year = case when p_proposed_data ? 'birth_year' then nullif(p_proposed_data ->> 'birth_year', '')::integer else birth_year end,
        is_deceased = case when p_proposed_data ? 'is_deceased' then coalesce((p_proposed_data ->> 'is_deceased')::boolean, false) else is_deceased end,
        death_date = case when p_proposed_data ? 'death_date' then nullif(p_proposed_data ->> 'death_date', '')::date else death_date end,
        description = case when p_proposed_data ? 'description' then nullif(trim(p_proposed_data ->> 'description'), '') else description end,
        updated_at = now()
      where id = p_record_id;
    else
      update public.events
      set
        event_type = case when p_proposed_data ? 'event_type' then p_proposed_data ->> 'event_type' else event_type end,
        title = case when p_proposed_data ? 'title' then trim(p_proposed_data ->> 'title') else title end,
        description = case when p_proposed_data ? 'description' then nullif(trim(p_proposed_data ->> 'description'), '') else description end,
        event_date = case when p_proposed_data ? 'event_date' then nullif(p_proposed_data ->> 'event_date', '')::date else event_date end,
        location_name = case when p_proposed_data ? 'location_name' then nullif(trim(p_proposed_data ->> 'location_name'), '') else location_name end,
        family_id = case when p_proposed_data ? 'family_id' then nullif(p_proposed_data ->> 'family_id', '')::uuid else family_id end,
        updated_at = now()
      where id = p_record_id;
    end if;

    return null;
  end if;

  insert into public.content_edit_requests(entity_type, record_id, proposed_data, requested_by)
  values (p_entity_type, p_record_id, p_proposed_data, auth.uid())
  returning id into v_request_id;

  return v_request_id;
end;
$$;

grant execute on function public.request_content_edit(text, uuid, jsonb) to authenticated;
