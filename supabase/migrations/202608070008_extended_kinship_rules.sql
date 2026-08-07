-- PHASE 5: EXTENDED KINSHIP INFERENCE
-- Derives uncles, aunts, cousins, nephews/nieces and great-grandparents
-- from the approved parent/child graph. Nothing redundant is stored.

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
  my_children as (
    select distinct e.child_id
    from parent_edges e
    where e.parent_id = p_person_id
  ),
  direct_sibling_ids as (
    select distinct case
      when r.source_person_id = p_person_id then r.target_person_id
      else r.source_person_id
    end as sibling_id
    from approved_relationships r
    where r.relation_type = 'sibling'
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)
  ),
  sibling_counts as (
    select e.child_id as sibling_id,
           count(distinct e.parent_id)::integer as shared_parent_count
    from parent_edges e
    join my_parents mp on mp.parent_id = e.parent_id
    where e.child_id <> p_person_id
    group by e.child_id
  ),
  all_sibling_ids as (
    select sibling_id from direct_sibling_ids
    union
    select sibling_id from sibling_counts
  ),
  direct_kin as (
    select p.id, p.full_name, p.gender,
           'parent'::text as relation_type,
           null::text as relation_detail,
           false as is_inferred,
           null::integer as shared_parent_count
    from my_parents mp
    join public.people p on p.id = mp.parent_id and p.status = 'approved'

    union all

    select p.id, p.full_name, p.gender,
           'child'::text, null::text, false, null::integer
    from my_children mc
    join public.people p on p.id = mc.child_id and p.status = 'approved'

    union all

    select p.id, p.full_name, p.gender,
           'spouse'::text, r.notes, false, null::integer
    from approved_relationships r
    join public.people p on p.id = case
      when r.source_person_id = p_person_id then r.target_person_id
      else r.source_person_id end
      and p.status = 'approved'
    where r.relation_type = 'spouse'
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)

    union all

    select p.id, p.full_name, p.gender,
           'sibling'::text, r.notes, false, null::integer
    from approved_relationships r
    join public.people p on p.id = case
      when r.source_person_id = p_person_id then r.target_person_id
      else r.source_person_id end
      and p.status = 'approved'
    where r.relation_type = 'sibling'
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)

    union all

    select p.id, p.full_name, p.gender,
           r.relation_type, r.notes, false, null::integer
    from approved_relationships r
    join public.people p on p.id = case
      when r.source_person_id = p_person_id then r.target_person_id
      else r.source_person_id end
      and p.status = 'approved'
    where r.relation_type in ('guardian', 'other')
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)
  ),
  inferred_siblings as (
    select p.id, p.full_name, p.gender,
           'sibling'::text as relation_type,
           case when sc.shared_parent_count >= 2
             then 'يشترك معك في الأب والأم'
             else 'يشترك معك في أحد الوالدين' end as relation_detail,
           true as is_inferred,
           sc.shared_parent_count
    from sibling_counts sc
    join public.people p on p.id = sc.sibling_id and p.status = 'approved'
  ),
  grandparents as (
    select distinct gp.id, gp.full_name, gp.gender,
           'grandparent'::text as relation_type,
           case when mp.parent_gender = 'male' then 'من جهة الأب'
                when mp.parent_gender = 'female' then 'من جهة الأم'
                else 'من جهة أحد الوالدين' end as relation_detail,
           true as is_inferred,
           null::integer as shared_parent_count
    from my_parents mp
    join parent_edges ge on ge.child_id = mp.parent_id
    join public.people gp on gp.id = ge.parent_id and gp.status = 'approved'
    where gp.id <> p_person_id
  ),
  grandchildren as (
    select distinct gc.id, gc.full_name, gc.gender,
           'grandchild'::text as relation_type,
           'مستنتجة من علاقة الأبناء'::text as relation_detail,
           true as is_inferred,
           null::integer as shared_parent_count
    from my_children mc
    join parent_edges ge on ge.parent_id = mc.child_id
    join public.people gc on gc.id = ge.child_id and gc.status = 'approved'
    where gc.id <> p_person_id
  ),
  parent_grandparents as (
    select distinct mp.parent_id as my_parent_id,
           mp.parent_gender,
           ge.parent_id as grandparent_id
    from my_parents mp
    join parent_edges ge on ge.child_id = mp.parent_id
  ),
  parent_siblings_raw as (
    select distinct pg.my_parent_id,
           pg.parent_gender,
           se.child_id as relative_id
    from parent_grandparents pg
    join parent_edges se on se.parent_id = pg.grandparent_id
    where se.child_id <> pg.my_parent_id
      and se.child_id <> p_person_id
  ),
  parent_siblings as (
    select ps.my_parent_id, ps.parent_gender, ps.relative_id,
           rp.gender as relative_gender,
           rp.full_name as relative_name
    from parent_siblings_raw ps
    join public.people rp on rp.id = ps.relative_id and rp.status = 'approved'
  ),
  inferred_uncles_aunts as (
    select distinct rp.id, rp.full_name, rp.gender,
      case
        when ps.parent_gender = 'male' and rp.gender = 'male' then 'paternal_uncle'
        when ps.parent_gender = 'male' and rp.gender = 'female' then 'paternal_aunt'
        when ps.parent_gender = 'female' and rp.gender = 'male' then 'maternal_uncle'
        when ps.parent_gender = 'female' and rp.gender = 'female' then 'maternal_aunt'
        when ps.parent_gender = 'male' then 'paternal_parent_sibling'
        when ps.parent_gender = 'female' then 'maternal_parent_sibling'
        else 'parent_sibling'
      end::text as relation_type,
      case when ps.parent_gender = 'male' then 'من جهة الأب'
           when ps.parent_gender = 'female' then 'من جهة الأم'
           else 'من جهة أحد الوالدين' end::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from parent_siblings ps
    join public.people rp on rp.id = ps.relative_id and rp.status = 'approved'
  ),
  inferred_cousins as (
    select distinct cp.id, cp.full_name, cp.gender,
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
    join parent_edges ce on ce.parent_id = ps.relative_id
    join public.people cp on cp.id = ce.child_id and cp.status = 'approved'
    where cp.id <> p_person_id
  ),
  inferred_nephews_nieces as (
    select distinct np.id, np.full_name, np.gender,
      case when np.gender = 'female' then 'niece' else 'nephew' end::text as relation_type,
      ('من أبناء ' || sp.full_name)::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from all_sibling_ids si
    join public.people sp on sp.id = si.sibling_id and sp.status = 'approved'
    join parent_edges pe on pe.parent_id = si.sibling_id
    join public.people np on np.id = pe.child_id and np.status = 'approved'
    where np.id <> p_person_id
  ),
  great_grandparents as (
    select distinct ggp.id, ggp.full_name, ggp.gender,
      'great_grandparent'::text as relation_type,
      'من الجيل الأعلى في شجرة النسب'::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from my_parents mp
    join parent_edges e1 on e1.child_id = mp.parent_id
    join parent_edges e2 on e2.child_id = e1.parent_id
    join public.people ggp on ggp.id = e2.parent_id and ggp.status = 'approved'
    where ggp.id <> p_person_id
  ),
  great_grandchildren as (
    select distinct ggc.id, ggc.full_name, ggc.gender,
      'great_grandchild'::text as relation_type,
      'من الجيل الأدنى في شجرة النسب'::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from my_children mc
    join parent_edges e1 on e1.parent_id = mc.child_id
    join parent_edges e2 on e2.parent_id = e1.child_id
    join public.people ggc on ggc.id = e2.child_id and ggc.status = 'approved'
    where ggc.id <> p_person_id
  ),
  combined as (
    select * from direct_kin
    union all select * from inferred_siblings
    union all select * from grandparents
    union all select * from grandchildren
    union all select * from inferred_uncles_aunts
    union all select * from inferred_cousins
    union all select * from inferred_nephews_nieces
    union all select * from great_grandparents
    union all select * from great_grandchildren
  )
  select distinct on (c.related_person_id, c.relation_type)
    c.id as related_person_id,
    c.full_name,
    c.gender,
    c.relation_type,
    c.relation_detail,
    c.is_inferred,
    c.shared_parent_count
  from combined c
  where c.id <> p_person_id
  order by c.related_person_id, c.relation_type, c.is_inferred asc,
           c.shared_parent_count desc nulls last;
$$;

revoke all on function public.get_person_kinship(uuid) from public;
grant execute on function public.get_person_kinship(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
