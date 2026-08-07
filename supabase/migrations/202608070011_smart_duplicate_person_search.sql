-- PHASE 7: SMART DUPLICATE-PERSON SEARCH
-- Arabic-name normalization + trigram similarity for duplicate prevention while adding people.

begin;

create extension if not exists pg_trgm with schema extensions;

create or replace function public.normalize_arabic_name(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(
    regexp_replace(
      translate(
        regexp_replace(coalesce(p_value, ''), '[\u064B-\u065F\u0670\u06D6-\u06ED]', '', 'g'),
        'أإآٱىئؤ',
        'ااااييو'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

create index if not exists people_approved_normalized_name_trgm_idx
  on public.people using gin ((public.normalize_arabic_name(full_name)) extensions.gin_trgm_ops)
  where status = 'approved';

create or replace function public.find_similar_people(
  p_query text,
  p_limit integer default 6
)
returns table (
  id uuid,
  full_name text,
  gender text,
  birth_year integer,
  family_id uuid,
  family_name text,
  status text,
  match_score real
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_query text := public.normalize_arabic_name(p_query);
  v_limit integer := greatest(1, least(coalesce(p_limit, 6), 10));
begin
  if char_length(v_query) < 3 then
    return;
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.gender,
    p.birth_year,
    p.family_id,
    f.name as family_name,
    p.status,
    greatest(
      similarity(public.normalize_arabic_name(p.full_name), v_query),
      case
        when public.normalize_arabic_name(p.full_name) = v_query then 1.0
        when public.normalize_arabic_name(p.full_name) ilike '%' || v_query || '%' then 0.92
        else 0.0
      end
    )::real as match_score
  from public.people p
  left join public.families f on f.id = p.family_id
  where
    p.status in ('approved', 'pending')
    and (
      public.normalize_arabic_name(p.full_name) ilike '%' || v_query || '%'
      or public.normalize_arabic_name(p.full_name) % v_query
    )
  order by
    (public.normalize_arabic_name(p.full_name) = v_query) desc,
    match_score desc,
    p.full_name asc
  limit v_limit;
end;
$$;

revoke all on function public.find_similar_people(text, integer) from public;
grant execute on function public.find_similar_people(text, integer) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
