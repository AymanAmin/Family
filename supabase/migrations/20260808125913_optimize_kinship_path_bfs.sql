-- Optimize kinship path discovery.
-- The previous recursive SQL enumerated many simple paths up to depth 6 before
-- selecting the target, which could grow exponentially and hit statement_timeout.
-- This implementation performs a level-by-level BFS, visits each person once,
-- and stops as soon as the shortest target path is discovered.

begin;

create or replace function public.get_kinship_path(
  p_from_person_id uuid,
  p_to_person_id uuid,
  p_max_depth integer default 6
)
returns table (
  step_no integer,
  person_id uuid,
  full_name text,
  gender text,
  relation_type text,
  is_inferred boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_max_depth, 6), 1), 6);
  v_depth integer := 0;
  v_frontier uuid[] := array[p_from_person_id]::uuid[];
  v_next uuid[] := array[]::uuid[];
  v_visited uuid[] := array[p_from_person_id]::uuid[];
  v_predecessor jsonb := '{}'::jsonb;
  v_relation jsonb := '{}'::jsonb;
  v_inferred jsonb := '{}'::jsonb;
  v_edge record;
  v_found boolean := false;
  v_cursor uuid;
  v_parent_id uuid;
  v_path uuid[];
  v_i integer;
begin
  if p_from_person_id is null or p_to_person_id is null then
    return;
  end if;

  if not exists (
    select 1 from public.people p
    where p.id = p_from_person_id and p.status = 'approved'
  ) or not exists (
    select 1 from public.people p
    where p.id = p_to_person_id and p.status = 'approved'
  ) then
    return;
  end if;

  if p_from_person_id = p_to_person_id then
    return query
    select 0::integer, p.id, p.full_name, p.gender, 'self'::text, false
    from public.people p
    where p.id = p_from_person_id and p.status = 'approved';
    return;
  end if;

  while v_depth < v_limit and cardinality(v_frontier) > 0 loop
    v_next := array[]::uuid[];

    for v_edge in
      with direct_edges as (
        select
          r.source_person_id as from_id,
          r.target_person_id as to_id,
          case r.relation_type
            when 'parent' then 'child'
            when 'child' then 'parent'
            else r.relation_type
          end::text as relation_type,
          false as is_inferred
        from public.person_relationships r
        where r.status = 'approved'
          and r.source_person_id = any(v_frontier)
          and r.relation_type in ('parent', 'child', 'spouse', 'sibling')

        union all

        select
          r.target_person_id as from_id,
          r.source_person_id as to_id,
          case r.relation_type
            when 'parent' then 'parent'
            when 'child' then 'child'
            else r.relation_type
          end::text as relation_type,
          false as is_inferred
        from public.person_relationships r
        where r.status = 'approved'
          and r.target_person_id = any(v_frontier)
          and r.relation_type in ('parent', 'child', 'spouse', 'sibling')
      ),
      frontier_parents as (
        select r.target_person_id as child_id, r.source_person_id as parent_id
        from public.person_relationships r
        where r.status = 'approved'
          and r.relation_type = 'parent'
          and r.target_person_id = any(v_frontier)

        union

        select r.source_person_id as child_id, r.target_person_id as parent_id
        from public.person_relationships r
        where r.status = 'approved'
          and r.relation_type = 'child'
          and r.source_person_id = any(v_frontier)
      ),
      inferred_sibling_edges as (
        select fp.child_id as from_id, r.target_person_id as to_id, 'sibling'::text as relation_type, true as is_inferred
        from frontier_parents fp
        join public.person_relationships r
          on r.source_person_id = fp.parent_id
         and r.status = 'approved'
         and r.relation_type = 'parent'
        where r.target_person_id <> fp.child_id

        union all

        select fp.child_id as from_id, r.source_person_id as to_id, 'sibling'::text as relation_type, true as is_inferred
        from frontier_parents fp
        join public.person_relationships r
          on r.target_person_id = fp.parent_id
         and r.status = 'approved'
         and r.relation_type = 'child'
        where r.source_person_id <> fp.child_id
      ),
      candidates as (
        select * from direct_edges
        union all
        select * from inferred_sibling_edges
      )
      select distinct on (c.to_id)
        c.from_id,
        c.to_id,
        c.relation_type,
        c.is_inferred
      from candidates c
      join public.people target_person
        on target_person.id = c.to_id
       and target_person.status = 'approved'
      where not (c.to_id = any(v_visited))
      order by
        c.to_id,
        c.is_inferred,
        case c.relation_type
          when 'parent' then 1
          when 'child' then 2
          when 'spouse' then 3
          when 'sibling' then 4
          else 9
        end,
        c.from_id
    loop
      if v_edge.to_id = any(v_visited) then
        continue;
      end if;

      v_visited := array_append(v_visited, v_edge.to_id);
      v_next := array_append(v_next, v_edge.to_id);
      v_predecessor := v_predecessor || jsonb_build_object(v_edge.to_id::text, v_edge.from_id::text);
      v_relation := v_relation || jsonb_build_object(v_edge.to_id::text, v_edge.relation_type);
      v_inferred := v_inferred || jsonb_build_object(v_edge.to_id::text, v_edge.is_inferred);

      if v_edge.to_id = p_to_person_id then
        v_found := true;
        exit;
      end if;
    end loop;

    exit when v_found;
    v_frontier := v_next;
    v_depth := v_depth + 1;
  end loop;

  if not v_found then
    return;
  end if;

  v_path := array[p_to_person_id]::uuid[];
  v_cursor := p_to_person_id;

  while v_cursor <> p_from_person_id loop
    v_parent_id := nullif(v_predecessor ->> v_cursor::text, '')::uuid;
    if v_parent_id is null then
      return;
    end if;
    v_path := array_prepend(v_parent_id, v_path);
    v_cursor := v_parent_id;
  end loop;

  for v_i in 1..cardinality(v_path) loop
    return query
    select
      (v_i - 1)::integer,
      p.id,
      p.full_name,
      p.gender,
      case when v_i = 1 then 'self'::text else coalesce(v_relation ->> p.id::text, 'other') end,
      case when v_i = 1 then false else coalesce((v_inferred ->> p.id::text)::boolean, false) end
    from public.people p
    where p.id = v_path[v_i]
      and p.status = 'approved';
  end loop;
end;
$$;

revoke all on function public.get_kinship_path(uuid, uuid, integer) from public;
grant execute on function public.get_kinship_path(uuid, uuid, integer) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
