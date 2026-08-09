create or replace function public.list_households_v1(
  p_query text default null,
  p_limit integer default 8,
  p_offset integer default 0
)
returns table(
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
set search_path = ''
as $$
  with search_term as (
    select public.normalize_arabic_name(p_query) as q
  ), household_base as (
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
      coalesce((select count(distinct cpe.child_id)::bigint from public.canonical_parent_edges cpe where cpe.parent_id = hb.husband_person_id), 0::bigint) as child_count,
      lc.lineage_name,
      lc.branch_name
    from household_base hb
    left join lateral (
      select ctx.lineage_name, ctx.branch_name
      from public.get_person_lineage_context(hb.husband_person_id) ctx
      limit 1
    ) lc on true
  ), filtered as (
    select e.*
    from enriched e cross join search_term st
    where st.q = ''
       or public.normalize_arabic_name(e.husband_name) ilike '%' || st.q || '%'
       or exists (
         select 1 from unnest(e.spouse_names) s(name)
         where public.normalize_arabic_name(s.name) ilike '%' || st.q || '%'
       )
       or public.normalize_arabic_name(coalesce(e.lineage_name, '')) ilike '%' || st.q || '%'
       or public.normalize_arabic_name(coalesce(e.branch_name, '')) ilike '%' || st.q || '%'
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
  order by case when public.normalize_arabic_name(p_query) = '' then null else f.husband_name end asc nulls last,
           f.child_count desc,
           f.husband_name asc
  limit greatest(1, least(coalesce(p_limit, 8), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.search_scope_options_v1(
  p_query text default null,
  p_scope_type text default null,
  p_limit integer default 20
)
returns table(scope_type text, scope_id uuid, scope_name text, subtitle text)
language sql
stable
set search_path = ''
as $$
  with q as (
    select public.normalize_arabic_name(p_query) as t
  ), options(scope_type,scope_id,scope_name,subtitle) as (
    select 'household'::text,h.household_id,h.display_name,concat(h.spouse_count,' زوجات · ',h.child_count,' أبناء')
    from public.list_households_v1(p_query,greatest(5,least(coalesce(p_limit,20),50)),0) h
    where p_scope_type is null or p_scope_type='household'
    union all
    select 'lineage',l.id,regexp_replace(l.display_name,'^عائلة\s+','نسب '),coalesce(r.full_name,'أصل معتمد')
    from public.lineages l join public.people r on r.id=l.root_person_id cross join q
    where l.status='approved' and (p_scope_type is null or p_scope_type='lineage')
      and (q.t='' or public.normalize_arabic_name(l.display_name) ilike '%'||q.t||'%' or public.normalize_arabic_name(r.full_name) ilike '%'||q.t||'%')
    union all
    select 'branch',b.id,b.display_name,regexp_replace(l.display_name,'^عائلة\s+','نسب ')
    from public.lineage_branches b join public.lineages l on l.id=b.lineage_id join public.people p on p.id=b.branch_person_id cross join q
    where b.status='approved' and b.is_current and (p_scope_type is null or p_scope_type='branch')
      and (q.t='' or public.normalize_arabic_name(b.display_name) ilike '%'||q.t||'%' or public.normalize_arabic_name(p.full_name) ilike '%'||q.t||'%')
  )
  select * from options limit greatest(1,least(coalesce(p_limit,20),50));
$$;

create or replace function public.list_registered_users_for_role_management(
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(user_id uuid, email text, display_name text, role text, is_primary_admin boolean, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_search_ar text := public.normalize_arabic_name(p_search);
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.account_status = 'active' and p.role = 'super_admin' and p.is_primary_admin = true
  ) then
    raise exception 'Not authorized to manage administrators';
  end if;

  return query
  select p.id,p.email,p.display_name,p.role,p.is_primary_admin,p.created_at,u.last_sign_in_at
  from public.profiles p join auth.users u on u.id=p.id
  where p.account_status='active' and u.email_confirmed_at is not null
    and (
      v_search is null
      or public.normalize_arabic_name(coalesce(p.display_name,'')) ilike '%'||v_search_ar||'%'
      or coalesce(p.email,'') ilike '%'||v_search||'%'
    )
  order by p.is_primary_admin desc,p.created_at desc
  limit v_limit offset v_offset;
end;
$$;

revoke execute on function public.list_registered_users_for_role_management(text,integer,integer) from anon;
grant execute on function public.list_registered_users_for_role_management(text,integer,integer) to authenticated;
