-- PHASE 21: LINK INTEGRITY REVIEW + EXPLICIT REPAIR
-- Existing duplicate profile->person links are reported, never detached automatically.
-- New approvals cannot create another duplicate link.

begin;

create schema if not exists private;

alter table public.people add column if not exists is_verified boolean not null default false;
alter table public.people add column if not exists verified_at timestamptz;

-- The old unique index caused migrations to fail on legacy duplicate data.
-- Keep a normal lookup index; approval RPCs enforce uniqueness for new links.
drop index if exists public.profiles_one_linked_person_idx;
create index if not exists profiles_linked_person_idx
  on public.profiles(linked_person_id)
  where linked_person_id is not null;

create table if not exists private.linked_person_conflict_audit (
  id bigint generated always as identity primary key,
  person_id uuid not null,
  kept_user_id uuid not null,
  detached_user_id uuid not null,
  detached_role text null,
  resolved_by uuid not null,
  resolved_at timestamptz not null default now(),
  reason text not null default 'duplicate linked_person_id resolved manually by primary administrator'
);
revoke all on table private.linked_person_conflict_audit from public, anon, authenticated;

-- Recalculate public blue verification from the links that actually exist.
update public.people person
set is_verified = exists (
      select 1 from public.profiles p
      where p.linked_person_id = person.id
        and p.account_status = 'active'
    ),
    verified_at = case
      when exists (
        select 1 from public.profiles p
        where p.linked_person_id = person.id
          and p.account_status = 'active'
      ) then coalesce(person.verified_at, now())
      else null
    end;

-- Primary admin can inspect conflicts without exposing account details publicly.
create or replace function public.list_duplicate_person_links(
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  person_id uuid,
  person_name text,
  linked_accounts bigint,
  user_id uuid,
  display_name text,
  email text,
  role text,
  account_status text,
  profile_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,20),100));
  v_offset integer := greatest(0, coalesce(p_offset,0));
begin
  if not private.is_primary_admin(auth.uid()) then
    raise exception 'Only the primary administrator can inspect duplicate account links';
  end if;

  return query
  with duplicated as (
    select p.linked_person_id, count(*)::bigint account_count
    from public.profiles p
    where p.linked_person_id is not null
      and p.account_status = 'active'
    group by p.linked_person_id
    having count(*) > 1
  ), rows as (
    select
      d.linked_person_id person_id,
      coalesce(pe.full_name,'شخص')::text person_name,
      d.account_count,
      pr.id user_id,
      coalesce(nullif(pr.display_name,''),nullif(pr.email,''),'مستخدم مسجل')::text display_name,
      pr.email::text,
      coalesce(pr.role,'member')::text role,
      pr.account_status::text,
      pr.updated_at profile_updated_at
    from duplicated d
    join public.profiles pr on pr.linked_person_id=d.linked_person_id and pr.account_status='active'
    left join public.people pe on pe.id=d.linked_person_id
  )
  select r.person_id,r.person_name,r.account_count,r.user_id,r.display_name,r.email,r.role,r.account_status,r.profile_updated_at
  from rows r
  order by r.person_name,r.person_id,r.profile_updated_at,r.user_id
  limit v_limit offset v_offset;
end;
$$;
revoke all on function public.list_duplicate_person_links(integer,integer) from public, anon;
grant execute on function public.list_duplicate_person_links(integer,integer) to authenticated;

-- Resolution is explicit: the primary admin chooses which account remains linked.
create or replace function public.resolve_duplicate_person_link(
  p_person_id uuid,
  p_keep_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_item record;
  v_detached integer := 0;
begin
  if not private.is_primary_admin(auth.uid()) then
    raise exception 'Only the primary administrator can resolve duplicate account links';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id=p_keep_user_id
      and p.linked_person_id=p_person_id
      and p.account_status='active'
  ) then
    raise exception 'The account selected to keep is not actively linked to this person';
  end if;

  for row_item in
    select p.id,p.role
    from public.profiles p
    where p.linked_person_id=p_person_id
      and p.id<>p_keep_user_id
    for update
  loop
    insert into private.linked_person_conflict_audit(person_id,kept_user_id,detached_user_id,detached_role,resolved_by)
    values (p_person_id,p_keep_user_id,row_item.id,row_item.role,auth.uid());

    update public.profiles
    set linked_person_id=null,
        role=case when role='verified_member' then 'member' else role end,
        updated_at=now()
    where id=row_item.id;

    update public.account_link_requests
    set status='rejected',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where user_id=row_item.id and person_id=p_person_id and status='approved';

    if to_regprocedure('private.sync_app_role(uuid,text)') is not null then
      perform private.sync_app_role(row_item.id,(select p.role from public.profiles p where p.id=row_item.id));
    end if;

    v_detached := v_detached + 1;
  end loop;

  update public.people
  set is_verified=true,verified_at=coalesce(verified_at,now())
  where id=p_person_id;

  return v_detached;
end;
$$;
revoke all on function public.resolve_duplicate_person_link(uuid,uuid) from public, anon;
grant execute on function public.resolve_duplicate_person_link(uuid,uuid) to authenticated;

-- Latest account-link approval endpoint: reject a collision before changing data.
create or replace function public.review_account_link_request(
  p_request_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_person_id uuid;
  v_role text;
  v_existing_user_id uuid;
begin
  if p_status not in ('approved','rejected') then raise exception 'Invalid review status'; end if;
  if coalesce(private.active_role(auth.uid()),'') not in ('admin','super_admin') then raise exception 'Not authorized'; end if;

  select r.user_id,r.person_id into v_user_id,v_person_id
  from public.account_link_requests r
  where r.id=p_request_id and r.status='pending'
  for update;

  if v_user_id is null then raise exception 'Request not found or already reviewed'; end if;

  if p_status='approved' then
    if not exists(select 1 from public.people p where p.id=v_person_id and p.status='approved') then
      raise exception 'The person record must be approved before linking an account';
    end if;

    select p.id into v_existing_user_id
    from public.profiles p
    where p.linked_person_id=v_person_id
      and p.account_status='active'
      and p.id<>v_user_id
    limit 1;

    if v_existing_user_id is not null then
      raise exception 'This person is already linked to another account. Resolve the existing link before approval.';
    end if;
  end if;

  update public.account_link_requests
  set status=p_status,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
  where id=p_request_id;

  if p_status='approved' then
    update public.profiles
    set linked_person_id=v_person_id,
        role=case when role='member' then 'verified_member' else role end,
        updated_at=now()
    where id=v_user_id
    returning role into v_role;

    update public.people
    set is_verified=true,verified_at=coalesce(verified_at,now())
    where id=v_person_id;

    if to_regprocedure('private.sync_app_role(uuid,text)') is not null then
      perform private.sync_app_role(v_user_id,v_role);
    end if;
  end if;
end;
$$;
revoke all on function public.review_account_link_request(uuid,text) from public, anon;
grant execute on function public.review_account_link_request(uuid,text) to authenticated;

notify pgrst,'reload schema';

commit;
