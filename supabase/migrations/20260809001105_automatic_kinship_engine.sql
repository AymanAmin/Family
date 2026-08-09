create or replace function public.get_kinship_relationship(
  p_from_person_id uuid,
  p_to_person_id uuid,
  p_max_depth integer default 8
)
returns table(
  from_person_id uuid,
  from_name text,
  to_person_id uuid,
  to_name text,
  relationship_code text,
  relationship_label text,
  relationship_detail text,
  confidence text,
  data_status text,
  degree integer,
  is_blood_relation boolean,
  via_marriage boolean,
  common_ancestor_id uuid,
  common_ancestor_name text,
  from_common_depth integer,
  to_common_depth integer,
  missing_from_parent_slots integer,
  missing_to_parent_slots integer,
  from_known_ancestor_depth integer,
  to_known_ancestor_depth integer,
  path jsonb
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_max_depth, 8), 2), 10);
  v_from_name text;
  v_from_gender text;
  v_to_name text;
  v_to_gender text;
  v_lca_id uuid;
  v_lca_name text;
  v_from_depth integer;
  v_to_depth integer;
  v_from_path uuid[];
  v_to_path uuid[];
  v_full_path uuid[];
  v_path_json jsonb := '[]'::jsonb;
  v_label text;
  v_code text;
  v_detail text;
  v_confidence text;
  v_status text;
  v_degree integer;
  v_blood boolean := false;
  v_marriage boolean := false;
  v_missing_from integer := 0;
  v_missing_to integer := 0;
  v_from_known_depth integer := 0;
  v_to_known_depth integer := 0;
  v_i integer;
  v_node_gender text;
  v_source_parent_gender text;
  v_source_branch_gender text;
  v_target_branch_gender text;
  v_target_branch_id uuid;
  v_source_branch_id uuid;
  v_word text;
  v_phrase text;
  v_base text;
  v_direct_spouse boolean := false;
  v_fallback_signature text;
  v_fallback_path jsonb;
  v_fallback_degree integer;
  v_fallback_has_spouse boolean := false;
begin
  if p_from_person_id is null or p_to_person_id is null then return; end if;

  select p.full_name, p.gender into v_from_name, v_from_gender
  from public.people p
  where p.id = p_from_person_id and p.status = 'approved' and p.archived_at is null;

  select p.full_name, p.gender into v_to_name, v_to_gender
  from public.people p
  where p.id = p_to_person_id and p.status = 'approved' and p.archived_at is null;

  if v_from_name is null or v_to_name is null then return; end if;

  select
    (case when exists (
      select 1 from public.canonical_parent_edges e
      join public.people p on p.id = e.parent_id
      where e.child_id = p_from_person_id and p.gender = 'male' and p.archived_at is null
    ) then 0 else 1 end)
    + (case when exists (
      select 1 from public.canonical_parent_edges e
      join public.people p on p.id = e.parent_id
      where e.child_id = p_from_person_id and p.gender = 'female' and p.archived_at is null
    ) then 0 else 1 end)
  into v_missing_from;

  select
    (case when exists (
      select 1 from public.canonical_parent_edges e
      join public.people p on p.id = e.parent_id
      where e.child_id = p_to_person_id and p.gender = 'male' and p.archived_at is null
    ) then 0 else 1 end)
    + (case when exists (
      select 1 from public.canonical_parent_edges e
      join public.people p on p.id = e.parent_id
      where e.child_id = p_to_person_id and p.gender = 'female' and p.archived_at is null
    ) then 0 else 1 end)
  into v_missing_to;

  if p_from_person_id = p_to_person_id then
    return query select p_from_person_id, v_from_name, p_to_person_id, v_to_name,
      'self'::text, 'نفس الشخص'::text, 'تم اختيار الشخص نفسه.'::text,
      'high'::text, 'confirmed'::text, 0, true, false,
      p_from_person_id, v_from_name, 0, 0,
      v_missing_from, v_missing_to, 0, 0,
      jsonb_build_array(jsonb_build_object(
        'step_no', 0, 'person_id', p_from_person_id, 'full_name', v_from_name,
        'gender', v_from_gender, 'relation_type', 'self', 'is_inferred', false
      ));
    return;
  end if;

  select exists (
    select 1
    from public.person_relationships r
    join public.people a on a.id = r.source_person_id and a.status = 'approved' and a.archived_at is null
    join public.people b on b.id = r.target_person_id and b.status = 'approved' and b.archived_at is null
    where r.status = 'approved' and r.relation_type = 'spouse'
      and ((r.source_person_id = p_from_person_id and r.target_person_id = p_to_person_id)
        or (r.source_person_id = p_to_person_id and r.target_person_id = p_from_person_id))
  ) into v_direct_spouse;

  if v_direct_spouse then
    v_label := case when v_to_gender = 'female' then 'زوجة' when v_to_gender = 'male' then 'زوج' else 'زوج/زوجة' end;
    v_path_json := jsonb_build_array(
      jsonb_build_object('step_no', 0, 'person_id', p_from_person_id, 'full_name', v_from_name, 'gender', v_from_gender, 'relation_type', 'self', 'is_inferred', false),
      jsonb_build_object('step_no', 1, 'person_id', p_to_person_id, 'full_name', v_to_name, 'gender', v_to_gender, 'relation_type', 'spouse', 'is_inferred', false)
    );
    return query select p_from_person_id, v_from_name, p_to_person_id, v_to_name,
      'spouse'::text, v_label, 'صلة زواج معتمدة ومسجلة مباشرة.'::text,
      'high'::text, 'confirmed'::text, 1, false, true,
      null::uuid, null::text, null::integer, null::integer,
      v_missing_from, v_missing_to, 0, 0, v_path_json;
    return;
  end if;

  with recursive
  from_up(person_id, depth, path) as (
    select p_from_person_id, 0, array[p_from_person_id]::uuid[]
    union all
    select e.parent_id, fu.depth + 1, fu.path || e.parent_id
    from from_up fu
    join public.canonical_parent_edges e on e.child_id = fu.person_id
    join public.people pp on pp.id = e.parent_id and pp.status = 'approved' and pp.archived_at is null
    where fu.depth < v_limit and not (e.parent_id = any(fu.path))
  ),
  to_up(person_id, depth, path) as (
    select p_to_person_id, 0, array[p_to_person_id]::uuid[]
    union all
    select e.parent_id, tu.depth + 1, tu.path || e.parent_id
    from to_up tu
    join public.canonical_parent_edges e on e.child_id = tu.person_id
    join public.people pp on pp.id = e.parent_id and pp.status = 'approved' and pp.archived_at is null
    where tu.depth < v_limit and not (e.parent_id = any(tu.path))
  )
  select fu.person_id, p.full_name, fu.depth, tu.depth, fu.path, tu.path
    into v_lca_id, v_lca_name, v_from_depth, v_to_depth, v_from_path, v_to_path
  from from_up fu
  join to_up tu on tu.person_id = fu.person_id
  join public.people p on p.id = fu.person_id and p.archived_at is null
  order by (fu.depth + tu.depth), greatest(fu.depth, tu.depth), fu.depth, fu.person_id
  limit 1;

  with recursive up(person_id, depth, path) as (
    select p_from_person_id, 0, array[p_from_person_id]::uuid[]
    union all
    select e.parent_id, u.depth + 1, u.path || e.parent_id
    from up u
    join public.canonical_parent_edges e on e.child_id = u.person_id
    join public.people pp on pp.id = e.parent_id and pp.status = 'approved' and pp.archived_at is null
    where u.depth < v_limit and not (e.parent_id = any(u.path))
  ) select coalesce(max(depth), 0)::integer into v_from_known_depth from up;

  with recursive up(person_id, depth, path) as (
    select p_to_person_id, 0, array[p_to_person_id]::uuid[]
    union all
    select e.parent_id, u.depth + 1, u.path || e.parent_id
    from up u
    join public.canonical_parent_edges e on e.child_id = u.person_id
    join public.people pp on pp.id = e.parent_id and pp.status = 'approved' and pp.archived_at is null
    where u.depth < v_limit and not (e.parent_id = any(u.path))
  ) select coalesce(max(depth), 0)::integer into v_to_known_depth from up;

  if v_lca_id is not null then
    v_full_path := v_from_path;
    if cardinality(v_to_path) > 1 then
      for v_i in reverse (cardinality(v_to_path) - 1)..1 loop
        v_full_path := array_append(v_full_path, v_to_path[v_i]);
      end loop;
    end if;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'step_no', u.ord - 1,
        'person_id', p.id,
        'full_name', p.full_name,
        'gender', p.gender,
        'relation_type', case
          when u.ord = 1 then 'self'
          when u.ord <= cardinality(v_from_path) then 'parent'
          else 'child'
        end,
        'is_inferred', false
      ) order by u.ord
    ), '[]'::jsonb)
    into v_path_json
    from unnest(v_full_path) with ordinality as u(person_id, ord)
    join public.people p on p.id = u.person_id;

    v_degree := v_from_depth + v_to_depth;
    v_confidence := 'high';
    v_status := 'confirmed';
    v_blood := true;
    v_marriage := false;

    if v_from_depth = 0 then
      v_code := case when v_to_depth = 1 then 'child' when v_to_depth = 2 then 'grandchild' else 'descendant' end;
      v_label := case
        when v_to_depth = 1 and v_to_gender = 'female' then 'ابنة'
        when v_to_depth = 1 then 'ابن'
        when v_to_depth = 2 and v_to_gender = 'female' then 'حفيدة'
        when v_to_depth = 2 then 'حفيد'
        else 'من الذرية · الجيل ' || v_to_depth
      end;
      v_detail := 'صلة نسب مؤكدة من سلسلة الأبناء المسجلة.';
    elsif v_to_depth = 0 then
      v_code := case when v_from_depth = 1 then 'parent' when v_from_depth = 2 then 'grandparent' else 'ancestor' end;
      v_label := case
        when v_from_depth = 1 and v_to_gender = 'female' then 'أم'
        when v_from_depth = 1 then 'أب'
        when v_from_depth = 2 and v_to_gender = 'female' then 'جدة'
        when v_from_depth = 2 then 'جد'
        when v_to_gender = 'female' then 'جدة عليا · الجيل ' || v_from_depth
        else 'جد أعلى · الجيل ' || v_from_depth
      end;
      v_detail := 'صلة نسب مؤكدة من سلسلة الوالدين المسجلة.';
    elsif v_from_depth = 1 then
      v_target_branch_id := v_to_path[v_to_depth];
      select p.gender into v_target_branch_gender from public.people p where p.id = v_target_branch_id;
      v_phrase := '';
      if v_to_depth > 1 then
        for v_i in 1..(v_to_depth - 1) loop
          select p.gender into v_node_gender from public.people p where p.id = v_to_path[v_i];
          v_word := case when v_node_gender = 'female' then 'بنت' when v_node_gender = 'male' then 'ابن' else 'ابن/بنت' end;
          v_phrase := concat_ws(' ', nullif(v_phrase, ''), v_word);
        end loop;
      end if;
      v_base := case when v_target_branch_gender = 'female' then 'الأخت' when v_target_branch_gender = 'male' then 'الأخ' else 'الأخ/الأخت' end;
      v_label := concat_ws(' ', nullif(v_phrase, ''), v_base);
      v_code := case when v_to_depth = 1 then 'sibling' when v_to_depth = 2 then 'nephew_niece' else 'sibling_descendant' end;
      v_detail := 'يلتقي النسب عند ' || v_lca_name || '؛ الطرف الثاني من ذرية أخ/أخت الطرف الأول.';
    elsif v_from_depth = 2 then
      select p.gender into v_source_parent_gender from public.people p where p.id = v_from_path[2];
      v_target_branch_id := v_to_path[v_to_depth];
      select p.gender into v_target_branch_gender from public.people p where p.id = v_target_branch_id;
      v_base := case
        when v_source_parent_gender = 'male' and v_target_branch_gender = 'male' then 'العم'
        when v_source_parent_gender = 'male' and v_target_branch_gender = 'female' then 'العمة'
        when v_source_parent_gender = 'female' and v_target_branch_gender = 'male' then 'الخال'
        when v_source_parent_gender = 'female' and v_target_branch_gender = 'female' then 'الخالة'
        when v_target_branch_gender = 'female' then 'قريبة الوالد'
        else 'قريب الوالد'
      end;
      v_phrase := '';
      if v_to_depth > 1 then
        for v_i in 1..(v_to_depth - 1) loop
          select p.gender into v_node_gender from public.people p where p.id = v_to_path[v_i];
          v_word := case when v_node_gender = 'female' then 'بنت' when v_node_gender = 'male' then 'ابن' else 'ابن/بنت' end;
          v_phrase := concat_ws(' ', nullif(v_phrase, ''), v_word);
        end loop;
      end if;
      v_label := concat_ws(' ', nullif(v_phrase, ''), v_base);
      v_code := case when v_to_depth = 1 then 'uncle_aunt' when v_to_depth = 2 then 'cousin' else 'uncle_aunt_descendant' end;
      v_detail := 'يلتقي النسب عند ' || v_lca_name || '؛ تم تحديد جهة العم/الخال من مسار الأب أو الأم المسجل.';
    else
      v_source_branch_id := v_from_path[v_from_depth];
      v_target_branch_id := v_to_path[v_to_depth];
      select p.gender into v_source_branch_gender from public.people p where p.id = v_source_branch_id;
      select p.gender into v_target_branch_gender from public.people p where p.id = v_target_branch_id;
      v_phrase := '';
      if v_to_depth > 1 then
        for v_i in 1..(v_to_depth - 1) loop
          select p.gender into v_node_gender from public.people p where p.id = v_to_path[v_i];
          v_word := case when v_node_gender = 'female' then 'بنت' when v_node_gender = 'male' then 'ابن' else 'ابن/بنت' end;
          v_phrase := concat_ws(' ', nullif(v_phrase, ''), v_word);
        end loop;
      end if;
      v_word := case when v_target_branch_gender = 'female' then 'أخت' when v_target_branch_gender = 'male' then 'أخ' else 'أخ/أخت' end;
      v_base := case
        when (v_from_depth - 1) = 2 and v_source_branch_gender = 'female' then 'الجدة'
        when (v_from_depth - 1) = 2 then 'الجد'
        when v_source_branch_gender = 'female' then 'الجدة العليا من الجيل ' || (v_from_depth - 1)
        else 'الجد الأعلى من الجيل ' || (v_from_depth - 1)
      end;
      v_label := concat_ws(' ', nullif(v_phrase, ''), v_word, v_base);
      v_code := 'extended_blood';
      v_detail := 'قرابة نسب ممتدة تلتقي عند ' || v_lca_name || '؛ يبعد الجد المشترك ' || v_from_depth || ' أجيال عن الأول و' || v_to_depth || ' أجيال عن الثاني.';
    end if;

    return query select p_from_person_id, v_from_name, p_to_person_id, v_to_name,
      v_code, v_label, v_detail,
      v_confidence, v_status, v_degree, v_blood, v_marriage,
      v_lca_id, v_lca_name, v_from_depth, v_to_depth,
      v_missing_from, v_missing_to, v_from_known_depth, v_to_known_depth,
      v_path_json;
    return;
  end if;

  select
    coalesce(jsonb_agg(to_jsonb(k) order by k.step_no), '[]'::jsonb),
    string_agg(k.relation_type, '>' order by k.step_no) filter (where k.step_no > 0),
    max(k.step_no)::integer,
    coalesce(bool_or(k.relation_type = 'spouse') filter (where k.step_no > 0), false)
  into v_fallback_path, v_fallback_signature, v_fallback_degree, v_fallback_has_spouse
  from public.get_kinship_path(p_from_person_id, p_to_person_id, least(v_limit, 6)) k;

  if v_fallback_degree is not null and v_fallback_degree > 0 then
    v_path_json := v_fallback_path;
    v_degree := v_fallback_degree;
    v_marriage := v_fallback_has_spouse;
    v_blood := not v_fallback_has_spouse;
    v_confidence := case when v_fallback_has_spouse then 'high' else 'medium' end;
    v_status := case when v_fallback_has_spouse then 'confirmed' else 'partial' end;

    if v_fallback_signature = 'sibling' then
      v_code := 'sibling';
      v_label := case when v_to_gender = 'female' then 'أخت' when v_to_gender = 'male' then 'أخ' else 'أخ/أخت' end;
      v_detail := 'صلة أخوة معتمدة، لكن سلسلة الوالدين الحالية لا تكفي لإعادة بنائها بالكامل.';
    elsif v_fallback_signature = 'spouse' then
      v_code := 'spouse';
      v_label := case when v_to_gender = 'female' then 'زوجة' when v_to_gender = 'male' then 'زوج' else 'زوج/زوجة' end;
      v_detail := 'صلة زواج معتمدة ومسجلة مباشرة.';
    elsif v_fallback_signature = 'spouse>parent' then
      v_code := 'in_law_parent';
      v_label := case when v_to_gender = 'female' then 'والدة الزوج/الزوجة' else 'والد الزوج/الزوجة' end;
      v_detail := 'صلة مصاهرة مستنتجة من علاقة الزواج والوالدين.';
    elsif v_fallback_signature = 'spouse>sibling' then
      v_code := 'in_law_sibling';
      v_label := case when v_to_gender = 'female' then 'أخت الزوج/الزوجة' else 'أخ الزوج/الزوجة' end;
      v_detail := 'صلة مصاهرة مستنتجة من علاقة الزواج والأخوة.';
    elsif v_fallback_signature = 'sibling>spouse' then
      v_code := 'sibling_spouse';
      v_label := case when v_to_gender = 'female' then 'زوجة الأخ/الأخت' else 'زوج الأخ/الأخت' end;
      v_detail := 'صلة مصاهرة مستنتجة من الأخوة والزواج.';
    elsif v_fallback_signature = 'child>spouse' then
      v_code := 'child_spouse';
      v_label := case when v_to_gender = 'female' then 'زوجة الابن/الابنة' else 'زوج الابن/الابنة' end;
      v_detail := 'صلة مصاهرة مستنتجة من الأبناء والزواج.';
    elsif v_fallback_signature = 'parent>spouse' then
      v_code := 'parent_spouse';
      v_label := case when v_to_gender = 'female' then 'زوجة الأب/الأم' else 'زوج الأب/الأم' end;
      v_detail := 'صلة مصاهرة مستنتجة من الوالدين والزواج.';
    elsif v_fallback_has_spouse then
      v_code := 'affinity';
      v_label := 'صلة بالمصاهرة';
      v_detail := 'يوجد مسار معتمد بين الشخصين يمر بعلاقة زواج.';
    else
      v_code := 'registered_kinship';
      v_label := 'صلة قرابة مسجلة';
      v_detail := 'يوجد مسار قرابة معتمد، لكن بيانات الوالدين الحالية لا تكفي لإعطاء مسمى أدق.';
    end if;

    return query select p_from_person_id, v_from_name, p_to_person_id, v_to_name,
      v_code, v_label, v_detail,
      v_confidence, v_status, v_degree, v_blood, v_marriage,
      null::uuid, null::text, null::integer, null::integer,
      v_missing_from, v_missing_to, v_from_known_depth, v_to_known_depth,
      v_path_json;
    return;
  end if;

  v_code := 'insufficient_data';
  v_label := 'البيانات غير كافية للحسم';
  v_confidence := 'unknown';
  v_status := 'insufficient';
  v_degree := null;
  v_blood := false;
  v_marriage := false;
  v_detail := 'لم نجد مسارًا مثبتًا في البيانات الحالية، وهذا لا يعني عدم وجود قرابة.';
  if v_missing_from > 0 or v_missing_to > 0 then
    v_detail := v_detail || ' يوجد نقص في بيانات الوالدين لأحد الشخصين أو كليهما.';
  else
    v_detail := v_detail || ' قد تكون البيانات الناقصة في الأجيال الأعلى.';
  end if;

  return query select p_from_person_id, v_from_name, p_to_person_id, v_to_name,
    v_code, v_label, v_detail,
    v_confidence, v_status, null::integer, false, false,
    null::uuid, null::text, null::integer, null::integer,
    v_missing_from, v_missing_to, v_from_known_depth, v_to_known_depth,
    '[]'::jsonb;
end;
$$;

revoke all on function public.get_kinship_relationship(uuid, uuid, integer) from public;
grant execute on function public.get_kinship_relationship(uuid, uuid, integer) to anon, authenticated;
