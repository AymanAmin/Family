begin;

-- Archived or otherwise non-approved people must never participate in the active lineage graph.
create or replace view public.canonical_parent_edges
with (security_invoker = true)
as
select r.source_person_id as parent_id, r.target_person_id as child_id
from public.person_relationships r
join public.people parent_person on parent_person.id = r.source_person_id and parent_person.status = 'approved'
join public.people child_person on child_person.id = r.target_person_id and child_person.status = 'approved'
where r.status = 'approved' and r.relation_type = 'parent'
union
select r.target_person_id as parent_id, r.source_person_id as child_id
from public.person_relationships r
join public.people child_person on child_person.id = r.source_person_id and child_person.status = 'approved'
join public.people parent_person on parent_person.id = r.target_person_id and parent_person.status = 'approved'
where r.status = 'approved' and r.relation_type = 'child';

-- Keep family-unit membership aligned with the active person graph as well.
create or replace view public.family_unit_members
with (security_invoker = true)
as
select fu.id as family_unit_id, fu.husband_person_id as person_id, 'husband'::text as member_role, 0::integer as generation
from public.family_units fu
join public.people husband on husband.id = fu.husband_person_id and husband.status = 'approved'
join public.people wife on wife.id = fu.wife_person_id and wife.status = 'approved'
where fu.status = 'approved'
union all
select fu.id, fu.wife_person_id, 'wife'::text, 0::integer
from public.family_units fu
join public.people husband on husband.id = fu.husband_person_id and husband.status = 'approved'
join public.people wife on wife.id = fu.wife_person_id and wife.status = 'approved'
where fu.status = 'approved'
union
select fu.id, h.child_id, 'child'::text, 1::integer
from public.family_units fu
join public.people husband on husband.id = fu.husband_person_id and husband.status = 'approved'
join public.people wife on wife.id = fu.wife_person_id and wife.status = 'approved'
join public.canonical_parent_edges h on h.parent_id = fu.husband_person_id
join public.canonical_parent_edges w on w.parent_id = fu.wife_person_id and w.child_id = h.child_id
where fu.status = 'approved';

create or replace function public.get_lineage_review_issues()
returns table (
  issue_key text,
  category text,
  issue_type text,
  severity text,
  person_id uuid,
  person_name text,
  detail jsonb
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  with parent_rollup as (
    select
      c.id as person_id,
      c.full_name as person_name,
      count(e.parent_id)::int as parent_count,
      count(*) filter (where p.gender = 'male')::int as father_count,
      count(*) filter (where p.gender = 'female')::int as mother_count,
      count(*) filter (where e.parent_id is not null and p.gender is null)::int as unknown_gender_count,
      coalesce(array_agg(p.id order by p.full_name) filter (where p.gender = 'male'), array[]::uuid[]) as father_ids,
      coalesce(array_agg(p.full_name order by p.full_name) filter (where p.gender = 'male'), array[]::text[]) as father_names,
      coalesce(array_agg(p.id order by p.full_name) filter (where p.gender = 'female'), array[]::uuid[]) as mother_ids,
      coalesce(array_agg(p.full_name order by p.full_name) filter (where p.gender = 'female'), array[]::text[]) as mother_names,
      coalesce(array_agg(p.id order by p.full_name) filter (where e.parent_id is not null and p.gender is null), array[]::uuid[]) as unknown_parent_ids,
      coalesce(array_agg(p.full_name order by p.full_name) filter (where e.parent_id is not null and p.gender is null), array[]::text[]) as unknown_parent_names
    from public.people c
    left join public.canonical_parent_edges e on e.child_id = c.id
    left join public.people p on p.id = e.parent_id
    where c.status = 'approved'
    group by c.id, c.full_name
  ), single_parent as (
    select e.child_id, min(e.parent_id::text)::uuid as parent_id
    from public.canonical_parent_edges e
    group by e.child_id
    having count(*) = 1
  ), spouse_edges as (
    select r.source_person_id as person_id, r.target_person_id as spouse_id
    from public.person_relationships r
    join public.people a on a.id = r.source_person_id and a.status = 'approved'
    join public.people b on b.id = r.target_person_id and b.status = 'approved'
    where r.status = 'approved' and r.relation_type = 'spouse'
    union
    select r.target_person_id, r.source_person_id
    from public.person_relationships r
    join public.people a on a.id = r.source_person_id and a.status = 'approved'
    join public.people b on b.id = r.target_person_id and b.status = 'approved'
    where r.status = 'approved' and r.relation_type = 'spouse'
  ), candidate_rows as (
    select distinct
      sp.child_id,
      candidate.id as candidate_id,
      candidate.full_name as candidate_name,
      candidate.gender as candidate_gender
    from single_parent sp
    join public.people known_parent on known_parent.id = sp.parent_id and known_parent.status = 'approved'
    join spouse_edges se on se.person_id = sp.parent_id
    join public.people candidate on candidate.id = se.spouse_id and candidate.status = 'approved'
    where (known_parent.gender = 'male' and candidate.gender = 'female')
       or (known_parent.gender = 'female' and candidate.gender = 'male')
  ), candidate_groups as (
    select
      cr.child_id,
      count(*)::int as suggestion_count,
      jsonb_agg(
        jsonb_build_object(
          'person_id', cr.candidate_id,
          'full_name', cr.candidate_name,
          'gender', cr.candidate_gender
        ) order by cr.candidate_name, cr.candidate_id
      ) as suggestions
    from candidate_rows cr
    group by cr.child_id
  ), parent_issues as (
    select
      'parent:' || pr.person_id::text as issue_key,
      case
        when pr.father_count > 1 or pr.mother_count > 1 or pr.parent_count > 2 then 'conflict'
        when pr.unknown_gender_count > 0 then 'unknown'
        else 'incomplete'
      end as category,
      case
        when pr.father_count > 1 then 'multiple_fathers'
        when pr.mother_count > 1 then 'multiple_mothers'
        when pr.parent_count > 2 then 'more_than_two_parents'
        when pr.unknown_gender_count > 0 then 'parent_gender_missing'
        when pr.father_count = 1 and pr.mother_count = 0 then 'missing_mother'
        when pr.mother_count = 1 and pr.father_count = 0 then 'missing_father'
        else 'incomplete_parent_data'
      end as issue_type,
      case
        when pr.father_count > 1 or pr.mother_count > 1 or pr.parent_count > 2 then 'high'
        when pr.unknown_gender_count > 0 then 'medium'
        else 'low'
      end as severity,
      pr.person_id,
      pr.person_name,
      jsonb_build_object(
        'parent_count', pr.parent_count,
        'father_ids', to_jsonb(pr.father_ids),
        'father_names', to_jsonb(pr.father_names),
        'mother_ids', to_jsonb(pr.mother_ids),
        'mother_names', to_jsonb(pr.mother_names),
        'unknown_parent_ids', to_jsonb(pr.unknown_parent_ids),
        'unknown_parent_names', to_jsonb(pr.unknown_parent_names),
        'suggestion_count', coalesce(cg.suggestion_count, 0),
        'suggestions', coalesce(cg.suggestions, '[]'::jsonb)
      ) as detail
    from parent_rollup pr
    left join candidate_groups cg on cg.child_id = pr.person_id
    where pr.father_count > 1
       or pr.mother_count > 1
       or pr.parent_count > 2
       or pr.unknown_gender_count > 0
       or (pr.parent_count = 1 and pr.father_count = 1 and pr.mother_count = 0)
       or (pr.parent_count = 1 and pr.mother_count = 1 and pr.father_count = 0)
  ), normalized_people as (
    select
      p.id,
      p.full_name,
      p.gender,
      p.birth_year,
      p.family_id,
      p.created_at,
      lower(trim(regexp_replace(translate(p.full_name, 'إأآةى', 'اااهي'), '\s+', ' ', 'g'))) as normalized_name
    from public.people p
    where p.status = 'approved'
  ), duplicate_groups as (
    select
      np.normalized_name,
      min(np.full_name) as display_name,
      (array_agg(np.id order by np.created_at, np.id))[1] as person_id,
      count(*)::int as duplicate_count,
      jsonb_agg(
        jsonb_build_object(
          'id', np.id,
          'full_name', np.full_name,
          'gender', np.gender,
          'birth_year', np.birth_year,
          'family_id', np.family_id
        ) order by np.created_at, np.id
      ) as records
    from normalized_people np
    group by np.normalized_name
    having count(*) > 1
  ), duplicate_issues as (
    select
      'duplicate:' || md5(dg.normalized_name) as issue_key,
      'duplicate'::text as category,
      'possible_duplicate'::text as issue_type,
      'medium'::text as severity,
      dg.person_id,
      dg.display_name as person_name,
      jsonb_build_object(
        'normalized_name', dg.normalized_name,
        'duplicate_count', dg.duplicate_count,
        'records', dg.records
      ) as detail
    from duplicate_groups dg
  ), all_issues as (
    select * from parent_issues
    union all
    select * from duplicate_issues
  )
  select
    ai.issue_key,
    ai.category,
    ai.issue_type,
    ai.severity,
    ai.person_id,
    ai.person_name,
    ai.detail
  from all_issues ai
  order by
    case ai.category when 'conflict' then 1 when 'duplicate' then 2 when 'unknown' then 3 else 4 end,
    ai.person_name,
    ai.issue_key;
end;
$$;

revoke all on function public.get_lineage_review_issues() from public, anon;
grant execute on function public.get_lineage_review_issues() to authenticated;

notify pgrst, 'reload schema';
commit;
