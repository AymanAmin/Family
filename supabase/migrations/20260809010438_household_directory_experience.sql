create or replace function public.list_households_v1(
  p_query text default null,
  p_limit integer default 8,
  p_offset integer default 0
)
returns table (
  household_id uuid,
  display_name text,
  husband_person_id uuid,
  husband_name text,
  spouse_count bigint,
  child_count bigint,
  spouse_names text[],
  lineage_name text,
  branch_name text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with household_base as (
    select
      fu.husband_person_id,
      hp.full_name as husband_name,
      count(*)::bigint as spouse_count,
      array_agg(distinct wp.full_name order by wp.full_name) filter (where wp.full_name is not null) as spouse_names
    from public.family_units fu
    join public.people hp on hp.id = fu.husband_person_id and hp.status = 'approved' and hp.archived_at is null
    join public.people wp on wp.id = fu.wife_person_id and wp.status = 'approved' and wp.archived_at is null
    where fu.status = 'approved'
    group by fu.husband_person_id, hp.full_name
  ), enriched as (
    select
      hb.husband_person_id,
      hb.husband_name,
      hb.spouse_count,
      coalesce(hb.spouse_names, '{}'::text[]) as spouse_names,
      coalesce((
        select count(distinct cpe.child_id)::bigint
        from public.canonical_parent_edges cpe
        where cpe.parent_id = hb.husband_person_id
      ), 0::bigint) as child_count,
      lc.lineage_name,
      lc.branch_name
    from household_base hb
    left join lateral (
      select ctx.lineage_name, ctx.branch_name
      from public.get_person_lineage_context(hb.husband_person_id) ctx
      limit 1
    ) lc on true
  ), filtered as (
    select *
    from enriched e
    where coalesce(trim(p_query), '') = ''
       or e.husband_name ilike '%' || trim(p_query) || '%'
       or exists (
         select 1 from unnest(e.spouse_names) s(name)
         where s.name ilike '%' || trim(p_query) || '%'
       )
       or coalesce(e.lineage_name, '') ilike '%' || trim(p_query) || '%'
       or coalesce(e.branch_name, '') ilike '%' || trim(p_query) || '%'
  )
  select
    f.husband_person_id as household_id,
    'أسرة ' || f.husband_name as display_name,
    f.husband_person_id,
    f.husband_name,
    f.spouse_count,
    f.child_count,
    f.spouse_names,
    f.lineage_name,
    f.branch_name,
    count(*) over()::bigint as total_count
  from filtered f
  order by case when coalesce(trim(p_query), '') = '' then null else f.husband_name end asc nulls last,
           f.child_count desc,
           f.husband_name asc
  limit greatest(1, least(coalesce(p_limit, 8), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.list_households_v1(text, integer, integer) from public;
grant execute on function public.list_households_v1(text, integer, integer) to anon, authenticated;

create or replace function public.get_household_stats_v1()
returns table (
  household_count bigint,
  marriage_unit_count bigint,
  children_linked_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(distinct fu.husband_person_id)::bigint as household_count,
    count(distinct fu.id)::bigint as marriage_unit_count,
    count(distinct fum.person_id) filter (where fum.member_role = 'child')::bigint as children_linked_count
  from public.family_units fu
  left join public.family_unit_members fum on fum.family_unit_id = fu.id
  where fu.status = 'approved';
$$;

revoke all on function public.get_household_stats_v1() from public;
grant execute on function public.get_household_stats_v1() to anon, authenticated;
