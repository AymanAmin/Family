begin;

create or replace function public.get_lineage_structure_candidates()
returns table(
  root_person_id uuid,
  root_name text,
  root_gender text,
  descendant_count integer,
  max_depth integer,
  direct_children_count integer,
  overlap_count integer,
  confidence text,
  can_approve boolean,
  suggested_lineage_name text,
  spouses jsonb,
  branches jsonb
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin','super_admin')
  ) then
    raise exception 'Not authorized to review lineage structure';
  end if;

  return query
  with recursive
  covered(person_id, path) as (
    select l.root_person_id, array[l.root_person_id]::uuid[]
    from public.lineages l
    where l.status = 'approved'
    union all
    select e.child_id, c.path || e.child_id
    from covered c
    join public.canonical_parent_edges e on e.parent_id = c.person_id
    where cardinality(c.path) < 21
      and not (e.child_id = any(c.path))
  ),
  roots as (
    select p.id, p.full_name, p.gender
    from public.people p
    where p.status = 'approved'
      and p.archived_at is null
      and not exists (
        select 1 from public.canonical_parent_edges e where e.child_id = p.id
      )
      and not exists (
        select 1 from covered c where c.person_id = p.id
      )
  ),
  walk(root_id, person_id, depth, path) as (
    select r.id, r.id, 0, array[r.id]::uuid[]
    from roots r
    union all
    select w.root_id, e.child_id, w.depth + 1, w.path || e.child_id
    from walk w
    join public.canonical_parent_edges e on e.parent_id = w.person_id
    where w.depth < 12
      and not (e.child_id = any(w.path))
  ),
  stats as (
    select
      r.id,
      r.full_name,
      r.gender,
      count(distinct w.person_id) filter (where w.depth > 0)::integer as descendants,
      coalesce(max(w.depth), 0)::integer as depth,
      (select count(*)::integer from public.canonical_parent_edges e where e.parent_id = r.id) as children,
      count(distinct w.person_id) filter (
        where w.depth > 0 and exists (select 1 from covered c where c.person_id = w.person_id)
      )::integer as overlaps
    from roots r
    left join walk w on w.root_id = r.id
    group by r.id, r.full_name, r.gender
  )
  select
    s.id,
    s.full_name,
    s.gender,
    s.descendants,
    s.depth,
    s.children,
    s.overlaps,
    case
      when s.overlaps > 0 then 'overlap'
      when s.gender = 'male' and s.descendants >= 5 and s.depth >= 2 then 'high'
      when s.gender = 'male' and s.descendants >= 2 then 'medium'
      else 'review'
    end,
    (s.gender = 'male' and s.overlaps = 0 and s.descendants >= 2),
    'عائلة ' || s.full_name,
    coalesce((
      select jsonb_agg(
        jsonb_build_object('person_id', spouse_person.id, 'full_name', spouse_person.full_name, 'gender', spouse_person.gender)
        order by spouse_person.full_name
      )
      from public.family_units fu
      join public.people spouse_person on spouse_person.id = case
        when fu.husband_person_id = s.id then fu.wife_person_id
        else fu.husband_person_id
      end
      where fu.status = 'approved'
        and (fu.husband_person_id = s.id or fu.wife_person_id = s.id)
        and spouse_person.status = 'approved'
        and spouse_person.archived_at is null
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object('person_id', child.id, 'full_name', child.full_name, 'gender', child.gender)
        order by child.full_name
      )
      from public.canonical_parent_edges e
      join public.people child on child.id = e.child_id
      where e.parent_id = s.id
        and child.status = 'approved'
        and child.archived_at is null
    ), '[]'::jsonb)
  from stats s
  where s.descendants >= 2 or s.depth >= 2
  order by
    case
      when s.overlaps = 0 and s.gender = 'male' and s.descendants >= 5 and s.depth >= 2 then 0
      when s.overlaps = 0 and s.gender = 'male' and s.descendants >= 2 then 1
      when s.overlaps > 0 then 3
      else 2
    end,
    s.descendants desc,
    s.depth desc,
    s.full_name
  limit 60;
end;
$$;

revoke all on function public.get_lineage_structure_candidates() from public, anon;
grant execute on function public.get_lineage_structure_candidates() to authenticated;

create or replace function public.approve_lineage_structure_candidate(
  p_root_person_id uuid,
  p_display_name text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_root_name text;
  v_lineage_id uuid;
  v_display_name text;
begin
  if v_actor is null or not exists (
    select 1
    from public.profiles p
    where p.id = v_actor
      and p.account_status = 'active'
      and p.role in ('admin','super_admin')
  ) then
    raise exception 'Not authorized to approve lineage structure';
  end if;

  select p.full_name
  into v_root_name
  from public.people p
  where p.id = p_root_person_id
    and p.status = 'approved'
    and p.archived_at is null;

  if v_root_name is null then
    raise exception 'Root person is not active';
  end if;

  if exists (
    select 1 from public.canonical_parent_edges e where e.child_id = p_root_person_id
  ) then
    raise exception 'Selected person is no longer a top ancestor';
  end if;

  if not exists (
    select 1 from public.canonical_parent_edges e where e.parent_id = p_root_person_id
  ) then
    raise exception 'Selected person has no descendants';
  end if;

  if exists (
    with recursive covered(person_id, path) as (
      select l.root_person_id, array[l.root_person_id]::uuid[]
      from public.lineages l
      where l.status = 'approved'
        and l.root_person_id <> p_root_person_id
      union all
      select e.child_id, c.path || e.child_id
      from covered c
      join public.canonical_parent_edges e on e.parent_id = c.person_id
      where cardinality(c.path) < 21
        and not (e.child_id = any(c.path))
    ),
    proposed(person_id, path) as (
      select p_root_person_id, array[p_root_person_id]::uuid[]
      union all
      select e.child_id, p.path || e.child_id
      from proposed p
      join public.canonical_parent_edges e on e.parent_id = p.person_id
      where cardinality(p.path) < 21
        and not (e.child_id = any(p.path))
    )
    select 1
    from proposed p
    join covered c on c.person_id = p.person_id
    limit 1
  ) then
    raise exception 'Candidate overlaps an existing approved lineage';
  end if;

  v_display_name := coalesce(nullif(trim(p_display_name), ''), 'عائلة ' || v_root_name);

  insert into public.lineages(
    root_person_id, display_name, status, created_by, approved_by, approved_at
  ) values (
    p_root_person_id, v_display_name, 'approved', v_actor, v_actor, now()
  )
  on conflict (root_person_id) do update
  set display_name = excluded.display_name,
      status = 'approved',
      approved_by = v_actor,
      approved_at = now(),
      updated_at = now()
  returning id into v_lineage_id;

  insert into public.lineage_branches(
    lineage_id, branch_person_id, display_name, status, created_by, approved_by, approved_at
  )
  select
    v_lineage_id,
    child.id,
    'فرع ' || child.full_name,
    'approved',
    v_actor,
    v_actor,
    now()
  from public.canonical_parent_edges e
  join public.people child on child.id = e.child_id
  where e.parent_id = p_root_person_id
    and child.status = 'approved'
    and child.archived_at is null
  on conflict (lineage_id, branch_person_id) do update
  set display_name = excluded.display_name,
      status = 'approved',
      approved_by = v_actor,
      approved_at = now(),
      updated_at = now();

  return v_lineage_id;
end;
$$;

revoke all on function public.approve_lineage_structure_candidate(uuid, text) from public, anon;
grant execute on function public.approve_lineage_structure_candidate(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;