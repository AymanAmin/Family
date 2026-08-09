create or replace function public.get_lineage_children_v2(p_parent_person_id uuid)
returns table(
  person_id uuid,
  full_name text,
  gender text,
  direct_child_count bigint,
  has_children boolean,
  branch_name text,
  spouses jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    child.id as person_id,
    child.full_name,
    child.gender,
    (
      select count(*)::bigint
      from public.canonical_parent_edges ce2
      where ce2.parent_id = child.id
    ) as direct_child_count,
    exists(
      select 1
      from public.canonical_parent_edges ce3
      where ce3.parent_id = child.id
    ) as has_children,
    (
      select lb.display_name
      from public.lineage_branches lb
      where lb.branch_person_id = child.id
        and lb.status = 'approved'
        and coalesce(lb.is_current, true)
      order by lb.approved_at desc nulls last, lb.created_at desc
      limit 1
    ) as branch_name,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'family_unit_id', fu.id,
          'person_id', spouse.id,
          'full_name', spouse.full_name,
          'gender', spouse.gender,
          'display_name', fu.display_name,
          'child_count', (
            select count(*)::bigint
            from public.family_unit_members fum
            where fum.family_unit_id = fu.id
              and fum.member_role = 'child'
          )
        )
        order by spouse.full_name, fu.id
      )
      from public.family_units fu
      join public.people spouse
        on spouse.id = case
          when fu.husband_person_id = child.id then fu.wife_person_id
          else fu.husband_person_id
        end
      where fu.status = 'approved'
        and (fu.husband_person_id = child.id or fu.wife_person_id = child.id)
        and spouse.status = 'approved'
        and spouse.archived_at is null
    ), '[]'::jsonb) as spouses
  from public.canonical_parent_edges ce
  join public.people child on child.id = ce.child_id
  where ce.parent_id = p_parent_person_id
  order by child.full_name, child.id;
$$;

create or replace function public.get_lineage_households(p_person_id uuid)
returns table(
  family_unit_id uuid,
  family_display_name text,
  spouse_person_id uuid,
  spouse_name text,
  spouse_gender text,
  child_person_id uuid,
  child_name text,
  child_gender text,
  child_direct_child_count bigint,
  child_has_children boolean,
  group_type text
)
language sql
stable
security invoker
set search_path = public
as $$
  with household_rows as (
    select
      fu.id as family_unit_id,
      fu.display_name as family_display_name,
      spouse.id as spouse_person_id,
      spouse.full_name as spouse_name,
      spouse.gender as spouse_gender,
      child.id as child_person_id,
      child.full_name as child_name,
      child.gender as child_gender,
      case when child.id is null then 0::bigint else (
        select count(*)::bigint
        from public.canonical_parent_edges ce2
        where ce2.parent_id = child.id
      ) end as child_direct_child_count,
      case when child.id is null then false else exists(
        select 1
        from public.canonical_parent_edges ce3
        where ce3.parent_id = child.id
      ) end as child_has_children,
      'family_unit'::text as group_type
    from public.family_units fu
    join public.people spouse
      on spouse.id = case
        when fu.husband_person_id = p_person_id then fu.wife_person_id
        else fu.husband_person_id
      end
    left join public.family_unit_members fum
      on fum.family_unit_id = fu.id
      and fum.member_role = 'child'
    left join public.people child
      on child.id = fum.person_id
      and child.status = 'approved'
      and child.archived_at is null
    where fu.status = 'approved'
      and (fu.husband_person_id = p_person_id or fu.wife_person_id = p_person_id)
      and spouse.status = 'approved'
      and spouse.archived_at is null
  ),
  unassigned_rows as (
    select
      null::uuid as family_unit_id,
      null::text as family_display_name,
      null::uuid as spouse_person_id,
      null::text as spouse_name,
      null::text as spouse_gender,
      child.id as child_person_id,
      child.full_name as child_name,
      child.gender as child_gender,
      (
        select count(*)::bigint
        from public.canonical_parent_edges ce2
        where ce2.parent_id = child.id
      ) as child_direct_child_count,
      exists(
        select 1
        from public.canonical_parent_edges ce3
        where ce3.parent_id = child.id
      ) as child_has_children,
      'unassigned'::text as group_type
    from public.canonical_parent_edges ce
    join public.people child on child.id = ce.child_id
    where ce.parent_id = p_person_id
      and not exists (
        select 1
        from public.family_units fu
        join public.family_unit_members fum
          on fum.family_unit_id = fu.id
          and fum.member_role = 'child'
          and fum.person_id = child.id
        where fu.status = 'approved'
          and (fu.husband_person_id = p_person_id or fu.wife_person_id = p_person_id)
      )
  ), combined as (
    select * from household_rows
    union all
    select * from unassigned_rows
  )
  select *
  from combined
  order by
    case when group_type = 'family_unit' then 0 else 1 end,
    spouse_name nulls last,
    family_unit_id nulls last,
    child_name nulls last;
$$;

revoke all on function public.get_lineage_children_v2(uuid) from public;
revoke all on function public.get_lineage_households(uuid) from public;
grant execute on function public.get_lineage_children_v2(uuid) to anon, authenticated;
grant execute on function public.get_lineage_households(uuid) to anon, authenticated;

comment on function public.get_lineage_children_v2(uuid) is 'Lazy lineage child navigation with spouse summaries for each visible child.';
comment on function public.get_lineage_households(uuid) is 'Returns each approved spouse family unit and its shared children, plus direct children whose other parent is not yet attributable to a family unit.';
