-- Fix moderation feeds after structured scope migration.
-- Explicitly name CTE columns instead of relying on non-existent column2/column3 aliases.

create or replace function public.list_pending_moderation_feed(p_limit integer default 16,p_offset integer default 0)
returns table(id uuid,table_name text,title text,subtitle text,created_at timestamptz)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_role text:=private.active_role(auth.uid());
  v_limit integer:=greatest(1,least(coalesce(p_limit,16),50));
  v_offset integer:=greatest(0,coalesce(p_offset,0));
begin
  if coalesce(v_role,'') not in ('family_moderator','content_moderator','admin','super_admin') then
    raise exception 'Not authorized to review pending content';
  end if;

  return query
  with pending(id,table_name,title,subtitle,created_at) as (
    select f.id,'families'::text,f.name::text,coalesce(nullif(f.origin_place,''),'سجل عائلي قديم')::text,f.created_at
    from public.families f
    where f.status='pending' and (
      v_role in ('admin','super_admin')
      or (v_role='family_moderator' and f.created_by<>auth.uid() and private.has_family_moderator_scope(auth.uid(),f.id))
    )
    union all
    select p.id,'people',p.full_name::text,'شخص جديد'::text,p.created_at
    from public.people p
    where p.status='pending' and (
      v_role in ('admin','super_admin')
      or (v_role='family_moderator' and p.created_by<>auth.uid() and private.person_in_family_moderator_scope(auth.uid(),p.id))
    )
    union all
    select e.id,'events',e.title::text,
      (case e.event_type when 'death' then 'وفاة وعزاء' when 'wedding' then 'زواج' when 'birth' then 'مولود' when 'naming' then 'سماية' when 'graduation' then 'تخرج ونجاح' when 'general' then 'مناسبة عامة' else coalesce(nullif(e.event_type,''),'مناسبة') end)::text,
      e.created_at
    from public.events e
    where e.status='pending' and (
      v_role in ('admin','super_admin')
      or (v_role='content_moderator' and e.created_by<>auth.uid())
      or (v_role='family_moderator' and e.created_by<>auth.uid() and private.event_in_moderator_scope(auth.uid(),e.id))
    )
    union all
    select r.id,'person_relationships',
      (coalesce(s.full_name,'شخص أول')||' — '||coalesce(t.full_name,'شخص ثانٍ'))::text,
      (case r.relation_type when 'parent' then 'والد أو والدة' when 'child' then 'ابن أو ابنة' when 'spouse' then 'زوج أو زوجة' when 'sibling' then 'أخ أو أخت' when 'guardian' then 'ولي أو وصي' else 'صلة أخرى' end)::text,
      r.created_at
    from public.person_relationships r
    left join public.people s on s.id=r.source_person_id
    left join public.people t on t.id=r.target_person_id
    where r.status='pending' and (
      v_role in ('admin','super_admin')
      or (v_role='family_moderator' and r.created_by<>auth.uid()
          and private.person_in_family_moderator_scope(auth.uid(),r.source_person_id)
          and private.person_in_family_moderator_scope(auth.uid(),r.target_person_id))
    )
    union all
    select l.id,'account_link_requests',coalesce(p.full_name,'طلب ربط حساب')::text,
      'طلب إثبات أن الحساب يعود لهذا الشخص'::text,l.created_at
    from public.account_link_requests l
    left join public.people p on p.id=l.person_id
    where l.status='pending' and v_role in ('admin','super_admin')
  )
  select q.id,q.table_name,q.title,q.subtitle,q.created_at
  from pending q
  order by q.created_at,q.id
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.list_pending_secondary_moderation_feed(p_limit integer default 13,p_offset integer default 0)
returns table(id uuid,request_type text,title text,subtitle text,created_at timestamptz)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_role text:=coalesce(private.active_role(auth.uid()),'');
  v_limit integer:=greatest(1,least(coalesce(p_limit,13),50));
  v_offset integer:=greatest(0,coalesce(p_offset,0));
begin
  if v_role not in ('family_moderator','content_moderator','admin','super_admin') then
    raise exception 'Not authorized to review pending changes';
  end if;

  return query
  with pending(id,request_type,title,subtitle,created_at) as (
    select e.id,'edit'::text,
      case e.entity_type when 'families' then 'تعديل سجل عائلي قديم' when 'people' then 'تعديل بيانات شخص' when 'events' then 'تعديل مناسبة' when 'person_relationships' then 'تعديل صلة قرابة' else 'تعديل سجل' end,
      coalesce(nullif(e.proposed_data->>'full_name',''),nullif(e.proposed_data->>'name',''),nullif(e.proposed_data->>'title',''),nullif(e.proposed_data->>'relation_type',''),'راجع البيانات المقترحة ثم اعتمد أو ارفض.')::text,
      e.created_at
    from public.content_edit_requests e
    where e.status='pending' and (
      v_role in ('admin','super_admin')
      or (v_role='content_moderator' and e.requested_by<>auth.uid() and e.entity_type='events')
      or (v_role='family_moderator' and e.requested_by<>auth.uid() and (
        (e.entity_type='families' and private.has_family_moderator_scope(auth.uid(),e.record_id))
        or (e.entity_type='people' and private.person_in_family_moderator_scope(auth.uid(),e.record_id))
        or (e.entity_type='events' and private.event_in_moderator_scope(auth.uid(),e.record_id))
        or (e.entity_type='person_relationships' and exists(
          select 1 from public.person_relationships r
          where r.id=e.record_id
            and private.person_in_family_moderator_scope(auth.uid(),r.source_person_id)
            and private.person_in_family_moderator_scope(auth.uid(),r.target_person_id)
        ))
      ))
    )
    union all
    select m.id,'membership',(coalesce(p.full_name,'شخص')||' ← سجل سابق')::text,
      (case m.membership_type when 'birth' then 'ارتباط أصل سابق' when 'marriage' then 'ارتباط زواج سابق' when 'paternal' then 'من جهة الأب' when 'maternal' then 'من جهة الأم' else 'ارتباط سابق' end)::text,
      m.created_at
    from public.person_family_memberships m
    left join public.people p on p.id=m.person_id
    where m.status='pending' and (
      v_role in ('admin','super_admin')
      or (v_role='family_moderator' and m.created_by<>auth.uid()
          and private.has_family_moderator_scope(auth.uid(),m.family_id)
          and exists(select 1 from public.people pp where pp.id=m.person_id and pp.status='approved'))
    )
  )
  select q.id,q.request_type,q.title,q.subtitle,q.created_at
  from pending q
  order by q.created_at,q.id
  limit v_limit offset v_offset;
end;
$$;
