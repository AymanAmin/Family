-- PHASE 21: LINK INTEGRITY REPAIR + UNIQUE GUARD
-- Safely resolves existing duplicate profile->person links without deleting accounts,
-- preserves an audit trail, and then enforces one linked account per person.

begin;

create schema if not exists private;

create table if not exists private.linked_person_conflicts (
  id bigint generated always as identity primary key,
  person_id uuid not null,
  kept_user_id uuid not null,
  detached_user_id uuid not null,
  detached_role text null,
  detected_at timestamptz not null default now(),
  reason text not null default 'duplicate linked_person_id repaired before unique constraint'
);

revoke all on table private.linked_person_conflicts from public, anon, authenticated;

-- Remove an older unique index first, because some databases failed halfway through
-- creating it and others may already have it from a previous attempt.
drop index if exists public.profiles_one_linked_person_idx;

-- Rank every duplicated link deterministically.
-- Priority: active account -> approved link request -> earliest approval -> oldest profile.
with ranked as (
  select
    p.id as user_id,
    p.linked_person_id as person_id,
    p.role,
    row_number() over (
      partition by p.linked_person_id
      order by
        (p.account_status = 'active') desc,
        (approved_link.reviewed_at is not null) desc,
        approved_link.reviewed_at asc nulls last,
        p.created_at asc,
        p.id
    ) as rn,
    first_value(p.id) over (
      partition by p.linked_person_id
      order by
        (p.account_status = 'active') desc,
        (approved_link.reviewed_at is not null) desc,
        approved_link.reviewed_at asc nulls last,
        p.created_at asc,
        p.id
    ) as kept_user_id
  from public.profiles p
  left join lateral (
    select min(r.reviewed_at) reviewed_at
    from public.account_link_requests r
    where r.user_id = p.id
      and r.person_id = p.linked_person_id
      and r.status = 'approved'
  ) approved_link on true
  where p.linked_person_id is not null
), duplicates as (
  select * from ranked where rn > 1
)
insert into private.linked_person_conflicts(person_id, kept_user_id, detached_user_id, detached_role)
select d.person_id, d.kept_user_id, d.user_id, d.role
from duplicates d
where not exists (
  select 1
  from private.linked_person_conflicts c
  where c.person_id = d.person_id
    and c.kept_user_id = d.kept_user_id
    and c.detached_user_id = d.user_id
);

-- Re-open old approved requests for detached duplicates by marking them rejected.
-- This keeps the historical row but allows the user to submit a correct link later.
update public.account_link_requests r
set status = 'rejected',
    reviewed_at = coalesce(r.reviewed_at, now()),
    updated_at = now()
where r.status = 'approved'
  and exists (
    select 1
    from private.linked_person_conflicts c
    where c.detached_user_id = r.user_id
      and c.person_id = r.person_id
  );

-- Detach only the duplicated link. No auth user/profile is deleted.
update public.profiles p
set linked_person_id = null,
    role = case when p.role = 'verified_member' then 'member' else p.role end,
    updated_at = now()
where exists (
  select 1
  from private.linked_person_conflicts c
  where c.detached_user_id = p.id
    and c.person_id = p.linked_person_id
);

-- Keep app metadata aligned for accounts downgraded from verified_member.
do $$
declare
  row_item record;
begin
  if to_regprocedure('private.sync_app_role(uuid,text)') is not null then
    for row_item in
      select p.id, p.role
      from public.profiles p
      where exists (
        select 1 from private.linked_person_conflicts c where c.detached_user_id = p.id
      )
    loop
      perform private.sync_app_role(row_item.id, row_item.role);
    end loop;
  end if;
end $$;

-- Recalculate public verification after repair.
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

-- Enforce one profile per person going forward.
create unique index if not exists profiles_one_linked_person_idx
  on public.profiles(linked_person_id)
  where linked_person_id is not null;

-- Latest account-link approval endpoint with a friendly collision check.
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
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  if coalesce(private.active_role(auth.uid()), '') not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  select r.user_id, r.person_id
  into v_user_id, v_person_id
  from public.account_link_requests r
  where r.id = p_request_id and r.status = 'pending'
  for update;

  if v_user_id is null then
    raise exception 'Request not found or already reviewed';
  end if;

  if p_status = 'approved' then
    if not exists (select 1 from public.people p where p.id = v_person_id and p.status = 'approved') then
      raise exception 'The person record must be approved before linking an account';
    end if;

    select p.id into v_existing_user_id
    from public.profiles p
    where p.linked_person_id = v_person_id
      and p.id <> v_user_id
    limit 1;

    if v_existing_user_id is not null then
      raise exception 'This person is already linked to another account. Resolve the existing link before approval.';
    end if;
  end if;

  update public.account_link_requests
  set status = p_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;

  if p_status = 'approved' then
    update public.profiles
    set linked_person_id = v_person_id,
        role = case when role = 'member' then 'verified_member' else role end,
        updated_at = now()
    where id = v_user_id
    returning role into v_role;

    update public.people
    set is_verified = true,
        verified_at = coalesce(verified_at, now())
    where id = v_person_id;

    if to_regprocedure('private.sync_app_role(uuid,text)') is not null then
      perform private.sync_app_role(v_user_id, v_role);
    end if;
  end if;
end;
$$;

revoke all on function public.review_account_link_request(uuid, text) from public, anon;
grant execute on function public.review_account_link_request(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
