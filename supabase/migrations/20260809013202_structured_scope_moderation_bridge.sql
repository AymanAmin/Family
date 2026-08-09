-- Make moderation use household / lineage / branch scopes directly.

create or replace function private.event_in_moderator_scope(p_user_id uuid,p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.events e
    join public.moderator_scope_assignments a on a.user_id=p_user_id
    where e.id=p_event_id
      and (
        (e.scope_type=a.scope_type and e.scope_id=a.scope_id)
        or (e.scope_type='household' and a.scope_type in ('lineage','branch') and private.person_in_scope(e.scope_id,a.scope_type,a.scope_id))
        or (e.scope_type='branch' and a.scope_type='lineage' and exists(
          select 1 from public.lineage_branches b
          where b.id=e.scope_id and b.lineage_id=a.scope_id and b.status='approved' and b.is_current
        ))
      )
  )
  or exists(
    select 1 from public.events e
    where e.id=p_event_id and private.has_family_moderator_scope(p_user_id,e.family_id)
  );
$$;

create or replace function public.get_pending_moderation_counts()
returns table(primary_count bigint,edit_count bigint,membership_count bigint,relationship_change_count bigint,secondary_count bigint,total_count bigint)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_role text:=private.active_role(auth.uid());
  v_primary bigint:=0;
  v_edits bigint:=0;
  v_memberships bigint:=0;
  v_relationship_changes bigint:=0;
begin
  if auth.uid() is null or coalesce(v_role,'') not in ('family_moderator','content_moderator','admin','super_admin') then
    raise exception 'Not authorized to inspect moderation counts';
  end if;

  select count(*) into v_primary from (
    select f.id from public.families f
    where f.status='pending' and (
      v_role in ('admin','super_admin')
      or (v_role='family_moderator' and f.created_by<>auth.uid() and private.has_family_moderator_scope(auth.uid(),f.id))
    )
    union all
    select p.id from public.people p
    where p.status='pending' and (
      v_role in ('admin','super_admin')
      or (v_role='family_moderator' and p.created_by<>auth.uid() and private.person_in_family_moderator_scope(auth.uid(),p.id))
    )
    union all
    select e.id from public.events e
    where e.status='pending' and (
      v_role in ('admin','super_admin')
      or (v_role='content_moderator' and e.created_by<>auth.uid())
      or (v_role='family_moderator' and e.created_by<>auth.uid() and private.event_in_moderator_scope(auth.uid(),e.id))
    )
    union all
    select r.id from public.person_relationships r
    where r.status='pending' and (
      v_role in ('admin','super_admin')
      or (v_role='family_moderator' and r.created_by<>auth.uid()
          and private.person_in_family_moderator_scope(auth.uid(),r.source_person_id)
          and private.person_in_family_moderator_scope(auth.uid(),r.target_person_id))
    )
    union all
    select l.id from public.account_link_requests l
    where l.status='pending' and v_role in ('admin','super_admin')
  ) q;

  select count(*) into v_edits
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
  );

  select count(*) into v_memberships
  from public.person_family_memberships m
  where m.status='pending' and (
    v_role in ('admin','super_admin')
    or (v_role='family_moderator' and m.created_by<>auth.uid() and private.has_family_moderator_scope(auth.uid(),m.family_id))
  );

  if v_role in ('admin','super_admin') then
    select count(*) into v_relationship_changes
    from public.relationship_change_requests q where q.status='pending';
  end if;

  return query
  select v_primary,v_edits,v_memberships,v_relationship_changes,
         (v_edits+v_memberships+v_relationship_changes),
         (v_primary+v_edits+v_memberships+v_relationship_changes);
end;
$$;

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
  with pending as (
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
  select q.id,q.column2,q.column3,q.column4,q.created_at
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
  with pending as (
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
  select q.id,q.column2,q.column3,q.column4,q.created_at
  from pending q
  order by q.created_at,q.id
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.review_pending_moderation_record(p_table_name text,p_record_id uuid,p_status text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text:=private.active_role(auth.uid());
  v_created_by uuid;
  v_family_id uuid;
  v_source_id uuid;
  v_target_id uuid;
begin
  if p_status not in ('approved','rejected') then raise exception 'Invalid review status'; end if;
  if coalesce(v_role,'') not in ('family_moderator','content_moderator','admin','super_admin') then raise exception 'Not authorized'; end if;

  if p_table_name='account_link_requests' then
    if v_role not in ('admin','super_admin') then raise exception 'Not authorized for account verification'; end if;
    perform public.review_account_link_request(p_record_id,p_status);
    return;
  elsif p_table_name='families' then
    select f.created_by,f.id into v_created_by,v_family_id
    from public.families f where f.id=p_record_id and f.status='pending' for update;
    if v_created_by is null then raise exception 'Request not found or already reviewed'; end if;
    if v_role='family_moderator' and (v_created_by=auth.uid() or not private.has_family_moderator_scope(auth.uid(),v_family_id)) then raise exception 'Outside assigned scope or own request'; end if;
    if v_role='content_moderator' then raise exception 'Content moderators cannot review legacy family records'; end if;
    update public.families set status=p_status,approved_by=auth.uid(),approved_at=case when p_status='approved' then now() else null end where id=p_record_id;
  elsif p_table_name='people' then
    select p.created_by,p.family_id into v_created_by,v_family_id
    from public.people p where p.id=p_record_id and p.status='pending' for update;
    if v_created_by is null then raise exception 'Request not found or already reviewed'; end if;
    if v_role='family_moderator' and (v_created_by=auth.uid() or not private.person_in_family_moderator_scope(auth.uid(),p_record_id)) then raise exception 'Outside assigned scope or own request'; end if;
    if v_role='content_moderator' then raise exception 'Content moderators cannot review people'; end if;
    update public.people set status=p_status,approved_by=auth.uid(),approved_at=case when p_status='approved' then now() else null end where id=p_record_id;
  elsif p_table_name='events' then
    select e.created_by into v_created_by
    from public.events e where e.id=p_record_id and e.status='pending' for update;
    if v_created_by is null then raise exception 'Request not found or already reviewed'; end if;
    if v_role='content_moderator' and v_created_by=auth.uid() then raise exception 'Moderators cannot approve their own request'; end if;
    if v_role='family_moderator' and (v_created_by=auth.uid() or not private.event_in_moderator_scope(auth.uid(),p_record_id)) then raise exception 'Outside assigned scope or own request'; end if;
    update public.events set status=p_status,approved_by=auth.uid(),approved_at=case when p_status='approved' then now() else null end where id=p_record_id;
  elsif p_table_name='person_relationships' then
    select r.created_by,r.source_person_id,r.target_person_id into v_created_by,v_source_id,v_target_id
    from public.person_relationships r where r.id=p_record_id and r.status='pending' for update;
    if v_created_by is null then raise exception 'Request not found or already reviewed'; end if;
    if v_role='family_moderator' and (v_created_by=auth.uid()
       or not private.person_in_family_moderator_scope(auth.uid(),v_source_id)
       or not private.person_in_family_moderator_scope(auth.uid(),v_target_id)) then raise exception 'Outside assigned scope or own request'; end if;
    if v_role='content_moderator' then raise exception 'Content moderators cannot review relationships'; end if;
    update public.person_relationships set status=p_status,approved_by=auth.uid(),approved_at=case when p_status='approved' then now() else null end where id=p_record_id;
  else
    raise exception 'Unsupported moderation table';
  end if;
end;
$$;

create or replace function private.review_secondary_moderation_request(p_request_type text,p_request_id uuid,p_status text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text:=coalesce(private.active_role(auth.uid()),'');
  v_edit public.content_edit_requests%rowtype;
  v_membership public.person_family_memberships%rowtype;
  v_new_family_id uuid;
  v_rel public.person_relationships%rowtype;
begin
  if p_status not in ('approved','rejected') then raise exception 'Invalid review status'; end if;
  if v_role not in ('family_moderator','content_moderator','admin','super_admin') then raise exception 'Not authorized'; end if;

  if p_request_type='membership' then
    select * into v_membership
    from public.person_family_memberships
    where id=p_request_id and status='pending'
    for update;
    if v_membership.id is null then raise exception 'Request not found or already reviewed'; end if;
    if v_role not in ('admin','super_admin') and (
      v_role<>'family_moderator'
      or v_membership.created_by=auth.uid()
      or not private.has_family_moderator_scope(auth.uid(),v_membership.family_id)
    ) then raise exception 'Outside assigned scope or own request'; end if;
    update public.person_family_memberships
    set status=p_status,approved_by=auth.uid(),approved_at=case when p_status='approved' then now() else null end
    where id=p_request_id;
    return;
  end if;

  if p_request_type<>'edit' then raise exception 'Unsupported secondary request type'; end if;
  select * into v_edit
  from public.content_edit_requests
  where id=p_request_id and status='pending'
  for update;
  if v_edit.id is null then raise exception 'Request not found or already reviewed'; end if;
  if v_edit.requested_by=auth.uid() and v_role not in ('admin','super_admin') then raise exception 'Moderators cannot approve their own request'; end if;

  if v_role='content_moderator' and v_edit.entity_type<>'events' then raise exception 'Content moderator scope is limited to events'; end if;
  if v_role='family_moderator' then
    if v_edit.entity_type='families' and not private.has_family_moderator_scope(auth.uid(),v_edit.record_id) then raise exception 'Outside assigned scope'; end if;
    if v_edit.entity_type='people' and not private.person_in_family_moderator_scope(auth.uid(),v_edit.record_id) then raise exception 'Outside assigned scope'; end if;
    if v_edit.entity_type='events' and not private.event_in_moderator_scope(auth.uid(),v_edit.record_id) then raise exception 'Outside assigned scope'; end if;
    if v_edit.entity_type='person_relationships' then
      select * into v_rel from public.person_relationships where id=v_edit.record_id;
      if not private.person_in_family_moderator_scope(auth.uid(),v_rel.source_person_id)
         or not private.person_in_family_moderator_scope(auth.uid(),v_rel.target_person_id) then
        raise exception 'Outside assigned scope';
      end if;
    end if;
  end if;

  if p_status='approved' then
    if v_edit.entity_type='people' and v_edit.proposed_data?'family_id' then
      v_new_family_id:=nullif(v_edit.proposed_data->>'family_id','')::uuid;
      perform private.apply_primary_family(v_edit.record_id,v_new_family_id);
    elsif v_edit.entity_type='person_relationships' then
      update public.person_relationships set
        relation_type=case when v_edit.proposed_data?'relation_type' then v_edit.proposed_data->>'relation_type' else relation_type end,
        notes=case when v_edit.proposed_data?'notes' then nullif(trim(v_edit.proposed_data->>'notes'),'') else notes end,
        updated_at=now()
      where id=v_edit.record_id;
    elsif v_edit.entity_type='families' then
      update public.families set
        name=case when v_edit.proposed_data?'name' then trim(v_edit.proposed_data->>'name') else name end,
        description=case when v_edit.proposed_data?'description' then nullif(trim(v_edit.proposed_data->>'description'),'') else description end,
        origin_place=case when v_edit.proposed_data?'origin_place' then nullif(trim(v_edit.proposed_data->>'origin_place'),'') else origin_place end
      where id=v_edit.record_id;
    elsif v_edit.entity_type='people' then
      update public.people set
        full_name=case when v_edit.proposed_data?'full_name' then trim(v_edit.proposed_data->>'full_name') else full_name end,
        gender=case when v_edit.proposed_data?'gender' then nullif(v_edit.proposed_data->>'gender','') else gender end,
        birth_year=case when v_edit.proposed_data?'birth_year' then nullif(v_edit.proposed_data->>'birth_year','')::integer else birth_year end,
        is_deceased=case when v_edit.proposed_data?'is_deceased' then coalesce((v_edit.proposed_data->>'is_deceased')::boolean,false) else is_deceased end,
        death_date=case when v_edit.proposed_data?'death_date' then nullif(v_edit.proposed_data->>'death_date','')::date else death_date end,
        description=case when v_edit.proposed_data?'description' then nullif(trim(v_edit.proposed_data->>'description'),'') else description end
      where id=v_edit.record_id;
    elsif v_edit.entity_type='events' then
      update public.events set
        event_type=case when v_edit.proposed_data?'event_type' then v_edit.proposed_data->>'event_type' else event_type end,
        title=case when v_edit.proposed_data?'title' then trim(v_edit.proposed_data->>'title') else title end,
        description=case when v_edit.proposed_data?'description' then nullif(trim(v_edit.proposed_data->>'description'),'') else description end,
        event_date=case when v_edit.proposed_data?'event_date' then nullif(v_edit.proposed_data->>'event_date','')::date else event_date end,
        location_name=case when v_edit.proposed_data?'location_name' then nullif(trim(v_edit.proposed_data->>'location_name'),'') else location_name end
      where id=v_edit.record_id;
      perform private.infer_event_scope(v_edit.record_id);
    end if;
  end if;

  update public.content_edit_requests
  set status=p_status,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
  where id=p_request_id;
end;
$$;

create or replace function public.get_moderation_request_details(p_request_type text,p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_role text:=coalesce(private.active_role(auth.uid()),'');
  v_event public.events%rowtype;
  v_edit public.content_edit_requests%rowtype;
  v_requester public.profiles%rowtype;
  v_scope_name text;
begin
  if v_role not in ('family_moderator','content_moderator','admin','super_admin') then
    raise exception 'Not authorized to review moderation requests';
  end if;

  if v_role='family_moderator' and p_request_type='events' then
    if not private.event_in_moderator_scope(auth.uid(),p_request_id) then raise exception 'Outside assigned scope'; end if;
    select * into v_event from public.events where id=p_request_id;
    if v_event.id is null then return null; end if;
    select * into v_requester from public.profiles where id=v_event.created_by;
    select case v_event.scope_type
      when 'household' then 'أسرة '||(select p.full_name from public.people p where p.id=v_event.scope_id)
      when 'lineage' then regexp_replace((select l.display_name from public.lineages l where l.id=v_event.scope_id),'^عائلة\s+','نسب ')
      when 'branch' then (select b.display_name from public.lineage_branches b where b.id=v_event.scope_id)
      else 'عام'
    end into v_scope_name;

    return jsonb_build_object(
      'request_type','events',
      'operation','إضافة خبر أو مناسبة',
      'operation_description','سيؤدي الاعتماد إلى نشر المناسبة ضمن نطاقها المستنتج تلقائيًا.',
      'status',v_event.status,
      'created_at',v_event.created_at,
      'requester',jsonb_build_object(
        'id',v_requester.id,
        'display_name',coalesce(nullif(v_requester.display_name,''),v_requester.email,'مستخدم'),
        'email',v_requester.email,
        'role',v_requester.role,
        'linked_person_id',v_requester.linked_person_id,
        'linked_person_name',(select p.full_name from public.people p where p.id=v_requester.linked_person_id)
      ),
      'subject',jsonb_build_object('type','event','id',v_event.id,'name',v_event.title),
      'details',jsonb_build_array(
        jsonb_build_object('label','العنوان','value',v_event.title),
        jsonb_build_object('label','التاريخ','value',coalesce(v_event.event_date::text,'غير محدد')),
        jsonb_build_object('label','المكان','value',coalesce(nullif(v_event.location_name,''),'غير محدد')),
        jsonb_build_object('label','النطاق','value',v_scope_name),
        jsonb_build_object('label','التفاصيل','value',coalesce(nullif(v_event.description,''),'لا توجد تفاصيل'))
      ),
      'note',null
    );
  end if;

  if v_role='family_moderator' and p_request_type='edit' then
    select * into v_edit from public.content_edit_requests where id=p_request_id;
    if v_edit.id is not null and v_edit.entity_type='events' then
      if not private.event_in_moderator_scope(auth.uid(),v_edit.record_id) or v_edit.requested_by=auth.uid() then
        raise exception 'Outside assigned scope or own request';
      end if;
      select * into v_event from public.events where id=v_edit.record_id;
      select * into v_requester from public.profiles where id=v_edit.requested_by;
      return jsonb_build_object(
        'request_type','edit',
        'operation','تعديل مناسبة',
        'operation_description','سيؤدي الاعتماد إلى تطبيق التغييرات المقترحة على المناسبة مع إبقاء نطاقها محسوبًا من الأشخاص المرتبطين بها.',
        'status',v_edit.status,
        'created_at',v_edit.created_at,
        'requester',jsonb_build_object(
          'id',v_requester.id,
          'display_name',coalesce(nullif(v_requester.display_name,''),v_requester.email,'مستخدم'),
          'email',v_requester.email,
          'role',v_requester.role,
          'linked_person_id',v_requester.linked_person_id,
          'linked_person_name',(select p.full_name from public.people p where p.id=v_requester.linked_person_id)
        ),
        'subject',jsonb_build_object('type','events','id',v_event.id,'name',v_event.title),
        'details',jsonb_build_array(
          jsonb_build_object('label','السجل المستهدف','value',v_event.title),
          jsonb_build_object('label','عدد الحقول المقترحة','value',jsonb_object_length(v_edit.proposed_data)::text)
        ),
        'note',null
      );
    end if;
  end if;

  return private.get_moderation_request_details(p_request_type,p_request_id);
end;
$$;

create or replace function public.get_edit_request_review_details(p_request_id uuid)
returns table(request_id uuid,entity_type text,record_id uuid,requester_name text,created_at timestamptz,current_data jsonb,proposed_data jsonb)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_role text:=coalesce(private.active_role(auth.uid()),'');
  v_edit public.content_edit_requests%rowtype;
  v_rel public.person_relationships%rowtype;
  v_current jsonb:='{}'::jsonb;
  v_proposed jsonb;
  v_family_name text;
begin
  if v_role not in ('family_moderator','content_moderator','admin','super_admin') then raise exception 'Not authorized'; end if;
  select * into v_edit from public.content_edit_requests e where e.id=p_request_id and e.status='pending';
  if v_edit.id is null then raise exception 'Request not found or already reviewed'; end if;
  if v_role='content_moderator' and v_edit.entity_type<>'events' then raise exception 'Outside content moderator scope'; end if;

  if v_role='family_moderator' then
    if v_edit.entity_type='families' and not private.has_family_moderator_scope(auth.uid(),v_edit.record_id) then raise exception 'Outside assigned scope';
    elsif v_edit.entity_type='people' and not private.person_in_family_moderator_scope(auth.uid(),v_edit.record_id) then raise exception 'Outside assigned scope';
    elsif v_edit.entity_type='events' and not private.event_in_moderator_scope(auth.uid(),v_edit.record_id) then raise exception 'Outside assigned scope';
    elsif v_edit.entity_type='person_relationships' then
      select * into v_rel from public.person_relationships r where r.id=v_edit.record_id;
      if not private.person_in_family_moderator_scope(auth.uid(),v_rel.source_person_id)
         or not private.person_in_family_moderator_scope(auth.uid(),v_rel.target_person_id) then
        raise exception 'Outside assigned scope';
      end if;
    end if;
  end if;

  if v_edit.entity_type='families' then
    select jsonb_build_object('name',f.name,'origin_place',f.origin_place,'description',f.description)
    into v_current from public.families f where f.id=v_edit.record_id;
  elsif v_edit.entity_type='people' then
    select jsonb_build_object('full_name',p.full_name,'gender',p.gender,'birth_year',p.birth_year,'is_deceased',p.is_deceased,'death_date',p.death_date,'description',p.description)
    into v_current from public.people p where p.id=v_edit.record_id;
  elsif v_edit.entity_type='events' then
    select jsonb_build_object('event_type',e.event_type,'title',e.title,'event_date',e.event_date,'location_name',e.location_name,'description',e.description,'scope_type',e.scope_type,'scope_id',e.scope_id)
    into v_current from public.events e where e.id=v_edit.record_id;
  elsif v_edit.entity_type='person_relationships' then
    select jsonb_build_object('relation_type',r.relation_type,'notes',r.notes,'source_person',s.full_name,'target_person',t.full_name)
    into v_current
    from public.person_relationships r
    left join public.people s on s.id=r.source_person_id
    left join public.people t on t.id=r.target_person_id
    where r.id=v_edit.record_id;
  end if;

  v_proposed:=v_edit.proposed_data;
  if v_edit.entity_type in ('people','events') and v_proposed?'family_id' then
    select f.name into v_family_name
    from public.families f
    where f.id=nullif(v_proposed->>'family_id','')::uuid;
    v_proposed:=v_proposed||jsonb_build_object('family_name',v_family_name);
  end if;

  return query
  select v_edit.id,v_edit.entity_type,v_edit.record_id,
    coalesce(nullif(p.display_name,''),nullif(p.email,''),'مستخدم مسجل')::text,
    v_edit.created_at,coalesce(v_current,'{}'::jsonb),coalesce(v_proposed,'{}'::jsonb)
  from public.profiles p where p.id=v_edit.requested_by;
end;
$$;
