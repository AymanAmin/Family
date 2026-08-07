-- PHASE 35: CONTEXTUAL PERSON ADDITIONS FROM FAMILY / PERSON PROFILES
-- Keeps the mobile UI minimal while preserving canonical person + moderated relationship rules.

begin;

create or replace function public.create_person_in_context(
  p_full_name text,
  p_gender text default null,
  p_family_id uuid default null,
  p_anchor_person_id uuid default null,
  p_relation_slot text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person_id uuid;
  v_role text := coalesce(private.active_role(auth.uid()), '');
  v_direct boolean := v_role in ('admin', 'super_admin');
  v_status text := case when v_direct then 'approved' else 'pending' end;
  v_expected_gender text;
  v_gender text;
  v_relation_type text;
  v_source_person_id uuid;
  v_target_person_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if char_length(trim(coalesce(p_full_name, ''))) < 3 then
    raise exception 'Full name is required';
  end if;

  if p_gender is not null and p_gender not in ('male', 'female') then
    raise exception 'Invalid gender';
  end if;

  if p_family_id is not null and not exists (
    select 1 from public.families f where f.id = p_family_id and f.status = 'approved'
  ) then
    raise exception 'Family must be approved';
  end if;

  if p_relation_slot is not null then
    if p_anchor_person_id is null then
      raise exception 'Anchor person is required for a contextual relationship';
    end if;
    if not exists (
      select 1 from public.people p where p.id = p_anchor_person_id and p.status = 'approved'
    ) then
      raise exception 'Anchor person must be approved';
    end if;

    case p_relation_slot
      when 'father' then v_expected_gender := 'male'; v_relation_type := 'parent';
      when 'mother' then v_expected_gender := 'female'; v_relation_type := 'parent';
      when 'husband' then v_expected_gender := 'male'; v_relation_type := 'spouse';
      when 'wife' then v_expected_gender := 'female'; v_relation_type := 'spouse';
      when 'son' then v_expected_gender := 'male'; v_relation_type := 'child';
      when 'daughter' then v_expected_gender := 'female'; v_relation_type := 'child';
      when 'brother' then v_expected_gender := 'male'; v_relation_type := 'sibling';
      when 'sister' then v_expected_gender := 'female'; v_relation_type := 'sibling';
      else raise exception 'Invalid relationship slot';
    end case;
  end if;

  if v_expected_gender is not null and p_gender is not null and p_gender <> v_expected_gender then
    raise exception 'Gender does not match the selected relationship slot';
  end if;
  v_gender := coalesce(p_gender, v_expected_gender);

  insert into public.people(
    full_name, family_id, gender, created_by, status, approved_by, approved_at
  )
  values (
    trim(p_full_name), p_family_id, v_gender, auth.uid(), v_status,
    case when v_direct then auth.uid() else null end,
    case when v_direct then now() else null end
  )
  returning id into v_person_id;

  if p_family_id is not null then
    insert into public.person_family_memberships(
      person_id, family_id, membership_type, is_primary, status,
      created_by, approved_by, approved_at
    )
    values (
      v_person_id, p_family_id, 'birth', true, v_status,
      auth.uid(), case when v_direct then auth.uid() else null end,
      case when v_direct then now() else null end
    );
  end if;

  if v_relation_type is not null then
    v_source_person_id := v_person_id;
    v_target_person_id := p_anchor_person_id;

    insert into public.person_relationships(
      source_person_id, target_person_id, relation_type, status,
      created_by, approved_by, approved_at
    )
    values (
      v_source_person_id, v_target_person_id, v_relation_type, v_status,
      auth.uid(), case when v_direct then auth.uid() else null end,
      case when v_direct then now() else null end
    );
  end if;

  return v_person_id;
end;
$$;

revoke all on function public.create_person_in_context(text, text, uuid, uuid, text) from public, anon;
grant execute on function public.create_person_in_context(text, text, uuid, uuid, text) to authenticated;

create or replace function public.link_person_in_context(
  p_anchor_person_id uuid,
  p_existing_person_id uuid,
  p_relation_slot text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(private.active_role(auth.uid()), '');
  v_direct boolean := v_role in ('admin', 'super_admin');
  v_status text := case when v_direct then 'approved' else 'pending' end;
  v_expected_gender text;
  v_existing_gender text;
  v_relation_type text;
  v_reverse_type text;
  v_source uuid := p_existing_person_id;
  v_target uuid := p_anchor_person_id;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_anchor_person_id is null or p_existing_person_id is null or p_anchor_person_id = p_existing_person_id then
    raise exception 'Two different people are required';
  end if;
  if not exists (select 1 from public.people p where p.id=p_anchor_person_id and p.status='approved') then
    raise exception 'Anchor person must be approved';
  end if;
  select p.gender into v_existing_gender from public.people p where p.id=p_existing_person_id and p.status='approved';
  if not found then raise exception 'Existing person must be approved'; end if;

  case p_relation_slot
    when 'father' then v_expected_gender := 'male'; v_relation_type := 'parent'; v_reverse_type := 'child';
    when 'mother' then v_expected_gender := 'female'; v_relation_type := 'parent'; v_reverse_type := 'child';
    when 'husband' then v_expected_gender := 'male'; v_relation_type := 'spouse'; v_reverse_type := 'spouse';
    when 'wife' then v_expected_gender := 'female'; v_relation_type := 'spouse'; v_reverse_type := 'spouse';
    when 'son' then v_expected_gender := 'male'; v_relation_type := 'child'; v_reverse_type := 'parent';
    when 'daughter' then v_expected_gender := 'female'; v_relation_type := 'child'; v_reverse_type := 'parent';
    when 'brother' then v_expected_gender := 'male'; v_relation_type := 'sibling'; v_reverse_type := 'sibling';
    when 'sister' then v_expected_gender := 'female'; v_relation_type := 'sibling'; v_reverse_type := 'sibling';
    else raise exception 'Invalid relationship slot';
  end case;

  if v_existing_gender is not null and v_existing_gender <> v_expected_gender then
    raise exception 'Existing person gender does not match the selected relationship slot';
  end if;

  if exists (
    select 1 from public.person_relationships r
    where r.status in ('pending','approved')
      and (
        (r.source_person_id=v_source and r.target_person_id=v_target and r.relation_type=v_relation_type)
        or
        (r.source_person_id=v_target and r.target_person_id=v_source and r.relation_type=v_reverse_type)
      )
  ) then
    return 'exists';
  end if;

  insert into public.person_relationships(
    source_person_id,target_person_id,relation_type,status,created_by,approved_by,approved_at
  ) values (
    v_source,v_target,v_relation_type,v_status,auth.uid(),
    case when v_direct then auth.uid() else null end,
    case when v_direct then now() else null end
  );

  return v_status;
end;
$$;

revoke all on function public.link_person_in_context(uuid, uuid, text) from public, anon;
grant execute on function public.link_person_in_context(uuid, uuid, text) to authenticated;

create or replace function public.link_person_to_family_context(
  p_person_id uuid,
  p_family_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(private.active_role(auth.uid()), '');
  v_direct boolean := v_role in ('admin', 'super_admin');
  v_status text := case when v_direct then 'approved' else 'pending' end;
  v_make_primary boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.people p where p.id=p_person_id and p.status='approved') then
    raise exception 'Person must be approved';
  end if;
  if not exists (select 1 from public.families f where f.id=p_family_id and f.status='approved') then
    raise exception 'Family must be approved';
  end if;

  if exists (
    select 1 from public.person_family_memberships m
    where m.person_id=p_person_id and m.family_id=p_family_id and m.status in ('pending','approved')
  ) then
    return 'exists';
  end if;

  if v_direct and not exists (
    select 1 from public.person_family_memberships m
    where m.person_id=p_person_id and m.is_primary=true and m.status='approved'
  ) then
    v_make_primary := true;
  end if;

  insert into public.person_family_memberships(
    person_id,family_id,membership_type,is_primary,status,created_by,approved_by,approved_at
  ) values (
    p_person_id,p_family_id,'birth',v_make_primary,v_status,auth.uid(),
    case when v_direct then auth.uid() else null end,
    case when v_direct then now() else null end
  );

  if v_make_primary then
    update public.people set family_id=p_family_id,updated_at=now() where id=p_person_id;
  end if;

  return v_status;
end;
$$;

revoke all on function public.link_person_to_family_context(uuid, uuid) from public, anon;
grant execute on function public.link_person_to_family_context(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
