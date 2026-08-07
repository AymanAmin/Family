-- PHASE 21: PER-PERSON RELATIONSHIP RESYNC
-- Gives administrators a safe repair/rebuild action from a person's profile.
-- Kinship is derived dynamically, so resync validates the source graph, removes
-- invalid self-links, normalizes duplicate logical edges for this person, and
-- reports the rebuilt direct / inferred relationship counts.

begin;

create or replace function public.resync_person_relationships(p_person_id uuid)
returns table (
  direct_relationship_count integer,
  smart_relationship_count integer,
  extended_relationship_count integer,
  removed_invalid_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.active_role(auth.uid());
  v_direct integer := 0;
  v_smart integer := 0;
  v_extended integer := 0;
  v_removed integer := 0;
  v_step_removed integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if coalesce(v_role, '') not in ('admin', 'super_admin') then
    raise exception 'Administrator access required';
  end if;

  if not exists (select 1 from public.people p where p.id = p_person_id) then
    raise exception 'Person not found';
  end if;

  -- Self-links can make every downstream inference unreliable.
  delete from public.person_relationships r
  where r.source_person_id = p_person_id
    and r.target_person_id = p_person_id;
  get diagnostics v_step_removed = row_count;
  v_removed := v_removed + v_step_removed;

  -- Normalize any legacy duplicate parent/child rows that describe the same
  -- logical parent -> child edge and touch this person. Migration 027 prevents
  -- new duplicates, but this keeps resync useful for databases upgraded later.
  with candidates as (
    select
      r.id,
      row_number() over (
        partition by
          case when r.relation_type = 'parent' then r.source_person_id else r.target_person_id end,
          case when r.relation_type = 'parent' then r.target_person_id else r.source_person_id end
        order by
          case when r.status = 'approved' then 0 when r.status = 'pending' then 1 else 2 end,
          r.created_at,
          r.id
      ) as rn
    from public.person_relationships r
    where r.relation_type in ('parent', 'child')
      and r.status in ('approved', 'pending')
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)
  )
  delete from public.person_relationships r
  using candidates c
  where r.id = c.id
    and c.rn > 1;
  get diagnostics v_step_removed = row_count;
  v_removed := v_removed + v_step_removed;

  -- Spouse and sibling are symmetric; remove legacy reverse duplicates.
  with candidates as (
    select
      r.id,
      row_number() over (
        partition by
          r.relation_type,
          least(r.source_person_id::text, r.target_person_id::text),
          greatest(r.source_person_id::text, r.target_person_id::text)
        order by
          case when r.status = 'approved' then 0 when r.status = 'pending' then 1 else 2 end,
          r.created_at,
          r.id
      ) as rn
    from public.person_relationships r
    where r.relation_type in ('spouse', 'sibling')
      and r.status in ('approved', 'pending')
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)
  )
  delete from public.person_relationships r
  using candidates c
  where r.id = c.id
    and c.rn > 1;
  get diagnostics v_step_removed = row_count;
  v_removed := v_removed + v_step_removed;

  select count(*)::integer
  into v_direct
  from public.person_relationships r
  where r.status = 'approved'
    and (r.source_person_id = p_person_id or r.target_person_id = p_person_id);

  select count(*)::integer
  into v_smart
  from public.get_person_kinship(p_person_id);

  select count(*)::integer
  into v_extended
  from public.get_person_extended_kinship(p_person_id);

  return query select v_direct, v_smart, v_extended, v_removed;
end;
$$;

revoke all on function public.resync_person_relationships(uuid) from public, anon;
grant execute on function public.resync_person_relationships(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
