-- PHASE 12: PAGINATED EDIT + MEMBERSHIP MODERATION
-- Keeps the secondary admin queue bounded as public usage grows.

begin;

create index if not exists content_edit_requests_pending_moderation_idx
  on public.content_edit_requests (created_at, id)
  where status = 'pending';

create index if not exists person_family_memberships_pending_created_idx
  on public.person_family_memberships (created_at, id)
  where status = 'pending';

create or replace function public.list_pending_secondary_moderation_feed(
  p_limit integer default 13,
  p_offset integer default 0
)
returns table (
  id uuid,
  request_type text,
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
  v_limit integer := greatest(1, least(coalesce(p_limit, 13), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  ) then
    raise exception 'Not authorized to review pending changes';
  end if;

  return query
  with pending as (
    select
      e.id,
      'edit'::text as request_type,
      case e.entity_type
        when 'families' then 'تعديل بيانات عائلة'
        when 'people' then 'تعديل بيانات شخص'
        when 'events' then 'تعديل مناسبة'
        else 'تعديل سجل'
      end::text as title,
      coalesce(
        nullif(e.proposed_data ->> 'full_name', ''),
        nullif(e.proposed_data ->> 'name', ''),
        nullif(e.proposed_data ->> 'title', ''),
        nullif(e.proposed_data ->> 'origin_place', ''),
        nullif(e.proposed_data ->> 'location_name', ''),
        'راجع البيانات المقترحة ثم اعتمد أو ارفض.'
      )::text as subtitle,
      e.created_at
    from public.content_edit_requests e
    where e.status = 'pending'

    union all

    select
      m.id,
      'membership'::text,
      (coalesce(p.full_name, 'شخص') || ' ← ' || coalesce(f.name, 'عائلة'))::text,
      (
        case m.membership_type
          when 'birth' then 'بالنسب / عائلة الأصل'
          when 'marriage' then 'بالزواج'
          when 'paternal' then 'من جهة الأب'
          when 'maternal' then 'من جهة الأم'
          when 'guardian' then 'وصاية أو كفالة'
          else 'انتماء آخر'
        end
        || case when m.is_primary then ' · عائلة أساسية' else '' end
        || case when nullif(m.notes, '') is not null then ' · ' || m.notes else '' end
      )::text,
      m.created_at
    from public.person_family_memberships m
    left join public.people p on p.id = m.person_id
    left join public.families f on f.id = m.family_id
    where m.status = 'pending'
  )
  select q.id, q.request_type, q.title, q.subtitle, q.created_at
  from pending q
  order by q.created_at asc, q.id
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.list_pending_secondary_moderation_feed(integer, integer) from public, anon;
grant execute on function public.list_pending_secondary_moderation_feed(integer, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
