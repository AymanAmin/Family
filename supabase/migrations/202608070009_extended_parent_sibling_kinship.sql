-- PHASE 6: ROBUST EXTENDED KINSHIP
-- Infers uncles/aunts/cousins from either direct sibling links of a parent
-- OR shared parents/grandparents. Also derives nephews/nieces and great-grandparents.

begin;

create or replace function public.get_person_extended_kinship(p_person_id uuid)
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
    select r.source_person_id, r.target_person_id, r.relation_type, r.notes
    from public.person_relationships r
    where r.status = 'approved'
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
  my_parents as (
    select distinct e.parent_id, p.gender as parent_gender
    from parent_edges e
    join public.people p on p.id = e.parent_id and p.status = 'approved'
    where e.child_id = p_person_id
  ),
  direct_parent_siblings as (
    select distinct
      mp.parent_id as my_parent_id,
      mp.parent_gender,
      case
        when r.source_person_id = mp.parent_id then r.target_person_id
        else r.source_person_id
      end as relative_id
    from my_parents mp
    join approved_relationships r
      on r.relation_type = 'sibling'
     and (r.source_person_id = mp.parent_id or r.target_person_id = mp.parent_id)
  ),
  shared_parent_siblings as (
    select distinct
      mp.parent_id as my_parent_id,
      mp.parent_gender,
      sibling_edge.child_id as relative_id
    from my_parents mp
    join parent_edges grandparent_edge on grandparent_edge.child_id = mp.parent_id
    join parent_edges sibling_edge on sibling_edge.parent_id = grandparent_edge.parent_id
    where sibling_edge.child_id <> mp.parent_id
  ),
  parent_sibling_ids as (
    select * from direct_parent_siblings
    union
    select * from shared_parent_siblings
  ),
  parent_siblings as (
    select distinct
      psi.my_parent_id,
      psi.parent_gender,
      psi.relative_id,
      rp.gender as relative_gender,
      rp.full_name as relative_name
    from parent_sibling_ids psi
    join public.people rp on rp.id = psi.relative_id and rp.status = 'approved'
    where psi.relative_id <> p_person_id
  ),
  uncles_aunts as (
    select distinct
      rp.id,
      rp.full_name,
      rp.gender,
      case
        when ps.parent_gender = 'male' and rp.gender = 'male' then 'paternal_uncle'
        when ps.parent_gender = 'male' and rp.gender = 'female' then 'paternal_aunt'
        when ps.parent_gender = 'female' and rp.gender = 'male' then 'maternal_uncle'
        when ps.parent_gender = 'female' and rp.gender = 'female' then 'maternal_aunt'
        when ps.parent_gender = 'male' then 'paternal_parent_sibling'
        when ps.parent_gender = 'female' then 'maternal_parent_sibling'
        else 'parent_sibling'
      end::text as relation_type,
      case
        when ps.parent_gender = 'male' then 'مستنتجة من صلة الأب بإخوته'
        when ps.parent_gender = 'female' then 'مستنتجة من صلة الأم بإخوتها'
        else 'مستنتجة من صلة أحد الوالدين بإخوته'
      end::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from parent_siblings ps
    join public.people rp on rp.id = ps.relative_id and rp.status = 'approved'
  ),
  cousins as (
    select distinct
      cp.id,
      cp.full_name,
      cp.gender,
      case
        when ps.parent_gender = 'male' and ps.relative_gender = 'male' then 'paternal_uncle_child'
        when ps.parent_gender = 'male' and ps.relative_gender = 'female' then 'paternal_aunt_child'
        when ps.parent_gender = 'female' and ps.relative_gender = 'male' then 'maternal_uncle_child'
        when ps.parent_gender = 'female' and ps.relative_gender = 'female' then 'maternal_aunt_child'
        else 'cousin'
      end::text as relation_type,
      ('عن طريق ' || ps.relative_name)::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from parent_siblings ps
    join parent_edges child_edge on child_edge.parent_id = ps.relative_id
    join public.people cp on cp.id = child_edge.child_id and cp.status = 'approved'
    where cp.id <> p_person_id
  ),
  my_direct_siblings as (
    select distinct case
      when r.source_person_id = p_person_id then r.target_person_id
      else r.source_person_id
    end as sibling_id
    from approved_relationships r
    where r.relation_type = 'sibling'
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)
  ),
  my_shared_siblings as (
    select distinct e.child_id as sibling_id
    from parent_edges e
    join my_parents mp on mp.parent_id = e.parent_id
    where e.child_id <> p_person_id
  ),
  my_siblings as (
    select sibling_id from my_direct_siblings
    union
    select sibling_id from my_shared_siblings
  ),
  nephews_nieces as (
    select distinct
      np.id,
      np.full_name,
      np.gender,
      case when np.gender = 'female' then 'niece' else 'nephew' end::text as relation_type,
      ('من أبناء ' || sp.full_name)::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from my_siblings ms
    join public.people sp on sp.id = ms.sibling_id and sp.status = 'approved'
    join parent_edges pe on pe.parent_id = ms.sibling_id
    join public.people np on np.id = pe.child_id and np.status = 'approved'
    where np.id <> p_person_id
  ),
  great_grandparents as (
    select distinct
      ggp.id,
      ggp.full_name,
      ggp.gender,
      'great_grandparent'::text as relation_type,
      'من الجيل الأعلى في شجرة النسب'::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from my_parents mp
    join parent_edges grandparent_edge on grandparent_edge.child_id = mp.parent_id
    join parent_edges great_edge on great_edge.child_id = grandparent_edge.parent_id
    join public.people ggp on ggp.id = great_edge.parent_id and ggp.status = 'approved'
    where ggp.id <> p_person_id
  ),
  combined as (
    select * from uncles_aunts
    union all select * from cousins
    union all select * from nephews_nieces
    union all select * from great_grandparents
  )
  select distinct on (c.id, c.relation_type)
    c.id as related_person_id,
    c.full_name,
    c.gender,
    c.relation_type,
    c.relation_detail,
    c.is_inferred,
    c.shared_parent_count
  from combined c
  where c.id <> p_person_id
  order by c.id, c.relation_type;
$$;

revoke all on function public.get_person_extended_kinship(uuid) from public;
grant execute on function public.get_person_extended_kinship(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
