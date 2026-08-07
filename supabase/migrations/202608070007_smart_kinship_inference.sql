-- PHASE 4: SMART KINSHIP INFERENCE
-- Derive family relationships from approved parent/child edges instead of storing redundant sibling rows.

begin;

create or replace function public.get_person_kinship(p_person_id uuid)
returns table (
  related_person_id uuid,
  full_name text,
  gender text,
  relation_type text,
  relation_detail text,
  is_inferred boolean,
  shared_parent_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with approved_relationships as (
    select
      r.source_person_id,
      r.target_person_id,
      r.relation_type,
      r.notes
    from public.person_relationships r
    where r.status = 'approved'
  ),
  parent_edges as (
    -- source is parent of target
    select r.source_person_id as parent_id, r.target_person_id as child_id
    from approved_relationships r
    where r.relation_type = 'parent'

    union

    -- source is child of target
    select r.target_person_id as parent_id, r.source_person_id as child_id
    from approved_relationships r
    where r.relation_type = 'child'
  ),
  direct_kin as (
    select
      p.id as related_person_id,
      p.full_name,
      p.gender,
      'parent'::text as relation_type,
      null::text as relation_detail,
      false as is_inferred,
      null::integer as shared_parent_count
    from parent_edges e
    join public.people p on p.id = e.parent_id and p.status = 'approved'
    where e.child_id = p_person_id

    union all

    select
      p.id,
      p.full_name,
      p.gender,
      'child'::text,
      null::text,
      false,
      null::integer
    from parent_edges e
    join public.people p on p.id = e.child_id and p.status = 'approved'
    where e.parent_id = p_person_id

    union all

    select
      p.id,
      p.full_name,
      p.gender,
      'spouse'::text,
      r.notes,
      false,
      null::integer
    from approved_relationships r
    join public.people p
      on p.id = case
        when r.source_person_id = p_person_id then r.target_person_id
        else r.source_person_id
      end
      and p.status = 'approved'
    where r.relation_type = 'spouse'
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)

    union all

    select
      p.id,
      p.full_name,
      p.gender,
      'sibling'::text,
      r.notes,
      false,
      null::integer
    from approved_relationships r
    join public.people p
      on p.id = case
        when r.source_person_id = p_person_id then r.target_person_id
        else r.source_person_id
      end
      and p.status = 'approved'
    where r.relation_type = 'sibling'
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)

    union all

    select
      p.id,
      p.full_name,
      p.gender,
      r.relation_type,
      r.notes,
      false,
      null::integer
    from approved_relationships r
    join public.people p
      on p.id = case
        when r.source_person_id = p_person_id then r.target_person_id
        else r.source_person_id
      end
      and p.status = 'approved'
    where r.relation_type in ('guardian', 'other')
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)
  ),
  my_parents as (
    select e.parent_id
    from parent_edges e
    where e.child_id = p_person_id
  ),
  sibling_counts as (
    select
      e.child_id as sibling_id,
      count(distinct e.parent_id)::integer as shared_parent_count
    from parent_edges e
    join my_parents mp on mp.parent_id = e.parent_id
    where e.child_id <> p_person_id
    group by e.child_id
  ),
  inferred_siblings as (
    select
      p.id as related_person_id,
      p.full_name,
      p.gender,
      'sibling'::text as relation_type,
      case
        when sc.shared_parent_count >= 2 then 'يشترك معك في الأب والأم'
        else 'يشترك معك في أحد الوالدين'
      end as relation_detail,
      true as is_inferred,
      sc.shared_parent_count
    from sibling_counts sc
    join public.people p on p.id = sc.sibling_id and p.status = 'approved'
  ),
  inferred_grandparents as (
    select distinct
      gp.id as related_person_id,
      gp.full_name,
      gp.gender,
      'grandparent'::text as relation_type,
      'مستنتجة من علاقة الوالدين'::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from parent_edges parent_link
    join parent_edges grand_link on grand_link.child_id = parent_link.parent_id
    join public.people gp on gp.id = grand_link.parent_id and gp.status = 'approved'
    where parent_link.child_id = p_person_id
      and gp.id <> p_person_id
  ),
  inferred_grandchildren as (
    select distinct
      gc.id as related_person_id,
      gc.full_name,
      gc.gender,
      'grandchild'::text as relation_type,
      'مستنتجة من علاقة الأبناء'::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from parent_edges child_link
    join parent_edges grandchild_link on grandchild_link.parent_id = child_link.child_id
    join public.people gc on gc.id = grandchild_link.child_id and gc.status = 'approved'
    where child_link.parent_id = p_person_id
      and gc.id <> p_person_id
  ),
  combined as (
    select * from direct_kin
    union all
    select * from inferred_siblings
    union all
    select * from inferred_grandparents
    union all
    select * from inferred_grandchildren
  )
  select distinct on (c.related_person_id, c.relation_type)
    c.related_person_id,
    c.full_name,
    c.gender,
    c.relation_type,
    c.relation_detail,
    c.is_inferred,
    c.shared_parent_count
  from combined c
  where c.related_person_id <> p_person_id
  order by
    c.related_person_id,
    c.relation_type,
    c.is_inferred asc,
    c.shared_parent_count desc nulls last;
$$;

revoke all on function public.get_person_kinship(uuid) from public;
grant execute on function public.get_person_kinship(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
