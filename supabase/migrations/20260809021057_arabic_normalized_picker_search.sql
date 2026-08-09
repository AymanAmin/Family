create or replace function public.normalize_arabic_name(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(trim(
    regexp_replace(
      translate(
        regexp_replace(
          replace(coalesce(p_value, ''), 'ـ', ''),
          '[\u064B-\u065F\u0670\u06D6-\u06ED]',
          '',
          'g'
        ),
        'أإآٱىئؤةۀ',
        'ااااييوهه'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  ));
$$;

create or replace function public.search_people_names_v2(
  p_query text,
  p_limit integer default 7,
  p_exclude_id uuid default null,
  p_gender text default null,
  p_prefix boolean default false
)
returns table(id uuid, full_name text, gender text, birth_year integer, is_verified boolean)
language plpgsql
stable
set search_path = 'public', 'extensions'
as $$
declare
  v_query text := public.normalize_arabic_name(p_query);
  v_limit integer := greatest(1, least(coalesce(p_limit, 7), 20));
begin
  if char_length(v_query) < 2 then return; end if;
  if p_gender is not null and p_gender not in ('male','female') then raise exception 'Invalid gender'; end if;

  return query
  select p.id,p.full_name,p.gender,p.birth_year,p.is_verified
  from public.people p
  where p.status='approved'
    and p.archived_at is null
    and (p_exclude_id is null or p.id<>p_exclude_id)
    and (p_gender is null or p.gender=p_gender)
    and (
      (coalesce(p_prefix,false) and public.normalize_arabic_name(p.full_name) ilike v_query||'%')
      or
      (not coalesce(p_prefix,false) and (
        public.normalize_arabic_name(p.full_name) ilike '%'||v_query||'%'
        or public.normalize_arabic_name(p.full_name) % v_query
      ))
    )
  order by
    (public.normalize_arabic_name(p.full_name)=v_query) desc,
    (public.normalize_arabic_name(p.full_name) ilike v_query||'%') desc,
    similarity(public.normalize_arabic_name(p.full_name),v_query) desc,
    p.full_name
  limit v_limit;
end;
$$;

revoke execute on function public.search_people_names_v2(text,integer,uuid,text,boolean) from public;
grant execute on function public.search_people_names_v2(text,integer,uuid,text,boolean) to anon, authenticated;

create or replace function public.search_legacy_families_v1(
  p_query text default null,
  p_approved_only boolean default false,
  p_limit integer default 7
)
returns table(id uuid, name text, origin_place text, status text)
language sql
stable
set search_path = ''
as $$
  with q as (select public.normalize_arabic_name(p_query) as term)
  select f.id,f.name,f.origin_place,f.status
  from public.families f cross join q
  where (case when coalesce(p_approved_only,false) then f.status='approved' else f.status in ('approved','pending') end)
    and (q.term='' or public.normalize_arabic_name(f.name) ilike '%'||q.term||'%')
  order by
    case when q.term='' then f.created_at end desc,
    case when q.term<>'' then (public.normalize_arabic_name(f.name)=q.term)::int end desc,
    f.name asc
  limit greatest(1,least(coalesce(p_limit,7),20));
$$;

revoke execute on function public.search_legacy_families_v1(text,boolean,integer) from public;
grant execute on function public.search_legacy_families_v1(text,boolean,integer) to authenticated;
