-- PHASE 20: RELATIONSHIP DELETE INTEGRITY
-- Delete a logical kinship edge, not only one physical row.
-- Parent/child can be stored in either direction, while spouse/sibling are symmetric.
-- This migration also repairs duplicate active logical edges and prevents them from returning.

begin;

create or replace function private.delete_logical_person_relationship(p_relationship_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_relation public.person_relationships%rowtype;
  v_parent_id uuid;
  v_child_id uuid;
  v_deleted integer := 0;
begin
  select *
  into v_relation
  from public.person_relationships
  where id = p_relationship_id
  for update;

  if v_relation.id is null then
    return 0;
  end if;

  if v_relation.relation_type in ('parent', 'child') then
    v_parent_id := case
      when v_relation.relation_type = 'parent' then v_relation.source_person_id
      else v_relation.target_person_id
    end;
    v_child_id := case
      when v_relation.relation_type = 'parent' then v_relation.target_person_id
      else v_relation.source_person_id
    end;

    delete from public.person_relationships r
    where r.id = p_relationship_id
       or (
         r.status in ('pending', 'approved')
         and (
           (r.relation_type = 'parent' and r.source_person_id = v_parent_id and r.target_person_id = v_child_id)
           or
           (r.relation_type = 'child' and r.source_person_id = v_child_id and r.target_person_id = v_parent_id)
         )
       );
  elsif v_relation.relation_type in ('spouse', 'sibling') then
    delete from public.person_relationships r
    where r.id = p_relationship_id
       or (
         r.status in ('pending', 'approved')
         and r.relation_type = v_relation.relation_type
         and (
           (r.source_person_id = v_relation.source_person_id and r.target_person_id = v_relation.target_person_id)
           or
           (r.source_person_id = v_relation.target_person_id and r.target_person_id = v_relation.source_person_id)
         )
       );
  else
    delete from public.person_relationships
    where id = p_relationship_id;
  end if;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.delete_logical_person_relationship(uuid) from public, anon, authenticated;

-- Repair duplicate active parent/child rows that represent the same logical edge.
with ranked_parent_child as (
  select
    r.id,
    row_number() over (
      partition by
        case when r.relation_type = 'parent' then r.source_person_id else r.target_person_id end,
        case when r.relation_type = 'parent' then r.target_person_id else r.source_person_id end
      order by
        case when r.status = 'approved' then 0 else 1 end,
        r.created_at,
        r.id
    ) as rn
  from public.person_relationships r
  where r.status in ('pending', 'approved')
    and r.relation_type in ('parent', 'child')
)
delete from public.person_relationships r
using ranked_parent_child d
where r.id = d.id
  and d.rn > 1;

-- Repair reverse duplicates for symmetric relationships.
with ranked_symmetric as (
  select
    r.id,
    row_number() over (
      partition by
        r.relation_type,
        least(r.source_person_id::text, r.target_person_id::text),
        greatest(r.source_person_id::text, r.target_person_id::text)
      order by
        case when r.status = 'approved' then 0 else 1 end,
        r.created_at,
        r.id
    ) as rn
  from public.person_relationships r
  where r.status in ('pending', 'approved')
    and r.relation_type in ('spouse', 'sibling')
)
delete from public.person_relationships r
using ranked_symmetric d
where r.id = d.id
  and d.rn > 1;

create unique index if not exists person_relationships_parent_child_logical_unique_idx
on public.person_relationships (
  (case when relation_type = 'parent' then source_person_id else target_person_id end),
  (case when relation_type = 'parent' then target_person_id else source_person_id end)
)
where status in ('pending', 'approved')
  and relation_type in ('parent', 'child');

create unique index if not exists person_relationships_symmetric_logical_unique_idx
on public.person_relationships (
  relation_type,
  least(source_person_id::text, target_person_id::text),
  greatest(source_person_id::text, target_person_id::text)
)
where status in ('pending', 'approved')
  and relation_type in ('spouse', 'sibling');

create or replace function public.request_relationship_change(
  p_relationship_id uuid,
  p_action text,
  p_relation_type text default null,
  p_notes text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := private.active_role(auth.uid());
  v_relation public.person_relationships%rowtype;
  v_source_name text;
  v_target_name text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_action not in ('edit', 'delete') then raise exception 'Invalid action'; end if;
  if p_action = 'edit' and p_relation_type not in ('parent', 'child', 'spouse', 'sibling', 'guardian', 'other') then
    raise exception 'Invalid relationship type';
  end if;

  select * into v_relation
  from public.person_relationships
  where id = p_relationship_id
  for update;

  if v_relation.id is null then raise exception 'Relationship not found'; end if;
  if coalesce(v_role, '') not in ('admin', 'super_admin') and v_relation.created_by <> v_user_id then
    raise exception 'Only the relationship owner or an administrator can change it';
  end if;

  if coalesce(v_role, '') in ('admin', 'super_admin') then
    if p_action = 'delete' then
      perform private.delete_logical_person_relationship(p_relationship_id);
    else
      update public.person_relationships
      set relation_type = p_relation_type,
          notes = nullif(trim(coalesce(p_notes, '')), '')
      where id = p_relationship_id;
    end if;
    return 'applied';
  end if;

  if v_relation.status = 'pending' then
    if p_action = 'delete' then
      perform private.delete_logical_person_relationship(p_relationship_id);
    else
      update public.person_relationships
      set relation_type = p_relation_type,
          notes = nullif(trim(coalesce(p_notes, '')), '')
      where id = p_relationship_id;
    end if;
    return 'applied';
  end if;

  if v_relation.status <> 'approved' then raise exception 'Rejected relationship cannot be changed'; end if;

  select s.full_name, t.full_name
  into v_source_name, v_target_name
  from public.people s, public.people t
  where s.id = v_relation.source_person_id
    and t.id = v_relation.target_person_id;

  insert into public.relationship_change_requests(
    relationship_id, source_person_id, target_person_id, source_name, target_name, original_relation_type,
    requested_by, action, proposed_relation_type, proposed_notes
  )
  values (
    p_relationship_id, v_relation.source_person_id, v_relation.target_person_id, v_source_name, v_target_name, v_relation.relation_type,
    v_user_id, p_action,
    case when p_action = 'edit' then p_relation_type else null end,
    case when p_action = 'edit' then nullif(trim(coalesce(p_notes, '')), '') else null end
  );

  return 'pending';
end;
$$;

revoke all on function public.request_relationship_change(uuid, text, text, text) from public, anon;
grant execute on function public.request_relationship_change(uuid, text, text, text) to authenticated;

create or replace function public.review_relationship_change(
  p_request_id uuid,
  p_status text,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.relationship_change_requests%rowtype;
begin
  if coalesce(private.active_role(auth.uid()), '') not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;
  if p_status not in ('approved', 'rejected') then raise exception 'Invalid review status'; end if;

  select * into v_request
  from public.relationship_change_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if v_request.id is null then raise exception 'Request not found or already reviewed'; end if;

  if p_status = 'approved' then
    if v_request.action = 'delete' then
      if v_request.relationship_id is not null then
        perform private.delete_logical_person_relationship(v_request.relationship_id);
      end if;
    else
      if v_request.relationship_id is null then
        raise exception 'The original relationship no longer exists';
      end if;
      update public.person_relationships
      set relation_type = v_request.proposed_relation_type,
          notes = v_request.proposed_notes
      where id = v_request.relationship_id;
    end if;
  end if;

  update public.relationship_change_requests
  set status = p_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(trim(coalesce(p_review_note, '')), ''),
      updated_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.review_relationship_change(uuid, text, text) from public, anon;
grant execute on function public.review_relationship_change(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
