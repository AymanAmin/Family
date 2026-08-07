-- PHASE 17: RELATIONSHIP EDIT / DELETE WORKFLOW
-- Admins apply directly; owners edit/delete their own pending relation directly,
-- while changes to approved relationships require an admin review request.

begin;

create table if not exists public.relationship_change_requests (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.person_relationships(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('edit','delete')),
  proposed_relation_type text null check (proposed_relation_type is null or proposed_relation_type in ('parent','child','spouse','sibling','guardian','other')),
  proposed_notes text null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  review_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists relationship_change_one_pending_idx
  on public.relationship_change_requests (relationship_id)
  where status='pending';
create index if not exists relationship_change_pending_created_idx
  on public.relationship_change_requests (created_at,id) where status='pending';
create index if not exists relationship_change_owner_idx
  on public.relationship_change_requests (requested_by,created_at desc);

alter table public.relationship_change_requests enable row level security;
revoke all on table public.relationship_change_requests from anon,authenticated;
grant select on table public.relationship_change_requests to authenticated;

drop policy if exists "Relationship change visibility" on public.relationship_change_requests;
create policy "Relationship change visibility"
on public.relationship_change_requests for select to authenticated
using (
  requested_by=(select auth.uid())
  or coalesce(private.active_role((select auth.uid())), '') in ('admin','super_admin')
);

create or replace function public.request_relationship_change(
  p_relationship_id uuid,
  p_action text,
  p_relation_type text default null,
  p_notes text default null
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid();
  v_role text:=private.active_role(auth.uid());
  v_relation public.person_relationships%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_action not in ('edit','delete') then raise exception 'Invalid action'; end if;
  if p_action='edit' and p_relation_type not in ('parent','child','spouse','sibling','guardian','other') then
    raise exception 'Invalid relationship type';
  end if;

  select * into v_relation
  from public.person_relationships
  where id=p_relationship_id
  for update;

  if v_relation.id is null then raise exception 'Relationship not found'; end if;
  if coalesce(v_role,'') not in ('admin','super_admin') and v_relation.created_by<>v_user_id then
    raise exception 'Only the relationship owner or an administrator can change it';
  end if;

  if coalesce(v_role,'') in ('admin','super_admin') then
    if p_action='delete' then
      delete from public.person_relationships where id=p_relationship_id;
    else
      update public.person_relationships
      set relation_type=p_relation_type,
          notes=nullif(trim(coalesce(p_notes,'')),'')
      where id=p_relationship_id;
    end if;
    return 'applied';
  end if;

  if v_relation.status='pending' then
    if p_action='delete' then
      delete from public.person_relationships where id=p_relationship_id;
    else
      update public.person_relationships
      set relation_type=p_relation_type,
          notes=nullif(trim(coalesce(p_notes,'')),'')
      where id=p_relationship_id;
    end if;
    return 'applied';
  end if;

  if v_relation.status<>'approved' then raise exception 'Rejected relationship cannot be changed'; end if;

  insert into public.relationship_change_requests(relationship_id,requested_by,action,proposed_relation_type,proposed_notes)
  values (
    p_relationship_id,v_user_id,p_action,
    case when p_action='edit' then p_relation_type else null end,
    case when p_action='edit' then nullif(trim(coalesce(p_notes,'')),'') else null end
  );

  return 'pending';
end;
$$;

revoke all on function public.request_relationship_change(uuid,text,text,text) from public,anon;
grant execute on function public.request_relationship_change(uuid,text,text,text) to authenticated;

create or replace function public.list_pending_relationship_changes(
  p_limit integer default 13,
  p_offset integer default 0
)
returns table(
  id uuid,
  relationship_id uuid,
  action text,
  title text,
  subtitle text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,13),40));
  v_offset integer:=greatest(0,coalesce(p_offset,0));
begin
  if coalesce(private.active_role(auth.uid()),'') not in ('admin','super_admin') then
    raise exception 'Not authorized';
  end if;

  return query
  select q.id,q.relationship_id,q.action,
    (coalesce(s.full_name,'شخص')||' — '||coalesce(t.full_name,'شخص'))::text,
    (case when q.action='delete' then 'طلب حذف صلة قرابة' else 'تعديل إلى: '||
      case q.proposed_relation_type when 'parent' then 'والد/والدة' when 'child' then 'ابن/ابنة' when 'spouse' then 'زوج/زوجة' when 'sibling' then 'أخ/أخت' when 'guardian' then 'ولي/وصي' else 'صلة أخرى' end end)::text,
    q.created_at
  from public.relationship_change_requests q
  join public.person_relationships r on r.id=q.relationship_id
  left join public.people s on s.id=r.source_person_id
  left join public.people t on t.id=r.target_person_id
  where q.status='pending'
  order by q.created_at,q.id
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.list_pending_relationship_changes(integer,integer) from public,anon;
grant execute on function public.list_pending_relationship_changes(integer,integer) to authenticated;

create or replace function public.review_relationship_change(
  p_request_id uuid,
  p_status text,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request public.relationship_change_requests%rowtype;
begin
  if coalesce(private.active_role(auth.uid()),'') not in ('admin','super_admin') then raise exception 'Not authorized'; end if;
  if p_status not in ('approved','rejected') then raise exception 'Invalid review status'; end if;

  select * into v_request
  from public.relationship_change_requests
  where id=p_request_id and status='pending'
  for update;

  if v_request.id is null then raise exception 'Request not found or already reviewed'; end if;

  if p_status='approved' then
    if v_request.action='delete' then
      delete from public.person_relationships where id=v_request.relationship_id;
    else
      update public.person_relationships
      set relation_type=v_request.proposed_relation_type,
          notes=v_request.proposed_notes
      where id=v_request.relationship_id;
    end if;
  end if;

  update public.relationship_change_requests
  set status=p_status,
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      review_note=nullif(trim(coalesce(p_review_note,'')),''),
      updated_at=now()
  where id=p_request_id;
end;
$$;

revoke all on function public.review_relationship_change(uuid,text,text) from public,anon;
grant execute on function public.review_relationship_change(uuid,text,text) to authenticated;

notify pgrst,'reload schema';

commit;
