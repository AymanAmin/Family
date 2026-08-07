-- PHASE 8: KINSHIP PATH EXPLORER
-- Shortest approved relationship path between two people, capped for predictable public performance.

begin;

create or replace function public.get_kinship_path(
  p_from_person_id uuid,
  p_to_person_id uuid,
  p_max_depth integer default 6
)
returns table (
  step_no integer,
  person_id uuid,
  full_name text,
  gender text,
  relation_type text,
  is_inferred boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive
  approved_relationships as (
    select r.source_person_id, r.target_person_id, r.relation_type
    from public.person_relationships r
    where r.status = 'approved'
      and r.relation_type in ('parent', 'child', 'spouse', 'sibling')
  ),
  parent_edges as (
    select r.source_person_id as parent_id, r.target_person_id as child_id
    from approved_relationships r
    where r.relation_type = 'parent'
    union
    select r.target_person_id as parent_id, r.source_person_id as child_id
    from approved_relationships r
    where r.relation_type = 'child'
  ),
  sibling_edges as (
    select r.source_person_id as from_id, r.target_person_id as to_id, false as is_inferred
    from approved_relationships r
    where r.relation_type = 'sibling'
    union
    select r.target_person_id, r.source_person_id, false
    from approved_relationships r
    where r.relation_type = 'sibling'
    union
    select distinct a.child_id, b.child_id, true
    from parent_edges a
    join parent_edges b
      on b.parent_id = a.parent_id
     and b.child_id <> a.child_id
  ),
  graph as (
    select e.parent_id as from_id, e.child_id as to_id, 'child'::text as relation_type, false as is_inferred
    from parent_edges e
    union all
    select e.child_id, e.parent_id, 'parent'::text, false
    from parent_edges e
    union all
    select r.source_person_id, r.target_person_id, 'spouse'::text, false
    from approved_relationships r
    where r.relation_type = 'spouse'
    union all
    select r.target_person_id, r.source_person_id, 'spouse'::text, false
    from approved_relationships r
    where r.relation_type = 'spouse'
    union all
    select s.from_id, s.to_id, 'sibling'::text, s.is_inferred
    from sibling_edges s
  ),
  walk as (
    select
      0::integer as depth,
      p.id as current_id,
      array[p.id]::uuid[] as path_ids,
      array['self'::text] as relation_types,
      array[false]::boolean[] as inferred_flags
    from public.people p
    where p.id = p_from_person_id
      and p.status = 'approved'

    union all

    select
      w.depth + 1,
      g.to_id,
      w.path_ids || g.to_id,
      w.relation_types || g.relation_type,
      w.inferred_flags || g.is_inferred
    from walk w
    join graph g on g.from_id = w.current_id
    join public.people target_person on target_person.id = g.to_id and target_person.status = 'approved'
    where w.depth < least(greatest(coalesce(p_max_depth, 6), 1), 6)
      and not (g.to_id = any(w.path_ids))
  ),
  best as (
    select w.*
    from walk w
    where w.current_id = p_to_person_id
    order by w.depth, cardinality(w.path_ids)
    limit 1
  ),
  expanded as (
    select
      (u.ordinality - 1)::integer as step_no,
      u.pid as person_id,
      b.relation_types[u.ordinality] as relation_type,
      b.inferred_flags[u.ordinality] as is_inferred
    from best b,
    unnest(b.path_ids) with ordinality as u(pid, ordinality)
  )
  select
    e.step_no,
    p.id,
    p.full_name,
    p.gender,
    e.relation_type,
    e.is_inferred
  from expanded e
  join public.people p on p.id = e.person_id and p.status = 'approved'
  order by e.step_no;
$$;

revoke all on function public.get_kinship_path(uuid, uuid, integer) from public;
grant execute on function public.get_kinship_path(uuid, uuid, integer) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
