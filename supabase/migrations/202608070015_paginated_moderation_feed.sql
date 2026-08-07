-- PHASE 11: PAGINATED MODERATION FEED
-- One protected server-side feed replaces loading every pending row from five tables.

begin;

create index if not exists families_pending_moderation_idx
  on public.families (created_at, id)
  where status = 'pending';

create index if not exists people_pending_moderation_idx
  on public.people (created_at, id)
  where status = 'pending';

create index if not exists events_pending_moderation_idx
  on public.events (created_at, id)
  where status = 'pending';

create index if not exists person_relationships_pending_moderation_idx
  on public.person_relationships (created_at, id)
  where status = 'pending';

create index if not exists account_link_requests_pending_moderation_idx
  on public.account_link_requests (created_at, id)
  where status = 'pending';

create or replace function public.list_pending_moderation_feed(
  p_limit integer default 16,
  p_offset integer default 0
)
returns table (
  id uuid,
  table_name text,
  title text,
  subtitle text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 16), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  ) then
    raise exception 'Not authorized to review pending content';
  end if;

  return query
  with pending as (
    select
      f.id,
      'families'::text as table_name,
      f.name::text as title,
      coalesce(nullif(f.origin_place, ''), 'عائلة جديدة')::text as subtitle,
      f.created_at
    from public.families f
    where f.status = 'pending'

    union all

    select
      p.id,
      'people'::text,
      p.full_name::text,
      coalesce(nullif(f.name, ''), 'شخص جديد')::text,
      p.created_at
    from public.people p
    left join public.families f on f.id = p.family_id
    where p.status = 'pending'

    union all

    select
      e.id,
      'events'::text,
      e.title::text,
      case e.event_type
        when 'death' then 'وفاة وعزاء'
        when 'wedding' then 'زواج'
        when 'birth' then 'مولود'
        when 'naming' then 'سماية'
        when 'graduation' then 'تخرج ونجاح'
        when 'general' then 'مناسبة عامة'
        else coalesce(nullif(e.event_type, ''), 'مناسبة')
      end::text,
      e.created_at
    from public.events e
    where e.status = 'pending'

    union all

    select
      r.id,
      'person_relationships'::text,
      (coalesce(s.full_name, 'شخص أول') || ' — ' || coalesce(t.full_name, 'شخص ثانٍ'))::text,
      case r.relation_type
        when 'parent' then 'والد أو والدة'
        when 'child' then 'ابن أو ابنة'
        when 'spouse' then 'زوج أو زوجة'
        when 'sibling' then 'أخ أو أخت'
        when 'guardian' then 'ولي أو وصي'
        else 'صلة أخرى'
      end::text,
      r.created_at
    from public.person_relationships r
    left join public.people s on s.id = r.source_person_id
    left join public.people t on t.id = r.target_person_id
    where r.status = 'pending'

    union all

    select
      l.id,
      'account_link_requests'::text,
      coalesce(p.full_name, 'طلب ربط حساب')::text,
      'طلب إثبات أن الحساب يعود لهذا الشخص'::text,
      l.created_at
    from public.account_link_requests l
    left join public.people p on p.id = l.person_id
    where l.status = 'pending'
  )
  select
    q.id,
    q.table_name,
    q.title,
    q.subtitle,
    q.created_at
  from pending q
  order by q.created_at asc, q.id
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.list_pending_moderation_feed(integer, integer) from public, anon;
grant execute on function public.list_pending_moderation_feed(integer, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
