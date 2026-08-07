-- PHASE 17: ON-DEMAND EDIT REVIEW DETAILS
-- Reviewers fetch old/new values only when they open one edit request.

begin;

create or replace function public.get_edit_request_review_details(p_request_id uuid)
returns table(
  request_id uuid,
  entity_type text,
  record_id uuid,
  requester_name text,
  created_at timestamptz,
  current_data jsonb,
  proposed_data jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(private.active_role(auth.uid()), '');
  v_edit public.content_edit_requests%rowtype;
  v_event_family_id uuid;
  v_rel public.person_relationships%rowtype;
  v_current jsonb := '{}'::jsonb;
  v_proposed jsonb;
  v_family_name text;
begin
  if v_role not in ('family_moderator','content_moderator','admin','super_admin') then
    raise exception 'Not authorized';
  end if;

  select * into v_edit
  from public.content_edit_requests e
  where e.id = p_request_id and e.status = 'pending';

  if v_edit.id is null then
    raise exception 'Request not found or already reviewed';
  end if;

  if v_role = 'content_moderator' and v_edit.entity_type <> 'events' then
    raise exception 'Outside content moderator scope';
  end if;

  if v_role = 'family_moderator' then
    if v_edit.entity_type = 'families' and not private.has_family_moderator_scope(auth.uid(), v_edit.record_id) then
      raise exception 'Outside assigned family scope';
    elsif v_edit.entity_type = 'people' and not private.person_in_family_moderator_scope(auth.uid(), v_edit.record_id) then
      raise exception 'Outside assigned family scope';
    elsif v_edit.entity_type = 'events' then
      select e.family_id into v_event_family_id from public.events e where e.id = v_edit.record_id;
      if not private.has_family_moderator_scope(auth.uid(), v_event_family_id) then raise exception 'Outside assigned family scope'; end if;
    elsif v_edit.entity_type = 'person_relationships' then
      select * into v_rel from public.person_relationships r where r.id = v_edit.record_id;
      if not private.person_in_family_moderator_scope(auth.uid(), v_rel.source_person_id)
         or not private.person_in_family_moderator_scope(auth.uid(), v_rel.target_person_id) then
        raise exception 'Outside assigned family scope';
      end if;
    end if;
  end if;

  if v_edit.entity_type = 'families' then
    select jsonb_build_object(
      'name', f.name,
      'origin_place', f.origin_place,
      'description', f.description
    ) into v_current
    from public.families f where f.id = v_edit.record_id;
  elsif v_edit.entity_type = 'people' then
    select jsonb_build_object(
      'full_name', p.full_name,
      'gender', p.gender,
      'birth_year', p.birth_year,
      'is_deceased', p.is_deceased,
      'death_date', p.death_date,
      'description', p.description,
      'family_id', p.family_id,
      'family_name', f.name
    ) into v_current
    from public.people p left join public.families f on f.id = p.family_id
    where p.id = v_edit.record_id;
  elsif v_edit.entity_type = 'events' then
    select jsonb_build_object(
      'event_type', e.event_type,
      'title', e.title,
      'event_date', e.event_date,
      'location_name', e.location_name,
      'description', e.description,
      'family_id', e.family_id,
      'family_name', f.name
    ) into v_current
    from public.events e left join public.families f on f.id = e.family_id
    where e.id = v_edit.record_id;
  elsif v_edit.entity_type = 'person_relationships' then
    select jsonb_build_object(
      'relation_type', r.relation_type,
      'notes', r.notes,
      'source_person', s.full_name,
      'target_person', t.full_name
    ) into v_current
    from public.person_relationships r
    left join public.people s on s.id = r.source_person_id
    left join public.people t on t.id = r.target_person_id
    where r.id = v_edit.record_id;
  end if;

  v_proposed := v_edit.proposed_data;
  if v_edit.entity_type in ('people','events') and v_proposed ? 'family_id' then
    select f.name into v_family_name
    from public.families f
    where f.id = nullif(v_proposed->>'family_id','')::uuid;
    v_proposed := v_proposed || jsonb_build_object('family_name', v_family_name);
  end if;

  return query
  select
    v_edit.id,
    v_edit.entity_type,
    v_edit.record_id,
    coalesce(nullif(p.display_name,''), nullif(p.email,''), 'مستخدم مسجل')::text,
    v_edit.created_at,
    coalesce(v_current, '{}'::jsonb),
    coalesce(v_proposed, '{}'::jsonb)
  from public.profiles p
  where p.id = v_edit.requested_by;
end;
$$;

revoke all on function public.get_edit_request_review_details(uuid) from public, anon;
grant execute on function public.get_edit_request_review_details(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
