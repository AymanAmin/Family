-- PHASE 3: MODERATED OWNER EDITS + MULTI-FAMILY MEMBERSHIPS
-- Safe to run after the base setup and phase 2 migrations.

begin;

create table if not exists public.person_family_memberships (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  membership_type text not null default 'birth'
    check (membership_type in ('birth', 'marriage', 'paternal', 'maternal', 'guardian', 'other')),
  is_primary boolean not null default false,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists person_family_memberships_active_unique_idx
  on public.person_family_memberships(person_id, family_id, membership_type)
  where status in ('pending', 'approved');

create unique index if not exists person_family_memberships_one_primary_idx
  on public.person_family_memberships(person_id)
  where is_primary = true and status = 'approved';

create index if not exists person_family_memberships_person_idx
  on public.person_family_memberships(person_id);
create index if not exists person_family_memberships_family_idx
  on public.person_family_memberships(family_id);
create index if not exists person_family_memberships_status_idx
  on public.person_family_memberships(status);

-- Preserve current data: a person's old family_id becomes the primary birth-family membership.
insert into public.person_family_memberships (
  person_id, family_id, membership_type, is_primary, notes, status,
  created_by, approved_by, approved_at, created_at, updated_at
)
select
  p.id,
  p.family_id,
  'birth',
  true,
  'تم ترحيلها تلقائيًا من العائلة الأساسية السابقة',
  p.status,
  p.created_by,
  p.approved_by,
  p.approved_at,
  p.created_at,
  p.updated_at
from public.people p
where p.family_id is not null
on conflict do nothing;

create table if not exists public.content_edit_requests (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('families', 'people', 'events')),
  record_id uuid not null,
  proposed_data jsonb not null check (jsonb_typeof(proposed_data) = 'object'),
  requested_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists content_edit_requests_one_pending_idx
  on public.content_edit_requests(entity_type, record_id, requested_by)
  where status = 'pending';
create index if not exists content_edit_requests_status_idx
  on public.content_edit_requests(status, created_at);

alter table public.person_family_memberships enable row level security;
alter table public.content_edit_requests enable row level security;

revoke all on table public.person_family_memberships from anon, authenticated;
revoke all on table public.content_edit_requests from anon, authenticated;
grant select on table public.person_family_memberships to anon, authenticated;
grant insert, update on table public.person_family_memberships to authenticated;
grant select, insert on table public.content_edit_requests to authenticated;

drop policy if exists "Public can read approved family memberships" on public.person_family_memberships;
drop policy if exists "Members can read memberships" on public.person_family_memberships;
drop policy if exists "Members can submit memberships" on public.person_family_memberships;
drop policy if exists "Members can edit own pending memberships" on public.person_family_memberships;
drop policy if exists "Admins can manage memberships" on public.person_family_memberships;
drop policy if exists "Members can read edit requests" on public.content_edit_requests;
drop policy if exists "Members can submit edit requests" on public.content_edit_requests;

create policy "Public can read approved family memberships"
on public.person_family_memberships
for select to anon
using (status = 'approved');

create policy "Members can read memberships"
on public.person_family_memberships
for select to authenticated
using (
  status = 'approved'
  or created_by = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

create policy "Members can submit memberships"
on public.person_family_memberships
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'pending'
);

create policy "Members can edit own pending memberships"
on public.person_family_memberships
for update to authenticated
using (created_by = (select auth.uid()) and status = 'pending')
with check (created_by = (select auth.uid()) and status = 'pending');

create policy "Admins can manage memberships"
on public.person_family_memberships
for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

create policy "Members can read edit requests"
on public.content_edit_requests
for select to authenticated
using (
  requested_by = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

create policy "Members can submit edit requests"
on public.content_edit_requests
for insert to authenticated
with check (requested_by = (select auth.uid()) and status = 'pending');

create or replace function public.request_content_edit(
  p_entity_type text,
  p_record_id uuid,
  p_proposed_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_owner uuid;
  v_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_entity_type not in ('families', 'people', 'events') then
    raise exception 'Unsupported entity type';
  end if;

  if p_proposed_data is null or jsonb_typeof(p_proposed_data) <> 'object' then
    raise exception 'Invalid proposed data';
  end if;

  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  ) into v_is_admin;

  if p_entity_type = 'families' then
    select created_by into v_owner from public.families where id = p_record_id;
  elsif p_entity_type = 'people' then
    select created_by into v_owner from public.people where id = p_record_id;
  else
    select created_by into v_owner from public.events where id = p_record_id;
  end if;

  if v_owner is null then
    raise exception 'Record not found';
  end if;

  if not v_is_admin and v_owner <> auth.uid() then
    raise exception 'Only the record owner or an administrator can edit it';
  end if;

  -- Administrators apply edits immediately; owners create a pending request.
  if v_is_admin then
    if p_entity_type = 'families' then
      update public.families
      set
        name = case when p_proposed_data ? 'name' then trim(p_proposed_data ->> 'name') else name end,
        description = case when p_proposed_data ? 'description' then nullif(trim(p_proposed_data ->> 'description'), '') else description end,
        origin_place = case when p_proposed_data ? 'origin_place' then nullif(trim(p_proposed_data ->> 'origin_place'), '') else origin_place end,
        updated_at = now()
      where id = p_record_id;
    elsif p_entity_type = 'people' then
      update public.people
      set
        full_name = case when p_proposed_data ? 'full_name' then trim(p_proposed_data ->> 'full_name') else full_name end,
        gender = case when p_proposed_data ? 'gender' then nullif(p_proposed_data ->> 'gender', '') else gender end,
        birth_year = case when p_proposed_data ? 'birth_year' then nullif(p_proposed_data ->> 'birth_year', '')::integer else birth_year end,
        is_deceased = case when p_proposed_data ? 'is_deceased' then coalesce((p_proposed_data ->> 'is_deceased')::boolean, false) else is_deceased end,
        death_date = case when p_proposed_data ? 'death_date' then nullif(p_proposed_data ->> 'death_date', '')::date else death_date end,
        description = case when p_proposed_data ? 'description' then nullif(trim(p_proposed_data ->> 'description'), '') else description end,
        updated_at = now()
      where id = p_record_id;
    else
      update public.events
      set
        event_type = case when p_proposed_data ? 'event_type' then p_proposed_data ->> 'event_type' else event_type end,
        title = case when p_proposed_data ? 'title' then trim(p_proposed_data ->> 'title') else title end,
        description = case when p_proposed_data ? 'description' then nullif(trim(p_proposed_data ->> 'description'), '') else description end,
        event_date = case when p_proposed_data ? 'event_date' then nullif(p_proposed_data ->> 'event_date', '')::date else event_date end,
        location_name = case when p_proposed_data ? 'location_name' then nullif(trim(p_proposed_data ->> 'location_name'), '') else location_name end,
        family_id = case when p_proposed_data ? 'family_id' then nullif(p_proposed_data ->> 'family_id', '')::uuid else family_id end,
        updated_at = now()
      where id = p_record_id;
    end if;
    return null;
  end if;

  insert into public.content_edit_requests(entity_type, record_id, proposed_data, requested_by)
  values (p_entity_type, p_record_id, p_proposed_data, auth.uid())
  returning id into v_request_id;

  return v_request_id;
end;
$$;

grant execute on function public.request_content_edit(text, uuid, jsonb) to authenticated;

create or replace function public.review_content_edit_request(
  p_request_id uuid,
  p_status text,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.content_edit_requests%rowtype;
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  ) then
    raise exception 'Not authorized';
  end if;

  select * into v_request
  from public.content_edit_requests
  where id = p_request_id and status = 'pending'
  for update;

  if v_request.id is null then
    raise exception 'Request not found or already reviewed';
  end if;

  if p_status = 'approved' then
    if v_request.entity_type = 'families' then
      update public.families
      set
        name = case when v_request.proposed_data ? 'name' then trim(v_request.proposed_data ->> 'name') else name end,
        description = case when v_request.proposed_data ? 'description' then nullif(trim(v_request.proposed_data ->> 'description'), '') else description end,
        origin_place = case when v_request.proposed_data ? 'origin_place' then nullif(trim(v_request.proposed_data ->> 'origin_place'), '') else origin_place end,
        updated_at = now()
      where id = v_request.record_id;
    elsif v_request.entity_type = 'people' then
      update public.people
      set
        full_name = case when v_request.proposed_data ? 'full_name' then trim(v_request.proposed_data ->> 'full_name') else full_name end,
        gender = case when v_request.proposed_data ? 'gender' then nullif(v_request.proposed_data ->> 'gender', '') else gender end,
        birth_year = case when v_request.proposed_data ? 'birth_year' then nullif(v_request.proposed_data ->> 'birth_year', '')::integer else birth_year end,
        is_deceased = case when v_request.proposed_data ? 'is_deceased' then coalesce((v_request.proposed_data ->> 'is_deceased')::boolean, false) else is_deceased end,
        death_date = case when v_request.proposed_data ? 'death_date' then nullif(v_request.proposed_data ->> 'death_date', '')::date else death_date end,
        description = case when v_request.proposed_data ? 'description' then nullif(trim(v_request.proposed_data ->> 'description'), '') else description end,
        updated_at = now()
      where id = v_request.record_id;
    elsif v_request.entity_type = 'events' then
      update public.events
      set
        event_type = case when v_request.proposed_data ? 'event_type' then v_request.proposed_data ->> 'event_type' else event_type end,
        title = case when v_request.proposed_data ? 'title' then trim(v_request.proposed_data ->> 'title') else title end,
        description = case when v_request.proposed_data ? 'description' then nullif(trim(v_request.proposed_data ->> 'description'), '') else description end,
        event_date = case when v_request.proposed_data ? 'event_date' then nullif(v_request.proposed_data ->> 'event_date', '')::date else event_date end,
        location_name = case when v_request.proposed_data ? 'location_name' then nullif(trim(v_request.proposed_data ->> 'location_name'), '') else location_name end,
        family_id = case when v_request.proposed_data ? 'family_id' then nullif(v_request.proposed_data ->> 'family_id', '')::uuid else family_id end,
        updated_at = now()
      where id = v_request.record_id;
    end if;
  end if;

  update public.content_edit_requests
  set
    status = p_status,
    review_note = nullif(trim(p_review_note), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.review_content_edit_request(uuid, text, text) to authenticated;

-- Reuse the common timestamp trigger for the new tables.
drop trigger if exists set_person_family_memberships_updated_at on public.person_family_memberships;
create trigger set_person_family_memberships_updated_at
before update on public.person_family_memberships
for each row execute procedure private.touch_community_record_updated_at();

drop trigger if exists set_content_edit_requests_updated_at on public.content_edit_requests;
create trigger set_content_edit_requests_updated_at
before update on public.content_edit_requests
for each row execute procedure private.touch_community_record_updated_at();

commit;
