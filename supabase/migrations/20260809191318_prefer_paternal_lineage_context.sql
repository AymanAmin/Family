create or replace function public.get_person_lineage_context(p_person_id uuid)
returns table(
  lineage_id uuid,
  lineage_name text,
  root_person_id uuid,
  root_name text,
  generation integer,
  branch_person_id uuid,
  branch_name text,
  ancestry_path jsonb
)
language sql
stable
set search_path to ''
as $function$
  with recursive ancestry(person_id,generation,path) as (
    select p_person_id,0,array[p_person_id]::uuid[]
    union all
    select e.parent_id,a.generation+1,a.path||e.parent_id
    from ancestry a
    join public.canonical_parent_edges e on e.child_id=a.person_id
    join public.people parent_person
      on parent_person.id=e.parent_id
     and parent_person.status='approved'
     and parent_person.archived_at is null
     and parent_person.gender='male'
    where a.generation<20
      and not(e.parent_id=any(a.path))
  ), matches as (
    select l.id lineage_id,l.display_name lineage_name,l.root_person_id,a.generation,a.path
    from ancestry a
    join public.lineages l
      on l.root_person_id=a.person_id
     and l.status='approved'
  ), resolved as (
    select
      m.*,
      case when m.generation=0 then m.root_person_id else m.path[m.generation] end as resolved_branch_person_id
    from matches m
  )
  select
    m.lineage_id,
    m.lineage_name,
    m.root_person_id,
    rootp.full_name,
    m.generation,
    m.resolved_branch_person_id,
    case
      when m.generation=0 then rootp.full_name
      else coalesce(lb.display_name, branchp.full_name)
    end as branch_name,
    (
      select jsonb_agg(
        jsonb_build_object(
          'person_id',u.person_id,
          'full_name',pp.full_name,
          'generation',m.generation-(u.ord::integer-1)
        ) order by u.ord desc
      )
      from unnest(m.path) with ordinality as u(person_id,ord)
      join public.people pp on pp.id=u.person_id
    ) as ancestry_path
  from resolved m
  join public.people rootp
    on rootp.id=m.root_person_id
   and rootp.status='approved'
   and rootp.archived_at is null
  left join public.people branchp on branchp.id=m.resolved_branch_person_id
  left join public.lineage_branches lb
    on lb.lineage_id=m.lineage_id
   and lb.branch_person_id=m.resolved_branch_person_id
   and lb.status='approved'
   and lb.is_current=true
  order by m.generation desc,m.lineage_name;
$function$;
