begin;

create or replace function public.get_public_top_ancestors()
returns table(
  root_person_id uuid,
  root_name text,
  root_gender text,
  photo_url text,
  lineage_id uuid,
  lineage_name text,
  descendant_count integer,
  max_depth integer,
  direct_children_count integer,
  spouses jsonb,
  branches jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive
  roots as (
    select
      l.id as lineage_id,
      l.display_name as lineage_name,
      p.id as root_person_id,
      p.full_name as root_name,
      p.gender as root_gender,
      p.photo_url
    from public.lineages l
    join public.people p on p.id = l.root_person_id
    where l.status = 'approved'
      and p.status = 'approved'
      and p.archived_at is null
      and not exists (
        select 1
        from public.canonical_parent_edges pe
        where pe.child_id = p.id
      )
      and exists (
        select 1
        from public.canonical_parent_edges ce
        where ce.parent_id = p.id
      )
  ),
  walk(lineage_id, root_person_id, person_id, depth, path) as (
    select r.lineage_id, r.root_person_id, r.root_person_id, 0, array[r.root_person_id]::uuid[]
    from roots r
    union all
    select w.lineage_id, w.root_person_id, e.child_id, w.depth + 1, w.path || e.child_id
    from walk w
    join public.canonical_parent_edges e on e.parent_id = w.person_id
    where w.depth < 20
      and not (e.child_id = any(w.path))
  ),
  stats as (
    select
      r.lineage_id,
      r.lineage_name,
      r.root_person_id,
      r.root_name,
      r.root_gender,
      r.photo_url,
      count(distinct w.person_id) filter (where w.depth > 0)::integer as descendant_count,
      coalesce(max(w.depth), 0)::integer as max_depth,
      (select count(distinct e.child_id)::integer from public.canonical_parent_edges e where e.parent_id = r.root_person_id) as direct_children_count
    from roots r
    left join walk w on w.lineage_id = r.lineage_id and w.root_person_id = r.root_person_id
    group by r.lineage_id, r.lineage_name, r.root_person_id, r.root_name, r.root_gender, r.photo_url
  )
  select
    s.root_person_id,
    s.root_name,
    s.root_gender,
    s.photo_url,
    s.lineage_id,
    s.lineage_name,
    s.descendant_count,
    s.max_depth,
    s.direct_children_count,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'person_id', spouse_person.id,
          'full_name', spouse_person.full_name,
          'gender', spouse_person.gender,
          'photo_url', spouse_person.photo_url
        ) order by spouse_person.full_name
      )
      from public.family_units fu
      join public.people spouse_person on spouse_person.id = case
        when fu.husband_person_id = s.root_person_id then fu.wife_person_id
        else fu.husband_person_id
      end
      where fu.status = 'approved'
        and (fu.husband_person_id = s.root_person_id or fu.wife_person_id = s.root_person_id)
        and spouse_person.status = 'approved'
        and spouse_person.archived_at is null
    ), '[]'::jsonb) as spouses,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'person_id', child.id,
          'full_name', child.full_name,
          'gender', child.gender,
          'photo_url', child.photo_url
        ) order by child.full_name
      )
      from public.canonical_parent_edges e
      join public.people child on child.id = e.child_id
      where e.parent_id = s.root_person_id
        and child.status = 'approved'
        and child.archived_at is null
    ), '[]'::jsonb) as branches
  from stats s
  order by s.descendant_count desc, s.max_depth desc, s.root_name;
$$;

revoke all on function public.get_public_top_ancestors() from public;
grant execute on function public.get_public_top_ancestors() to anon, authenticated;

notify pgrst, 'reload schema';

commit;
