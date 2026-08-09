create or replace function public.get_lineage_overview(
  p_root_person_id uuid,
  p_max_depth integer default 20
)
returns table(
  root_person_id uuid,
  descendant_count integer,
  direct_children_count integer,
  max_depth integer
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with recursive walk(person_id, depth, path) as (
    select p_root_person_id, 0, array[p_root_person_id]::uuid[]
    union all
    select e.child_id, w.depth + 1, w.path || e.child_id
    from walk w
    join public.canonical_parent_edges e on e.parent_id = w.person_id
    where w.depth < greatest(1, least(coalesce(p_max_depth, 20), 30))
      and not (e.child_id = any(w.path))
  )
  select
    p_root_person_id,
    count(distinct w.person_id) filter (where w.depth > 0)::integer,
    (select count(distinct e.child_id)::integer from public.canonical_parent_edges e where e.parent_id = p_root_person_id),
    coalesce(max(w.depth), 0)::integer
  from walk w;
$function$;

create or replace function public.get_lineage_children(p_parent_person_id uuid)
returns table(
  person_id uuid,
  full_name text,
  gender text,
  direct_child_count integer,
  has_children boolean,
  branch_name text
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    child.id,
    child.full_name,
    child.gender,
    count(distinct grandchild.child_id)::integer as direct_child_count,
    (count(distinct grandchild.child_id) > 0) as has_children,
    lb.display_name as branch_name
  from public.canonical_parent_edges edge
  join public.people child
    on child.id = edge.child_id
   and child.status = 'approved'
   and child.archived_at is null
  left join public.canonical_parent_edges grandchild
    on grandchild.parent_id = child.id
  left join public.lineages lineage
    on lineage.root_person_id = p_parent_person_id
   and lineage.status = 'approved'
  left join public.lineage_branches lb
    on lb.lineage_id = lineage.id
   and lb.branch_person_id = child.id
   and lb.status = 'approved'
  where edge.parent_id = p_parent_person_id
  group by child.id, child.full_name, child.gender, lb.display_name
  order by child.full_name, child.id;
$function$;

revoke all on function public.get_lineage_overview(uuid, integer) from public;
revoke all on function public.get_lineage_children(uuid) from public;
grant execute on function public.get_lineage_overview(uuid, integer) to anon, authenticated, service_role;
grant execute on function public.get_lineage_children(uuid) to anon, authenticated, service_role;
