-- Hide member-submitted people until an admin/super-admin approves them.

-- Authenticated non-admin users can only read approved people.
drop policy if exists "Members can read approved or own people" on public.people;
drop policy if exists "Authenticated can read approved people; admins can review pending" on public.people;
create policy "Authenticated can read approved people; admins can review pending"
on public.people
for select
to authenticated
using (
  status = 'approved'
  or (
    status <> 'archived'
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.account_status = 'active'
        and p.role in ('admin', 'super_admin')
    )
  )
);

-- A family moderator's scope never includes an unapproved person.
create or replace function private.person_in_family_moderator_scope(p_user_id uuid, p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.people p
    where p.id = p_person_id
      and p.status = 'approved'
      and (
        private.has_family_moderator_scope(p_user_id, p.family_id)
        or exists (
          select 1
          from public.person_family_memberships m
          join public.family_moderator_assignments a
            on a.family_id = m.family_id
           and a.user_id = p_user_id
          where m.person_id = p.id
            and m.status = 'approved'
        )
      )
  );
$$;

-- Duplicate detection only searches published people and only by name prefix.
create or replace function public.find_similar_people(p_query text, p_limit integer default 6)
returns table(
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
set search_path = 'public', 'extensions'
as $$
declare
  v_query text := public.normalize_arabic_name(p_query);
  v_limit integer := greatest(1, least(coalesce(p_limit, 6), 10));
begin
  if char_length(v_query) < 2 then return; end if;

  return query
  select
    p.id,
    p.full_name,
    p.gender,
    p.birth_year,
    p.family_id,
    f.name,
    p.status,
    greatest(
      similarity(public.normalize_arabic_name(p.full_name), v_query),
      case
        when public.normalize_arabic_name(p.full_name) = v_query then 1.0
        when public.normalize_arabic_name(p.full_name) ilike v_query || '%' then 0.92
        else 0.0
      end
    )::real
  from public.people p
  left join public.families f on f.id = p.family_id
  where p.status = 'approved'
    and public.normalize_arabic_name(p.full_name) ilike v_query || '%'
  order by
    (public.normalize_arabic_name(p.full_name) = v_query) desc,
    similarity(public.normalize_arabic_name(p.full_name), v_query) desc,
    p.full_name
  limit v_limit;
end;
$$;

-- Keep My Activity useful without exposing unapproved person data.
create or replace function public.list_my_submission_activity(
  p_status text default null,
  p_limit integer default 11,
  p_offset integer default 0
)
returns table(
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
      case when p.status='approved' then p.full_name else 'إضافة شخص بانتظار اعتماد الإدارة' end::text,
      case when p.status='approved' then coalesce(nullif(f.name,''), 'إضافة شخص') else 'لن تظهر بيانات الشخص في المنصة قبل اعتماد أحد المدراء.' end::text,
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
      case when r.status='approved' and coalesce(s.status,'')='approved' and coalesce(t.status,'')='approved'
        then (coalesce(s.full_name,'شخص') || ' — ' || coalesce(t.full_name,'شخص'))
        else 'صلة قرابة بانتظار اعتماد الإدارة' end::text,
      case r.relation_type when 'parent' then 'صلة والد/والدة' when 'child' then 'صلة ابن/ابنة' when 'spouse' then 'صلة زوجية' when 'sibling' then 'صلة أخوة' else 'صلة قرابة' end::text,
      r.status::text, null::text, r.created_at
    from public.person_relationships r
    left join public.people s on s.id=r.source_person_id left join public.people t on t.id=r.target_person_id
    where r.created_by=v_user_id and (v_status is null or r.status=v_status)

    union all
    select m.id, 'membership'::text, 'person_family_memberships'::text, m.person_id,
      case when m.status='approved' and coalesce(p.status,'')='approved'
        then (coalesce(p.full_name,'شخص') || ' ← ' || coalesce(f.name,'عائلة'))
        else 'انتماء عائلي بانتظار اعتماد الإدارة' end::text,
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

revoke execute on function public.list_my_submission_activity(text, integer, integer) from anon;
grant execute on function public.list_my_submission_activity(text, integer, integer) to authenticated;

-- Family-moderator secondary queues must not reveal memberships for unapproved people.
create or replace function public.list_pending_secondary_moderation_feed(p_limit integer default 13, p_offset integer default 0)
returns table(id uuid, request_type text, title text, subtitle text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text:=coalesce(private.active_role(auth.uid()),'');
  v_limit integer:=greatest(1,least(coalesce(p_limit,13),50));
  v_offset integer:=greatest(0,coalesce(p_offset,0));
begin
  if v_role not in ('family_moderator','content_moderator','admin','super_admin') then raise exception 'Not authorized to review pending changes'; end if;
  return query
  with pending as (
    select e.id,'edit'::text,
      case e.entity_type when 'families' then 'تعديل بيانات عائلة' when 'people' then 'تعديل بيانات شخص' when 'events' then 'تعديل مناسبة' when 'person_relationships' then 'تعديل صلة قرابة' else 'تعديل سجل' end,
      coalesce(nullif(e.proposed_data->>'full_name',''),nullif(e.proposed_data->>'name',''),nullif(e.proposed_data->>'title',''),nullif(e.proposed_data->>'relation_type',''),case when e.proposed_data?'family_id' then 'تغيير العائلة الأساسية' end,'راجع البيانات المقترحة ثم اعتمد أو ارفض.')::text,
      e.created_at
    from public.content_edit_requests e
    where e.status='pending' and (
      v_role in ('admin','super_admin')
      or (v_role='content_moderator' and e.requested_by<>auth.uid() and e.entity_type='events')
      or (v_role='family_moderator' and e.requested_by<>auth.uid() and (
        (e.entity_type='families' and private.has_family_moderator_scope(auth.uid(),e.record_id))
        or (e.entity_type='people' and private.person_in_family_moderator_scope(auth.uid(),e.record_id))
        or (e.entity_type='events' and exists(select 1 from public.events ev where ev.id=e.record_id and private.has_family_moderator_scope(auth.uid(),ev.family_id)))
        or (e.entity_type='person_relationships' and exists(select 1 from public.person_relationships r where r.id=e.record_id and private.person_in_family_moderator_scope(auth.uid(),r.source_person_id) and private.person_in_family_moderator_scope(auth.uid(),r.target_person_id)))
      )))
    union all
    select m.id,'membership'::text,(coalesce(p.full_name,'شخص')||' ← '||coalesce(f.name,'عائلة'))::text,
      (case m.membership_type when 'birth' then 'بالنسب / عائلة الأصل' when 'marriage' then 'بالزواج' when 'paternal' then 'من جهة الأب' when 'maternal' then 'من جهة الأم' when 'guardian' then 'وصاية أو كفالة' else 'انتماء آخر' end||case when m.is_primary then ' · عائلة أساسية' else '' end||case when nullif(m.notes,'') is not null then ' · '||m.notes else '' end)::text,m.created_at
    from public.person_family_memberships m
    left join public.people p on p.id=m.person_id
    left join public.families f on f.id=m.family_id
    where m.status='pending' and (
      v_role in ('admin','super_admin')
      or (
        v_role='family_moderator'
        and m.created_by<>auth.uid()
        and private.has_family_moderator_scope(auth.uid(),m.family_id)
        and exists(select 1 from public.people pp where pp.id=m.person_id and pp.status='approved')
      )
    )
  )
  select q.id,q.request_type,q.title,q.subtitle,q.created_at
  from pending q
  order by q.created_at,q.id
  limit v_limit offset v_offset;
end;
$$;

revoke execute on function public.list_pending_secondary_moderation_feed(integer, integer) from anon;
grant execute on function public.list_pending_secondary_moderation_feed(integer, integer) to authenticated;

-- Put detailed moderation reads behind a guard.
do $$
begin
  if to_regprocedure('private.get_moderation_request_details(text,uuid)') is null then
    alter function public.get_moderation_request_details(text, uuid) set schema private;
  end if;
end;
$$;

revoke all on function private.get_moderation_request_details(text, uuid) from public;
revoke all on function private.get_moderation_request_details(text, uuid) from anon;
revoke all on function private.get_moderation_request_details(text, uuid) from authenticated;

create or replace function public.get_moderation_request_details(p_request_type text, p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(private.active_role(auth.uid()), '');
  v_person_status text;
begin
  if v_role not in ('family_moderator','content_moderator','admin','super_admin') then
    raise exception 'Not authorized to review moderation requests';
  end if;

  if p_request_type = 'people' and v_role not in ('admin','super_admin') then
    raise exception 'Only admins can view unapproved person submissions';
  end if;

  if p_request_type = 'membership' and v_role = 'family_moderator' then
    select p.status into v_person_status
    from public.person_family_memberships m
    join public.people p on p.id=m.person_id
    where m.id=p_request_id;
    if coalesce(v_person_status,'') <> 'approved' then
      raise exception 'Person must be approved by an admin first';
    end if;
  end if;

  if p_request_type = 'person_relationships' and v_role = 'family_moderator' then
    if exists (
      select 1
      from public.person_relationships r
      join public.people s on s.id=r.source_person_id
      join public.people t on t.id=r.target_person_id
      where r.id=p_request_id
        and (s.status <> 'approved' or t.status <> 'approved')
    ) then
      raise exception 'Person must be approved by an admin first';
    end if;
  end if;

  return private.get_moderation_request_details(p_request_type, p_request_id);
end;
$$;

revoke execute on function public.get_moderation_request_details(text, uuid) from anon;
grant execute on function public.get_moderation_request_details(text, uuid) to authenticated;

-- Guard secondary approvals too.
do $$
begin
  if to_regprocedure('private.review_secondary_moderation_request(text,uuid,text)') is null then
    alter function public.review_secondary_moderation_request(text, uuid, text) set schema private;
  end if;
end;
$$;

revoke all on function private.review_secondary_moderation_request(text, uuid, text) from public;
revoke all on function private.review_secondary_moderation_request(text, uuid, text) from anon;
revoke all on function private.review_secondary_moderation_request(text, uuid, text) from authenticated;

create or replace function public.review_secondary_moderation_request(p_request_type text, p_request_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(private.active_role(auth.uid()), '');
  v_person_status text;
begin
  if p_request_type='membership' and v_role='family_moderator' then
    select p.status into v_person_status
    from public.person_family_memberships m
    join public.people p on p.id=m.person_id
    where m.id=p_request_id;
    if coalesce(v_person_status,'') <> 'approved' then
      raise exception 'Person must be approved by an admin first';
    end if;
  end if;

  perform private.review_secondary_moderation_request(p_request_type, p_request_id, p_status);
end;
$$;

revoke execute on function public.review_secondary_moderation_request(text, uuid, text) from anon;
grant execute on function public.review_secondary_moderation_request(text, uuid, text) to authenticated;

-- Database invariant: no family membership can be approved before its person.
create or replace function private.enforce_approved_membership_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status='approved' and not exists (
    select 1 from public.people p where p.id=new.person_id and p.status='approved'
  ) then
    raise exception 'Person must be approved before family membership';
  end if;
  return new;
end;
$$;

drop trigger if exists person_family_membership_requires_approved_person on public.person_family_memberships;
create trigger person_family_membership_requires_approved_person
before insert or update of status, person_id
on public.person_family_memberships
for each row
execute function private.enforce_approved_membership_person();