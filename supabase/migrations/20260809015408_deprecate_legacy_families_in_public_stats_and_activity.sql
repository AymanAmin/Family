comment on table public.families is 'DEPRECATED compatibility table. Public product experience uses family_units (households), lineages and lineage_branches instead.';
comment on column public.people.family_id is 'DEPRECATED compatibility field. Derive current household/lineage/branch context from canonical relationships.';
comment on column public.events.family_id is 'DEPRECATED compatibility field. Use structured event scopes inferred from participants.';
comment on table public.person_family_memberships is 'DEPRECATED compatibility memberships. Current person context is derived from lineage, branch, marriage and canonical parent relationships.';
comment on table public.family_moderator_assignments is 'DEPRECATED compatibility moderator assignments. Use moderator_scope_assignments for household/lineage/branch scope.';

create or replace function public.get_public_platform_stats()
returns table(approved_families bigint, approved_people bigint, approved_events bigint, updated_at timestamptz)
language sql stable set search_path = '' as $$
  select hs.household_count as approved_families, s.approved_people, s.approved_events, s.updated_at
  from public.platform_stats s cross join public.get_household_stats_v1() hs where s.id = 1;
$$;

create or replace function public.get_public_platform_stats_v2()
returns table(household_count bigint, approved_people bigint, approved_events bigint, approved_lineages bigint, approved_branches bigint, updated_at timestamptz)
language sql stable set search_path = '' as $$
  select hs.household_count, s.approved_people, s.approved_events,
    (select count(*)::bigint from public.lineages l where l.status = 'approved'),
    (select count(*)::bigint from public.lineage_branches b where b.status = 'approved'),
    s.updated_at
  from public.platform_stats s cross join public.get_household_stats_v1() hs where s.id = 1;
$$;
grant execute on function public.get_public_platform_stats_v2() to anon, authenticated;

create or replace function public.list_my_submission_activity(p_status text default null,p_limit integer default 11,p_offset integer default 0)
returns table(id uuid,item_type text,entity_type text,record_id uuid,title text,subtitle text,status text,review_note text,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
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
    select p.id,'person'::text,'people'::text,p.id,
      case when p.status='approved' then p.full_name else 'إضافة شخص بانتظار اعتماد الإدارة' end::text,
      case when p.status='approved' then 'إضافة شخص' else 'لن تظهر بيانات الشخص في المنصة قبل اعتماد أحد المدراء.' end::text,
      p.status::text,null::text,p.created_at
    from public.people p where p.created_by=v_user_id and (v_status is null or p.status=v_status)
    union all
    select e.id,'event'::text,'events'::text,e.id,e.title::text,
      case e.event_type when 'death' then 'وفاة وعزاء' when 'wedding' then 'زواج' when 'birth' then 'مولود' when 'naming' then 'سماية' when 'graduation' then 'تخرج ونجاح' else 'مناسبة' end::text,
      e.status::text,null::text,e.created_at
    from public.events e where e.created_by=v_user_id and (v_status is null or e.status=v_status)
    union all
    select r.id,'relationship'::text,'person_relationships'::text,r.source_person_id,
      case when r.status='approved' and coalesce(s.status,'')='approved' and coalesce(t.status,'')='approved' then coalesce(s.full_name,'شخص')||' — '||coalesce(t.full_name,'شخص') else 'صلة قرابة بانتظار اعتماد الإدارة' end::text,
      case r.relation_type when 'parent' then 'صلة والد/والدة' when 'child' then 'صلة ابن/ابنة' when 'spouse' then 'صلة زوجية' when 'sibling' then 'صلة أخوة' else 'صلة قرابة' end::text,
      r.status::text,null::text,r.created_at
    from public.person_relationships r left join public.people s on s.id=r.source_person_id left join public.people t on t.id=r.target_person_id
    where r.created_by=v_user_id and (v_status is null or r.status=v_status)
    union all
    select e.id,'edit'::text,e.entity_type::text,e.record_id,
      case e.entity_type when 'families' then 'تعديل سجل توافق سابق' when 'people' then 'تعديل شخص' when 'events' then 'تعديل مناسبة' when 'person_relationships' then 'تعديل صلة قرابة' else 'تعديل سجل' end::text,
      coalesce(nullif(e.proposed_data->>'full_name',''),nullif(e.proposed_data->>'title',''),nullif(e.proposed_data->>'relation_type',''),case when e.proposed_data?'family_id' then 'تعديل ارتباط سابق' end,'طلب تعديل')::text,
      e.status::text,e.review_note::text,e.created_at
    from public.content_edit_requests e where e.requested_by=v_user_id and (v_status is null or e.status=v_status)
    union all
    select l.id,'account_link'::text,'people'::text,l.person_id,coalesce(p.full_name,'ربط الحساب بسجل شخص')::text,'طلب ربط الحساب بالشخص'::text,l.status::text,null::text,l.created_at
    from public.account_link_requests l left join public.people p on p.id=l.person_id where l.user_id=v_user_id and (v_status is null or l.status=v_status)
    union all
    select q.id,'relationship_change'::text,'person_relationships'::text,coalesce(q.source_person_id,q.target_person_id),
      (coalesce(q.source_name,'شخص')||' — '||coalesce(q.target_name,'شخص'))::text,
      case q.action when 'delete' then 'طلب حذف صلة قرابة' else 'طلب تعديل صلة قرابة' end::text,q.status::text,q.review_note::text,q.created_at
    from public.relationship_change_requests q where q.requested_by=v_user_id and (v_status is null or q.status=v_status)
  )
  select a.id,a.item_type,a.entity_type,a.record_id,a.title,a.subtitle,a.status,a.review_note,a.created_at
  from activity a order by a.created_at desc,a.id limit v_limit offset v_offset;
end;
$$;
revoke execute on function public.list_my_submission_activity(text,integer,integer) from anon;
grant execute on function public.list_my_submission_activity(text,integer,integer) to authenticated;
