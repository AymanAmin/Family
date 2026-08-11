do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.get_kinship_relationship(uuid,uuid,integer)'::regprocedure)
    into v_definition;

  if position('v_lca_gender text;' in v_definition) > 0 then
    return;
  end if;

  if position('v_lca_name text;' in v_definition) = 0
     or position('select fu.person_id, p.full_name, fu.depth, tu.depth, fu.path, tu.path' in v_definition) = 0
     or position('order by (fu.depth + tu.depth), greatest(fu.depth, tu.depth), fu.depth, fu.person_id' in v_definition) = 0
     or position('يبعد الجد المشترك' in v_definition) = 0 then
    raise exception 'Unexpected get_kinship_relationship definition; paternal tie-break migration was not applied.';
  end if;

  v_definition := replace(
    v_definition,
    E'  v_lca_name text;\n',
    E'  v_lca_name text;\n  v_lca_gender text;\n'
  );

  v_definition := replace(
    v_definition,
    E'  select fu.person_id, p.full_name, fu.depth, tu.depth, fu.path, tu.path\n    into v_lca_id, v_lca_name, v_from_depth, v_to_depth, v_from_path, v_to_path',
    E'  select fu.person_id, p.full_name, p.gender, fu.depth, tu.depth, fu.path, tu.path\n    into v_lca_id, v_lca_name, v_lca_gender, v_from_depth, v_to_depth, v_from_path, v_to_path'
  );

  v_definition := replace(
    v_definition,
    '  order by (fu.depth + tu.depth), greatest(fu.depth, tu.depth), fu.depth, fu.person_id',
    E'  order by\n    (fu.depth + tu.depth),\n    case when p.gender = ''male'' then 0 when p.gender = ''female'' then 1 else 2 end,\n    greatest(fu.depth, tu.depth),\n    fu.depth,\n    fu.person_id'
  );

  v_definition := replace(
    v_definition,
    '      v_detail := ''قرابة نسب ممتدة تلتقي عند '' || v_lca_name || ''؛ يبعد الجد المشترك '' || v_from_depth || '' أجيال عن الأول و'' || v_to_depth || '' أجيال عن الثاني.'';',
    '      v_detail := ''قرابة نسب ممتدة تلتقي عند '' || v_lca_name || ''؛ '' || case when v_lca_gender = ''female'' then ''تبعد الجدة المشتركة '' when v_lca_gender = ''male'' then ''يبعد الجد المشترك '' else ''يبعد السلف المشترك '' end || v_from_depth || '' أجيال عن الأول و'' || v_to_depth || '' أجيال عن الثاني.'';'
  );

  execute v_definition;
end
$migration$;
