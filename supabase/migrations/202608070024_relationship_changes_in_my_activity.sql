-- PHASE 19: RELATIONSHIP CHANGE REQUESTS IN MY ACTIVITY
-- Extends the paginated personal feed without adding client-side table scans.

begin;

create or replace function public.list_my_submission_activity(
  p_status text default null,
  p_limit integer default 11,
  p_offset integer default 0
)
returns table (
  id uuid,
  item_type text,
  entity_type text,
  record_id uuid,
  title text,
  subtitle text,
  status text,
  review_note text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 11), 40));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if v_status is not null and v_status not in ('pending', 'approved', 'rejected') then raise exception 'Invalid activity status'; end if;

  return query
  with activity as (
    select f.id, 'family'::text item_type, 'families'::text entity_type, f.id record_id,
      f.name::text title, coalesce(nullif(f.origin_place,''), 'إضافة عائلة')::text subtitle,
      f.status::text status, null::text review_note, f.created_at
    from public.families f where f.created_by=v_user_id and (v_status is null or f.status=v_status)

    union all
    select p.id, 'person'::text, 'people'::text, p.id,
      p.full_name::text, coalesce(nullif(f.name,''), 'إضافة شخص')::text,
      p.status::text, null::text, p.created_at
    from public.people p left join public.families f on f.id=p.family_id
    where p.created_by=v_user_id and (v_status is null or p.status=v_status)

    union all
    select e.id, 'event'::text, 'events'::text, e.id,
      e.title::text,
      case e.event_type when 'death' then 'وفاة وعزاء' when 'wedding' then 'زواج' when 'birth' then 'مولود' when 'naming' then 'سماية' when 'graduation' then 'تخرج ونجاح' else 'مناسبة' end::text,
      e.status::text, null::text, e.created_at
    from public.events e where e.created_by=v_user_id and (v_status is null or e.status=v_status)

    union all
    select r.id, 'relationship'::text, 'person_relationships'::text, r.source_person_id,
      (coalesce(s.full_name,'شخص') || ' — ' || coalesce(t.full_name,'شخص'))::text,
      case r.relation_type when 'parent' then 'صلة والد/والدة' when 'child' then 'صلة ابن/ابنة' when 'spouse' then 'صلة زوجية' when 'sibling' then 'صلة أخوة' else 'صلة قرابة' end::text,
      r.status::text, null::text, r.created_at
    from public.person_relationships r
    left join public.people s on s.id=r.source_person_id left join public.people t on t.id=r.target_person_id
    where r.created_by=v_user_id and (v_status is null or r.status=v_status)

    union all
    select m.id, 'membership'::text, 'person_family_memberships'::text, m.person_id,
      (coalesce(p.full_name,'شخص') || ' ← ' || coalesce(f.name,'عائلة'))::text,
      case m.membership_type when 'birth' then 'انتماء بالنسب' when 'marriage' then 'انتماء بالزواج' when 'paternal' then 'من جهة الأب' when 'maternal' then 'من جهة الأم' else 'انتماء عائلي' end::text,
      m.status::text, null::text, m.created_at
    from public.person_family_memberships m
    left join public.people p on p.id=m.person_id left join public.families f on f.id=m.family_id
    where m.created_by=v_user_id and (v_status is null or m.status=v_status)

    union all
    select e.id, 'edit'::text, e.entity_type::text, e.record_id,
      case e.entity_type when 'families' then 'تعديل عائلة' when 'people' then 'تعديل شخص' when 'events' then 'تعديل مناسبة' when 'person_relationships' then 'تعديل صلة قرابة' else 'تعديل سجل' end::text,
      coalesce(nullif(e.proposed_data->>'full_name',''), nullif(e.proposed_data->>'name',''), nullif(e.proposed_data->>'title',''), case when e.proposed_data?'family_id' then 'تغيير العائلة الأساسية' end, 'طلب تعديل')::text,
      e.status::text, e.review_note::text, e.created_at
    from public.content_edit_requests e
    where e.requested_by=v_user_id and (v_status is null or e.status=v_status)

    union all
    select l.id, 'account_link'::text, 'people'::text, l.person_id,
      coalesce(p.full_name,'ربط الحساب بسجل شخص')::text, 'طلب ربط الحساب بالشخص'::text,
      l.status::text, null::text, l.created_at
    from public.account_link_requests l left join public.people p on p.id=l.person_id
    where l.user_id=v_user_id and (v_status is null or l.status=v_status)

    union all
    select q.id, 'relationship_change'::text, 'person_relationships'::text,
      coalesce(q.source_person_id,q.target_person_id) record_id,
      (coalesce(q.source_name,'شخص') || ' — ' || coalesce(q.target_name,'شخص'))::text,
      case q.action when 'delete' then 'طلب حذف صلة قرابة' else 'طلب تعديل صلة قرابة' end::text,
      q.status::text, q.review_note::text, q.created_at
    from public.relationship_change_requests q
    where q.requested_by=v_user_id and (v_status is null or q.status=v_status)
  )
  select a.id,a.item_type,a.entity_type,a.record_id,a.title,a.subtitle,a.status,a.review_note,a.created_at
  from activity a
  order by a.created_at desc,a.id
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.list_my_submission_activity(text, integer, integer) from public, anon;
grant execute on function public.list_my_submission_activity(text, integer, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
