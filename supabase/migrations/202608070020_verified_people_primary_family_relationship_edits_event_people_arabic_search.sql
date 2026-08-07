-- PHASE 16: VERIFIED PEOPLE + PRIMARY FAMILY CHANGE + RELATIONSHIP EDITS
--           + EVENT PEOPLE MENTIONS + BETTER ARABIC SEARCH

begin;

create extension if not exists pg_trgm with schema extensions;

-- 1) Public verification mark is denormalized on people for fast public reads.
alter table public.people add column if not exists is_verified boolean not null default false;
alter table public.people add column if not exists verified_at timestamptz;

-- Existing databases may already contain more than one account linked to the same
-- person. Do not unlink or destroy data automatically. A normal index is enough
-- for the verification lookup and lets administrators review duplicates safely.
drop index if exists public.profiles_one_linked_person_idx;
create index if not exists profiles_linked_person_idx
  on public.profiles(linked_person_id)
  where linked_person_id is not null;

update public.people p
set is_verified = true,
    verified_at = coalesce(p.verified_at, now())
where exists (
  select 1 from public.profiles pr
  where pr.linked_person_id = p.id
    and pr.account_status = 'active'
);

create or replace function private.sync_person_verification_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' and old.linked_person_id is not null
     and old.linked_person_id is distinct from new.linked_person_id then
    update public.people p
    set is_verified = exists (
          select 1 from public.profiles pr
          where pr.linked_person_id = p.id and pr.account_status = 'active'
        ),
        verified_at = case
          when exists (select 1 from public.profiles pr where pr.linked_person_id = p.id and pr.account_status = 'active') then coalesce(p.verified_at, now())
          else null
        end
    where p.id = old.linked_person_id;
  end if;

  if new.linked_person_id is not null and new.account_status = 'active' then
    update public.people
    set is_verified = true,
        verified_at = coalesce(verified_at, now())
    where id = new.linked_person_id;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_person_verification_from_profile() from public, anon, authenticated;
drop trigger if exists sync_person_verification_from_profile on public.profiles;
create trigger sync_person_verification_from_profile
after insert or update of linked_person_id, account_status on public.profiles
for each row execute function private.sync_person_verification_from_profile();

-- 2) Extend edit requests to direct relationships.
alter table public.content_edit_requests
  drop constraint if exists content_edit_requests_entity_type_check;
alter table public.content_edit_requests
  add constraint content_edit_requests_entity_type_check
  check (entity_type in ('families', 'people', 'events', 'person_relationships'));

-- One canonical helper to apply the primary family atomically.
create or replace function private.apply_primary_family(p_person_id uuid, p_family_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.person_family_memberships m
    where m.person_id = p_person_id
      and m.family_id = p_family_id
      and m.status = 'approved'
  ) then
    raise exception 'The selected family must be an approved membership for this person';
  end if;

  update public.person_family_memberships
  set is_primary = false, updated_at = now()
  where person_id = p_person_id
    and status = 'approved'
    and is_primary = true;

  update public.person_family_memberships
  set is_primary = true, updated_at = now()
  where person_id = p_person_id
    and family_id = p_family_id
    and status = 'approved';

  update public.people
  set family_id = p_family_id, updated_at = now()
  where id = p_person_id;
end;
$$;
revoke all on function private.apply_primary_family(uuid, uuid) from public, anon, authenticated;

create or replace function public.request_primary_family_change(
  p_person_id uuid,
  p_family_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select p.created_by into v_owner from public.people p where p.id = p_person_id;
  if v_owner is null then raise exception 'Person not found'; end if;
  if not exists (
    select 1 from public.person_family_memberships m
    where m.person_id=p_person_id and m.family_id=p_family_id and m.status='approved'
  ) then raise exception 'Selected family is not an approved membership'; end if;

  v_role := coalesce(private.active_role(auth.uid()), '');
  if v_role in ('admin','super_admin') then
    perform private.apply_primary_family(p_person_id, p_family_id);
    return 'approved';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'Only the record owner or an administrator can change the primary family';
  end if;

  if exists (
    select 1 from public.content_edit_requests e
    where e.entity_type='people' and e.record_id=p_person_id and e.requested_by=auth.uid() and e.status='pending'
  ) then raise exception 'There is already a pending edit request for this person'; end if;

  insert into public.content_edit_requests(entity_type,record_id,proposed_data,requested_by)
  values ('people', p_person_id, jsonb_build_object('family_id',p_family_id), auth.uid());
  return 'pending';
end;
$$;
revoke all on function public.request_primary_family_change(uuid, uuid) from public, anon;
grant execute on function public.request_primary_family_change(uuid, uuid) to authenticated;

create or replace function public.request_relationship_edit(
  p_relationship_id uuid,
  p_relation_type text,
  p_notes text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_relation_type not in ('parent','child','spouse','sibling','guardian','other') then raise exception 'Invalid relationship type'; end if;

  select r.created_by into v_owner
  from public.person_relationships r
  where r.id=p_relationship_id and r.status='approved';
  if v_owner is null then raise exception 'Relationship not found'; end if;

  v_role := coalesce(private.active_role(auth.uid()), '');
  if v_role in ('admin','super_admin') then
    update public.person_relationships
    set relation_type=p_relation_type,
        notes=nullif(trim(coalesce(p_notes,'')),''),
        updated_at=now()
    where id=p_relationship_id;
    return 'approved';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'Only the relationship owner or an administrator can edit it';
  end if;
  if exists (
    select 1 from public.content_edit_requests e
    where e.entity_type='person_relationships' and e.record_id=p_relationship_id and e.requested_by=auth.uid() and e.status='pending'
  ) then raise exception 'There is already a pending edit request for this relationship'; end if;

  insert into public.content_edit_requests(entity_type,record_id,proposed_data,requested_by)
  values ('person_relationships',p_relationship_id,
    jsonb_build_object('relation_type',p_relation_type,'notes',coalesce(p_notes,'')),auth.uid());
  return 'pending';
end;
$$;
revoke all on function public.request_relationship_edit(uuid, text, text) from public, anon;
grant execute on function public.request_relationship_edit(uuid, text, text) to authenticated;

-- 3) Event mentions / tagged people.
create table if not exists public.event_people (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  participant_role text not null default 'mentioned'
    check (participant_role in ('spouse_1','spouse_2','deceased','graduate','newborn','child','mentioned')),
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(event_id, person_id, participant_role)
);
create index if not exists event_people_event_idx on public.event_people(event_id,sort_order,id);
create index if not exists event_people_person_idx on public.event_people(person_id,event_id);
alter table public.event_people enable row level security;
revoke all on table public.event_people from anon, authenticated;
grant select on table public.event_people to anon, authenticated;

drop policy if exists "Public can read people on approved events" on public.event_people;
create policy "Public can read people on approved events"
on public.event_people for select to anon, authenticated
using (exists (select 1 from public.events e where e.id=event_id and e.status='approved'));

create or replace function public.create_event_with_people(
  p_event_type text,
  p_title text,
  p_family_id uuid default null,
  p_event_date date default null,
  p_location_name text default null,
  p_description text default null,
  p_participants jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_role text := coalesce(private.active_role(auth.uid()), '');
  v_direct boolean := v_role in ('admin','super_admin');
  v_item jsonb;
  v_person_id uuid;
  v_participant_role text;
  v_order integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if trim(coalesce(p_title,'')) = '' then raise exception 'Event title is required'; end if;
  if p_event_type not in ('death','wedding','birth','naming','graduation','general','other') then raise exception 'Invalid event type'; end if;
  if jsonb_typeof(coalesce(p_participants,'[]'::jsonb)) <> 'array' then raise exception 'Invalid participants'; end if;

  insert into public.events(event_type,title,family_id,event_date,location_name,description,created_by,status,approved_by,approved_at)
  values (p_event_type,trim(p_title),p_family_id,p_event_date,nullif(trim(coalesce(p_location_name,'')),''),nullif(trim(coalesce(p_description,'')),''),auth.uid(),case when v_direct then 'approved' else 'pending' end,case when v_direct then auth.uid() else null end,case when v_direct then now() else null end)
  returning id into v_event_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_participants,'[]'::jsonb)) loop
    v_person_id := nullif(v_item->>'person_id','')::uuid;
    v_participant_role := coalesce(nullif(v_item->>'role',''),'mentioned');
    if v_person_id is null then continue; end if;
    if v_participant_role not in ('spouse_1','spouse_2','deceased','graduate','newborn','child','mentioned') then raise exception 'Invalid participant role'; end if;
    if not exists (select 1 from public.people p where p.id=v_person_id and p.status='approved') then raise exception 'Tagged person must be approved'; end if;
    insert into public.event_people(event_id,person_id,participant_role,sort_order,created_by)
    values (v_event_id,v_person_id,v_participant_role,v_order,auth.uid())
    on conflict do nothing;
    v_order := v_order + 1;
  end loop;

  return v_event_id;
end;
$$;
revoke all on function public.create_event_with_people(text,text,uuid,date,text,text,jsonb) from public, anon;
grant execute on function public.create_event_with_people(text,text,uuid,date,text,text,jsonb) to authenticated;

-- 4) Arabic normalization: ignore hamza variants and match ta marbuta with ha.
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
        regexp_replace(coalesce(p_value, ''), '[\u064B-\u065F\u0670\u06D6-\u06ED]', '', 'g'),
        'أإآٱىئؤةۀ',
        'ااااييوهه'
      ),
      '\s+', ' ', 'g'
    )
  ));
$$;

create index if not exists people_approved_normalized_name_trgm_idx_v2
  on public.people using gin ((public.normalize_arabic_name(full_name)) extensions.gin_trgm_ops)
  where status='approved';
create index if not exists families_approved_normalized_name_trgm_idx
  on public.families using gin ((public.normalize_arabic_name(name)) extensions.gin_trgm_ops)
  where status='approved';

create or replace function public.search_directory_people(p_query text,p_limit integer default 9,p_offset integer default 0)
returns table(
  id uuid, full_name text, gender text, birth_year integer, is_deceased boolean, is_verified boolean,
  description text, status text, family_id uuid, family_name text, created_by uuid, created_at timestamptz
)
language plpgsql stable security invoker set search_path=public,extensions
as $$
declare
  v_query text := public.normalize_arabic_name(p_query);
  v_limit integer := greatest(1,least(coalesce(p_limit,9),30));
  v_offset integer := greatest(0,coalesce(p_offset,0));
begin
  return query
  select p.id,p.full_name,p.gender,p.birth_year,p.is_deceased,p.is_verified,p.description,p.status,p.family_id,f.name,p.created_by,p.created_at
  from public.people p left join public.families f on f.id=p.family_id
  where p.status='approved'
    and (v_query='' or public.normalize_arabic_name(p.full_name) ilike '%'||v_query||'%' or public.normalize_arabic_name(p.full_name) % v_query)
  order by case when v_query='' then 0 else similarity(public.normalize_arabic_name(p.full_name),v_query) end desc,
           case when v_query='' then p.created_at end desc,
           p.full_name asc
  limit v_limit offset v_offset;
end;
$$;
revoke all on function public.search_directory_people(text,integer,integer) from public;
grant execute on function public.search_directory_people(text,integer,integer) to anon,authenticated;

create or replace function public.search_directory_families(p_query text,p_limit integer default 9,p_offset integer default 0)
returns table(id uuid,name text,description text,origin_place text,status text,created_by uuid,created_at timestamptz)
language plpgsql stable security invoker set search_path=public,extensions
as $$
declare
  v_query text := public.normalize_arabic_name(p_query);
  v_limit integer := greatest(1,least(coalesce(p_limit,9),30));
  v_offset integer:=greatest(0,coalesce(p_offset,0));
begin
  return query
  select f.id,f.name,f.description,f.origin_place,f.status,f.created_by,f.created_at
  from public.families f
  where f.status='approved'
    and (v_query='' or public.normalize_arabic_name(f.name) ilike '%'||v_query||'%' or public.normalize_arabic_name(f.name) % v_query)
  order by case when v_query='' then 0 else similarity(public.normalize_arabic_name(f.name),v_query) end desc,
           case when v_query='' then f.created_at end desc,
           f.name asc
  limit v_limit offset v_offset;
end;
$$;
revoke all on function public.search_directory_families(text,integer,integer) from public;
grant execute on function public.search_directory_families(text,integer,integer) to anon,authenticated;

create or replace function public.search_people_names(p_query text,p_limit integer default 7,p_exclude_id uuid default null)
returns table(id uuid,full_name text,gender text,birth_year integer,is_verified boolean)
language plpgsql stable security invoker set search_path=public,extensions
as $$
declare
  v_query text:=public.normalize_arabic_name(p_query);
  v_limit integer:=greatest(1,least(coalesce(p_limit,7),12));
begin
  if char_length(v_query)<2 then return; end if;
  return query
  select p.id,p.full_name,p.gender,p.birth_year,p.is_verified
  from public.people p
  where p.status='approved' and (p_exclude_id is null or p.id<>p_exclude_id)
    and (public.normalize_arabic_name(p.full_name) ilike '%'||v_query||'%' or public.normalize_arabic_name(p.full_name) % v_query)
  order by (public.normalize_arabic_name(p.full_name)=v_query) desc,
           similarity(public.normalize_arabic_name(p.full_name),v_query) desc,p.full_name
  limit v_limit;
end;
$$;
revoke all on function public.search_people_names(text,integer,uuid) from public;
grant execute on function public.search_people_names(text,integer,uuid) to anon,authenticated;

-- Update duplicate search to use the improved normalizer automatically.
create or replace function public.find_similar_people(p_query text,p_limit integer default 6)
returns table(id uuid,full_name text,gender text,birth_year integer,family_id uuid,family_name text,status text,match_score real)
language plpgsql stable security invoker set search_path=public,extensions
as $$
declare
  v_query text:=public.normalize_arabic_name(p_query);
  v_limit integer:=greatest(1,least(coalesce(p_limit,6),10));
begin
  if char_length(v_query)<2 then return; end if;
  return query
  select p.id,p.full_name,p.gender,p.birth_year,p.family_id,f.name,p.status,
    greatest(similarity(public.normalize_arabic_name(p.full_name),v_query),
      case when public.normalize_arabic_name(p.full_name)=v_query then 1.0
           when public.normalize_arabic_name(p.full_name) ilike '%'||v_query||'%' then 0.92 else 0.0 end)::real
  from public.people p left join public.families f on f.id=p.family_id
  where p.status in ('approved','pending') and (
    public.normalize_arabic_name(p.full_name) ilike '%'||v_query||'%' or public.normalize_arabic_name(p.full_name) % v_query)
  order by (public.normalize_arabic_name(p.full_name)=v_query) desc,
           greatest(similarity(public.normalize_arabic_name(p.full_name),v_query),case when public.normalize_arabic_name(p.full_name) ilike '%'||v_query||'%' then 0.92 else 0 end) desc,
           p.full_name
  limit v_limit;
end;
$$;
revoke all on function public.find_similar_people(text,integer) from public;
grant execute on function public.find_similar_people(text,integer) to anon,authenticated;

-- 5) Secondary moderation feed now understands relationship edits.
create or replace function public.list_pending_secondary_moderation_feed(p_limit integer default 13,p_offset integer default 0)
returns table(id uuid,request_type text,title text,subtitle text,created_at timestamptz)
language plpgsql stable security definer set search_path=''
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
    from public.person_family_memberships m left join public.people p on p.id=m.person_id left join public.families f on f.id=m.family_id
    where m.status='pending' and (v_role in ('admin','super_admin') or (v_role='family_moderator' and m.created_by<>auth.uid() and private.has_family_moderator_scope(auth.uid(),m.family_id)))
  )
  select q.id,q.request_type,q.title,q.subtitle,q.created_at from pending q order by q.created_at,q.id limit v_limit offset v_offset;
end;
$$;
revoke all on function public.list_pending_secondary_moderation_feed(integer,integer) from public,anon;
grant execute on function public.list_pending_secondary_moderation_feed(integer,integer) to authenticated;

-- Review endpoint applies primary family changes and relationship edits securely.
create or replace function public.review_secondary_moderation_request(p_request_type text,p_request_id uuid,p_status text)
returns void language plpgsql security definer set search_path=''
as $$
declare
  v_role text:=coalesce(private.active_role(auth.uid()),'');
  v_edit public.content_edit_requests%rowtype;
  v_membership public.person_family_memberships%rowtype;
  v_event_family_id uuid;
  v_new_family_id uuid;
  v_rel public.person_relationships%rowtype;
begin
  if p_status not in ('approved','rejected') then raise exception 'Invalid review status'; end if;
  if v_role not in ('family_moderator','content_moderator','admin','super_admin') then raise exception 'Not authorized'; end if;

  if p_request_type='membership' then
    select * into v_membership from public.person_family_memberships where id=p_request_id and status='pending' for update;
    if v_membership.id is null then raise exception 'Request not found or already reviewed'; end if;
    if v_role not in ('admin','super_admin') and (v_role<>'family_moderator' or v_membership.created_by=auth.uid() or not private.has_family_moderator_scope(auth.uid(),v_membership.family_id)) then raise exception 'Outside assigned family scope or own request'; end if;
    update public.person_family_memberships set status=p_status,approved_by=auth.uid(),approved_at=case when p_status='approved' then now() else null end where id=p_request_id;
    return;
  end if;

  if p_request_type<>'edit' then raise exception 'Unsupported secondary request type'; end if;
  select * into v_edit from public.content_edit_requests where id=p_request_id and status='pending' for update;
  if v_edit.id is null then raise exception 'Request not found or already reviewed'; end if;
  if v_edit.requested_by=auth.uid() and v_role not in ('admin','super_admin') then raise exception 'Moderators cannot approve their own request'; end if;

  if v_role='content_moderator' and v_edit.entity_type<>'events' then raise exception 'Content moderator scope is limited to events'; end if;
  if v_role='family_moderator' then
    if v_edit.entity_type='families' and not private.has_family_moderator_scope(auth.uid(),v_edit.record_id) then raise exception 'Outside assigned family scope'; end if;
    if v_edit.entity_type='people' and not private.person_in_family_moderator_scope(auth.uid(),v_edit.record_id) then raise exception 'Outside assigned family scope'; end if;
    if v_edit.entity_type='events' then select e.family_id into v_event_family_id from public.events e where e.id=v_edit.record_id; if not private.has_family_moderator_scope(auth.uid(),v_event_family_id) then raise exception 'Outside assigned family scope'; end if; end if;
    if v_edit.entity_type='person_relationships' then select * into v_rel from public.person_relationships where id=v_edit.record_id; if not private.person_in_family_moderator_scope(auth.uid(),v_rel.source_person_id) or not private.person_in_family_moderator_scope(auth.uid(),v_rel.target_person_id) then raise exception 'Outside assigned family scope'; end if; end if;
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
      update public.families set name=case when v_edit.proposed_data?'name' then trim(v_edit.proposed_data->>'name') else name end,description=case when v_edit.proposed_data?'description' then nullif(trim(v_edit.proposed_data->>'description'),'') else description end,origin_place=case when v_edit.proposed_data?'origin_place' then nullif(trim(v_edit.proposed_data->>'origin_place'),'') else origin_place end where id=v_edit.record_id;
    elsif v_edit.entity_type='people' then
      update public.people set full_name=case when v_edit.proposed_data?'full_name' then trim(v_edit.proposed_data->>'full_name') else full_name end,gender=case when v_edit.proposed_data?'gender' then nullif(v_edit.proposed_data->>'gender','') else gender end,birth_year=case when v_edit.proposed_data?'birth_year' then nullif(v_edit.proposed_data->>'birth_year','')::integer else birth_year end,is_deceased=case when v_edit.proposed_data?'is_deceased' then coalesce((v_edit.proposed_data->>'is_deceased')::boolean,false) else is_deceased end,death_date=case when v_edit.proposed_data?'death_date' then nullif(v_edit.proposed_data->>'death_date','')::date else death_date end,description=case when v_edit.proposed_data?'description' then nullif(trim(v_edit.proposed_data->>'description'),'') else description end where id=v_edit.record_id;
    elsif v_edit.entity_type='events' then
      update public.events set event_type=case when v_edit.proposed_data?'event_type' then v_edit.proposed_data->>'event_type' else event_type end,title=case when v_edit.proposed_data?'title' then trim(v_edit.proposed_data->>'title') else title end,description=case when v_edit.proposed_data?'description' then nullif(trim(v_edit.proposed_data->>'description'),'') else description end,event_date=case when v_edit.proposed_data?'event_date' then nullif(v_edit.proposed_data->>'event_date','')::date else event_date end,location_name=case when v_edit.proposed_data?'location_name' then nullif(trim(v_edit.proposed_data->>'location_name'),'') else location_name end,family_id=case when v_edit.proposed_data?'family_id' then nullif(v_edit.proposed_data->>'family_id','')::uuid else family_id end where id=v_edit.record_id;
    end if;
  end if;
  update public.content_edit_requests set status=p_status,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_request_id;
end;
$$;
revoke all on function public.review_secondary_moderation_request(text,uuid,text) from public,anon;
grant execute on function public.review_secondary_moderation_request(text,uuid,text) to authenticated;

notify pgrst,'reload schema';
commit;
