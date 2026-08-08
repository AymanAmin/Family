-- FAMILY REGION PLATFORM - COMPLETE DATABASE SETUP
-- Run this file in Supabase Dashboard > SQL Editor for project rtmdaalabudycimnnena.
-- It is designed to be safe to run again.

begin;

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  role text not null default 'member'
    check (role in ('member', 'verified_member', 'family_moderator', 'content_moderator', 'admin', 'super_admin')),
  account_status text not null default 'active'
    check (account_status in ('pending', 'active', 'suspended', 'disabled')),
  linked_person_id uuid,
  is_primary_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists is_primary_admin boolean not null default false;
alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url) on table public.profiles to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
drop policy if exists "Users can update safe fields on their own profile" on public.profiles;

create policy "Users can read their own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "Users can update safe fields on their own profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create or replace function private.touch_profile_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.touch_profile_updated_at() from public;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute procedure private.touch_profile_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  primary_admin_email_sha256 constant text := '55182deea52079a2f264d88e5a1a4a08c93362468bbb22d792daa777beeb530c';
  is_primary boolean :=
    pg_catalog.encode(
      extensions.digest(pg_catalog.lower(coalesce(new.email, '')), 'sha256'),
      'hex'
    ) = primary_admin_email_sha256;
begin
  insert into public.profiles (
    id, email, display_name, avatar_url, role, account_status, is_primary_admin
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    case when is_primary then 'super_admin' else 'member' end,
    'active',
    is_primary
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    role = case when is_primary then 'super_admin' else public.profiles.role end,
    account_status = case when is_primary then 'active' else public.profiles.account_status end,
    is_primary_admin = is_primary,
    updated_at = pg_catalog.now();

  if is_primary then
    update auth.users
    set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || pg_catalog.jsonb_build_object('app_role', 'super_admin', 'is_primary_admin', true)
    where id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute procedure private.handle_new_auth_user();

insert into public.profiles (id, email, display_name, avatar_url, role, account_status, is_primary_admin)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
  case when pg_catalog.encode(extensions.digest(pg_catalog.lower(coalesce(u.email, '')), 'sha256'), 'hex') = '55182deea52079a2f264d88e5a1a4a08c93362468bbb22d792daa777beeb530c' then 'super_admin' else 'member' end,
  'active',
  pg_catalog.encode(extensions.digest(pg_catalog.lower(coalesce(u.email, '')), 'sha256'), 'hex') = '55182deea52079a2f264d88e5a1a4a08c93362468bbb22d792daa777beeb530c'
from auth.users u
on conflict (id) do update
set
  email = excluded.email,
  display_name = coalesce(public.profiles.display_name, excluded.display_name),
  avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
  role = case when excluded.is_primary_admin then 'super_admin' else public.profiles.role end,
  account_status = case when excluded.is_primary_admin then 'active' else public.profiles.account_status end,
  is_primary_admin = excluded.is_primary_admin,
  updated_at = now();

update auth.users u
set raw_app_meta_data =
  coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || pg_catalog.jsonb_build_object('app_role', 'super_admin', 'is_primary_admin', true)
where pg_catalog.encode(
  extensions.digest(pg_catalog.lower(coalesce(u.email, '')), 'sha256'),
  'hex'
) = '55182deea52079a2f264d88e5a1a4a08c93362468bbb22d792daa777beeb530c';

create unique index if not exists profiles_single_primary_admin_idx
on public.profiles (is_primary_admin)
where is_primary_admin = true;

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 2),
  description text,
  origin_place text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) >= 3),
  family_id uuid references public.families(id) on delete set null,
  gender text check (gender is null or gender in ('male', 'female')),
  birth_year integer check (birth_year is null or birth_year between 1800 and 2100),
  is_deceased boolean not null default false,
  death_date date,
  description text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (death_date is null or is_deceased = true)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null default 'general'
    check (event_type in ('death', 'wedding', 'birth', 'naming', 'graduation', 'general', 'other')),
  title text not null check (char_length(trim(title)) >= 3),
  description text,
  event_date date,
  location_name text,
  family_id uuid references public.families(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists families_name_idx on public.families (name);
create index if not exists families_status_idx on public.families (status);
create index if not exists people_full_name_idx on public.people (full_name);
create index if not exists people_family_id_idx on public.people (family_id);
create index if not exists people_status_idx on public.people (status);
create index if not exists events_date_idx on public.events (event_date desc);
create index if not exists events_status_idx on public.events (status);

alter table public.families enable row level security;
alter table public.people enable row level security;
alter table public.events enable row level security;

revoke all on table public.families from anon, authenticated;
revoke all on table public.people from anon, authenticated;
revoke all on table public.events from anon, authenticated;

grant select on table public.families to anon, authenticated;
grant select on table public.people to anon, authenticated;
grant select on table public.events to anon, authenticated;
grant insert, update on table public.families to authenticated;
grant insert, update on table public.people to authenticated;
grant insert, update on table public.events to authenticated;

drop policy if exists "Public can read approved families" on public.families;
drop policy if exists "Members can read approved or own families" on public.families;
drop policy if exists "Members can submit families" on public.families;
drop policy if exists "Members can edit own pending families" on public.families;
drop policy if exists "Admins can manage families" on public.families;
drop policy if exists "Public can read approved people" on public.people;
drop policy if exists "Members can read approved or own people" on public.people;
drop policy if exists "Members can submit people" on public.people;
drop policy if exists "Members can edit own pending people" on public.people;
drop policy if exists "Admins can manage people" on public.people;
drop policy if exists "Public can read approved events" on public.events;
drop policy if exists "Members can read approved or own events" on public.events;
drop policy if exists "Members can submit events" on public.events;
drop policy if exists "Members can edit own pending events" on public.events;
drop policy if exists "Admins can manage events" on public.events;

create policy "Public can read approved families"
on public.families for select to anon
using (status = 'approved');

create policy "Members can read approved or own families"
on public.families for select to authenticated
using (
  status = 'approved'
  or created_by = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.account_status = 'active' and p.role in ('admin', 'super_admin')
  )
);

create policy "Members can submit families"
on public.families for insert to authenticated
with check (created_by = (select auth.uid()) and status = 'pending');

create policy "Members can edit own pending families"
on public.families for update to authenticated
using (created_by = (select auth.uid()) and status = 'pending')
with check (created_by = (select auth.uid()) and status = 'pending');

create policy "Admins can manage families"
on public.families for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.account_status = 'active' and p.role in ('admin', 'super_admin')
))
with check (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.account_status = 'active' and p.role in ('admin', 'super_admin')
));

create policy "Public can read approved people"
on public.people for select to anon
using (status = 'approved');

create policy "Members can read approved or own people"
on public.people for select to authenticated
using (
  status = 'approved'
  or created_by = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.account_status = 'active' and p.role in ('admin', 'super_admin')
  )
);

create policy "Members can submit people"
on public.people for insert to authenticated
with check (created_by = (select auth.uid()) and status = 'pending');

create policy "Members can edit own pending people"
on public.people for update to authenticated
using (created_by = (select auth.uid()) and status = 'pending')
with check (created_by = (select auth.uid()) and status = 'pending');

create policy "Admins can manage people"
on public.people for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.account_status = 'active' and p.role in ('admin', 'super_admin')
))
with check (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.account_status = 'active' and p.role in ('admin', 'super_admin')
));

create policy "Public can read approved events"
on public.events for select to anon
using (status = 'approved');

create policy "Members can read approved or own events"
on public.events for select to authenticated
using (
  status = 'approved'
  or created_by = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.account_status = 'active' and p.role in ('admin', 'super_admin')
  )
);

create policy "Members can submit events"
on public.events for insert to authenticated
with check (created_by = (select auth.uid()) and status = 'pending');

create policy "Members can edit own pending events"
on public.events for update to authenticated
using (created_by = (select auth.uid()) and status = 'pending')
with check (created_by = (select auth.uid()) and status = 'pending');

create policy "Admins can manage events"
on public.events for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.account_status = 'active' and p.role in ('admin', 'super_admin')
))
with check (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.account_status = 'active' and p.role in ('admin', 'super_admin')
));

create or replace function private.touch_community_record_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.touch_community_record_updated_at() from public;

drop trigger if exists set_families_updated_at on public.families;
create trigger set_families_updated_at before update on public.families
for each row execute procedure private.touch_community_record_updated_at();

drop trigger if exists set_people_updated_at on public.people;
create trigger set_people_updated_at before update on public.people
for each row execute procedure private.touch_community_record_updated_at();

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at before update on public.events
for each row execute procedure private.touch_community_record_updated_at();


-- PHASE 2: PERSON RELATIONSHIPS AND ACCOUNT LINKING

create table if not exists public.person_relationships (
  id uuid primary key default gen_random_uuid(),
  source_person_id uuid not null references public.people(id) on delete cascade,
  target_person_id uuid not null references public.people(id) on delete cascade,
  relation_type text not null
    check (relation_type in ('parent', 'child', 'spouse', 'sibling', 'guardian', 'other')),
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_person_id <> target_person_id)
);

create table if not exists public.account_link_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_linked_person_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_linked_person_id_fkey
      foreign key (linked_person_id)
      references public.people(id)
      on delete set null;
  end if;
end
$$;

create index if not exists person_relationships_source_idx
  on public.person_relationships (source_person_id);
create index if not exists person_relationships_target_idx
  on public.person_relationships (target_person_id);
create index if not exists person_relationships_status_idx
  on public.person_relationships (status);

create unique index if not exists person_relationships_no_duplicate_idx
  on public.person_relationships (source_person_id, target_person_id, relation_type)
  where status in ('pending', 'approved');

create unique index if not exists account_link_requests_one_active_idx
  on public.account_link_requests (user_id)
  where status in ('pending', 'approved');

alter table public.person_relationships enable row level security;
alter table public.account_link_requests enable row level security;

revoke all on table public.person_relationships from anon, authenticated;
revoke all on table public.account_link_requests from anon, authenticated;

grant select on table public.person_relationships to anon, authenticated;
grant insert, update on table public.person_relationships to authenticated;
grant select, insert on table public.account_link_requests to authenticated;

drop policy if exists "Public can read approved relationships"
  on public.person_relationships;
drop policy if exists "Members can read approved or own relationships"
  on public.person_relationships;
drop policy if exists "Members can submit relationships"
  on public.person_relationships;
drop policy if exists "Members can edit own pending relationships"
  on public.person_relationships;
drop policy if exists "Admins can manage relationships"
  on public.person_relationships;
drop policy if exists "Members can read own link requests"
  on public.account_link_requests;
drop policy if exists "Members can submit own link request"
  on public.account_link_requests;

create policy "Public can read approved relationships"
on public.person_relationships
for select
to anon
using (status = 'approved');

create policy "Members can read approved or own relationships"
on public.person_relationships
for select
to authenticated
using (
  status = 'approved'
  or created_by = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

create policy "Members can submit relationships"
on public.person_relationships
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'pending'
);

create policy "Members can edit own pending relationships"
on public.person_relationships
for update
to authenticated
using (
  created_by = (select auth.uid())
  and status = 'pending'
)
with check (
  created_by = (select auth.uid())
  and status = 'pending'
);

create policy "Admins can manage relationships"
on public.person_relationships
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

create policy "Members can read own link requests"
on public.account_link_requests
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

create policy "Members can submit own link request"
on public.account_link_requests
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
);

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
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  ) then
    raise exception 'Not authorized';
  end if;

  select user_id, person_id
  into v_user_id, v_person_id
  from public.account_link_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if v_user_id is null then
    raise exception 'Request not found or already reviewed';
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
        updated_at = now()
    where id = v_user_id;
  end if;
end;
$$;

revoke all on function public.review_account_link_request(uuid, text)
  from public, anon;
grant execute on function public.review_account_link_request(uuid, text)
  to authenticated;

drop trigger if exists set_person_relationships_updated_at
  on public.person_relationships;
create trigger set_person_relationships_updated_at
before update on public.person_relationships
for each row
execute procedure private.touch_community_record_updated_at();

drop trigger if exists set_account_link_requests_updated_at
  on public.account_link_requests;
create trigger set_account_link_requests_updated_at
before update on public.account_link_requests
for each row
execute procedure private.touch_community_record_updated_at();

notify pgrst, 'reload schema';

commit;
notify pgrst, 'reload schema';

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

-- SECURITY HARDENING: edit requests must only be created through request_content_edit().
begin;

revoke insert on table public.content_edit_requests from authenticated;
drop policy if exists "Members can submit edit requests" on public.content_edit_requests;

-- The SECURITY DEFINER RPC remains the only write entry point for owners.
grant execute on function public.request_content_edit(text, uuid, jsonb) to authenticated;

commit;

-- PHASE 4: SMART KINSHIP INFERENCE
-- Derive family relationships from approved parent/child edges instead of storing redundant sibling rows.

begin;

create or replace function public.get_person_kinship(p_person_id uuid)
returns table (
  related_person_id uuid,
  full_name text,
  gender text,
  relation_type text,
  relation_detail text,
  is_inferred boolean,
  shared_parent_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with approved_relationships as (
    select
      r.source_person_id,
      r.target_person_id,
      r.relation_type,
      r.notes
    from public.person_relationships r
    where r.status = 'approved'
  ),
  parent_edges as (
    -- source is parent of target
    select r.source_person_id as parent_id, r.target_person_id as child_id
    from approved_relationships r
    where r.relation_type = 'parent'

    union

    -- source is child of target
    select r.target_person_id as parent_id, r.source_person_id as child_id
    from approved_relationships r
    where r.relation_type = 'child'
  ),
  direct_kin as (
    select
      p.id as related_person_id,
      p.full_name,
      p.gender,
      'parent'::text as relation_type,
      null::text as relation_detail,
      false as is_inferred,
      null::integer as shared_parent_count
    from parent_edges e
    join public.people p on p.id = e.parent_id and p.status = 'approved'
    where e.child_id = p_person_id

    union all

    select
      p.id,
      p.full_name,
      p.gender,
      'child'::text,
      null::text,
      false,
      null::integer
    from parent_edges e
    join public.people p on p.id = e.child_id and p.status = 'approved'
    where e.parent_id = p_person_id

    union all

    select
      p.id,
      p.full_name,
      p.gender,
      'spouse'::text,
      r.notes,
      false,
      null::integer
    from approved_relationships r
    join public.people p
      on p.id = case
        when r.source_person_id = p_person_id then r.target_person_id
        else r.source_person_id
      end
      and p.status = 'approved'
    where r.relation_type = 'spouse'
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)

    union all

    select
      p.id,
      p.full_name,
      p.gender,
      'sibling'::text,
      r.notes,
      false,
      null::integer
    from approved_relationships r
    join public.people p
      on p.id = case
        when r.source_person_id = p_person_id then r.target_person_id
        else r.source_person_id
      end
      and p.status = 'approved'
    where r.relation_type = 'sibling'
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)

    union all

    select
      p.id,
      p.full_name,
      p.gender,
      r.relation_type,
      r.notes,
      false,
      null::integer
    from approved_relationships r
    join public.people p
      on p.id = case
        when r.source_person_id = p_person_id then r.target_person_id
        else r.source_person_id
      end
      and p.status = 'approved'
    where r.relation_type in ('guardian', 'other')
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)
  ),
  my_parents as (
    select e.parent_id
    from parent_edges e
    where e.child_id = p_person_id
  ),
  sibling_counts as (
    select
      e.child_id as sibling_id,
      count(distinct e.parent_id)::integer as shared_parent_count
    from parent_edges e
    join my_parents mp on mp.parent_id = e.parent_id
    where e.child_id <> p_person_id
    group by e.child_id
  ),
  inferred_siblings as (
    select
      p.id as related_person_id,
      p.full_name,
      p.gender,
      'sibling'::text as relation_type,
      case
        when sc.shared_parent_count >= 2 then 'يشترك معك في الأب والأم'
        else 'يشترك معك في أحد الوالدين'
      end as relation_detail,
      true as is_inferred,
      sc.shared_parent_count
    from sibling_counts sc
    join public.people p on p.id = sc.sibling_id and p.status = 'approved'
  ),
  inferred_grandparents as (
    select distinct
      gp.id as related_person_id,
      gp.full_name,
      gp.gender,
      'grandparent'::text as relation_type,
      'مستنتجة من علاقة الوالدين'::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from parent_edges parent_link
    join parent_edges grand_link on grand_link.child_id = parent_link.parent_id
    join public.people gp on gp.id = grand_link.parent_id and gp.status = 'approved'
    where parent_link.child_id = p_person_id
      and gp.id <> p_person_id
  ),
  inferred_grandchildren as (
    select distinct
      gc.id as related_person_id,
      gc.full_name,
      gc.gender,
      'grandchild'::text as relation_type,
      'مستنتجة من علاقة الأبناء'::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from parent_edges child_link
    join parent_edges grandchild_link on grandchild_link.parent_id = child_link.child_id
    join public.people gc on gc.id = grandchild_link.child_id and gc.status = 'approved'
    where child_link.parent_id = p_person_id
      and gc.id <> p_person_id
  ),
  combined as (
    select * from direct_kin
    union all
    select * from inferred_siblings
    union all
    select * from inferred_grandparents
    union all
    select * from inferred_grandchildren
  )
  select distinct on (c.related_person_id, c.relation_type)
    c.related_person_id,
    c.full_name,
    c.gender,
    c.relation_type,
    c.relation_detail,
    c.is_inferred,
    c.shared_parent_count
  from combined c
  where c.related_person_id <> p_person_id
  order by
    c.related_person_id,
    c.relation_type,
    c.is_inferred asc,
    c.shared_parent_count desc nulls last;
$$;

revoke all on function public.get_person_kinship(uuid) from public;
grant execute on function public.get_person_kinship(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- PHASE 5: EXTENDED KINSHIP INFERENCE
-- Derives uncles, aunts, cousins, nephews/nieces and great-grandparents
-- from the approved parent/child graph. Nothing redundant is stored.

begin;

create or replace function public.get_person_kinship(p_person_id uuid)
returns table (
  related_person_id uuid,
  full_name text,
  gender text,
  relation_type text,
  relation_detail text,
  is_inferred boolean,
  shared_parent_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with approved_relationships as (
    select r.source_person_id, r.target_person_id, r.relation_type, r.notes
    from public.person_relationships r
    where r.status = 'approved'
  ),
  parent_edges as (
    select r.source_person_id as parent_id, r.target_person_id as child_id
    from approved_relationships r
    where r.relation_type = 'parent'
    union
    select r.target_person_id as parent_id, r.source_person_id as child_id
    from approved_relationships r
    where r.relation_type = 'child'
  ),
  my_parents as (
    select distinct e.parent_id, p.gender as parent_gender
    from parent_edges e
    join public.people p on p.id = e.parent_id and p.status = 'approved'
    where e.child_id = p_person_id
  ),
  my_children as (
    select distinct e.child_id
    from parent_edges e
    where e.parent_id = p_person_id
  ),
  direct_sibling_ids as (
    select distinct case
      when r.source_person_id = p_person_id then r.target_person_id
      else r.source_person_id
    end as sibling_id
    from approved_relationships r
    where r.relation_type = 'sibling'
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)
  ),
  sibling_counts as (
    select e.child_id as sibling_id,
           count(distinct e.parent_id)::integer as shared_parent_count
    from parent_edges e
    join my_parents mp on mp.parent_id = e.parent_id
    where e.child_id <> p_person_id
    group by e.child_id
  ),
  all_sibling_ids as (
    select sibling_id from direct_sibling_ids
    union
    select sibling_id from sibling_counts
  ),
  direct_kin as (
    select p.id, p.full_name, p.gender,
           'parent'::text as relation_type,
           null::text as relation_detail,
           false as is_inferred,
           null::integer as shared_parent_count
    from my_parents mp
    join public.people p on p.id = mp.parent_id and p.status = 'approved'

    union all

    select p.id, p.full_name, p.gender,
           'child'::text, null::text, false, null::integer
    from my_children mc
    join public.people p on p.id = mc.child_id and p.status = 'approved'

    union all

    select p.id, p.full_name, p.gender,
           'spouse'::text, r.notes, false, null::integer
    from approved_relationships r
    join public.people p on p.id = case
      when r.source_person_id = p_person_id then r.target_person_id
      else r.source_person_id end
      and p.status = 'approved'
    where r.relation_type = 'spouse'
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)

    union all

    select p.id, p.full_name, p.gender,
           'sibling'::text, r.notes, false, null::integer
    from approved_relationships r
    join public.people p on p.id = case
      when r.source_person_id = p_person_id then r.target_person_id
      else r.source_person_id end
      and p.status = 'approved'
    where r.relation_type = 'sibling'
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)

    union all

    select p.id, p.full_name, p.gender,
           r.relation_type, r.notes, false, null::integer
    from approved_relationships r
    join public.people p on p.id = case
      when r.source_person_id = p_person_id then r.target_person_id
      else r.source_person_id end
      and p.status = 'approved'
    where r.relation_type in ('guardian', 'other')
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)
  ),
  inferred_siblings as (
    select p.id, p.full_name, p.gender,
           'sibling'::text as relation_type,
           case when sc.shared_parent_count >= 2
             then 'يشترك معك في الأب والأم'
             else 'يشترك معك في أحد الوالدين' end as relation_detail,
           true as is_inferred,
           sc.shared_parent_count
    from sibling_counts sc
    join public.people p on p.id = sc.sibling_id and p.status = 'approved'
  ),
  grandparents as (
    select distinct gp.id, gp.full_name, gp.gender,
           'grandparent'::text as relation_type,
           case when mp.parent_gender = 'male' then 'من جهة الأب'
                when mp.parent_gender = 'female' then 'من جهة الأم'
                else 'من جهة أحد الوالدين' end as relation_detail,
           true as is_inferred,
           null::integer as shared_parent_count
    from my_parents mp
    join parent_edges ge on ge.child_id = mp.parent_id
    join public.people gp on gp.id = ge.parent_id and gp.status = 'approved'
    where gp.id <> p_person_id
  ),
  grandchildren as (
    select distinct gc.id, gc.full_name, gc.gender,
           'grandchild'::text as relation_type,
           'مستنتجة من علاقة الأبناء'::text as relation_detail,
           true as is_inferred,
           null::integer as shared_parent_count
    from my_children mc
    join parent_edges ge on ge.parent_id = mc.child_id
    join public.people gc on gc.id = ge.child_id and gc.status = 'approved'
    where gc.id <> p_person_id
  ),
  parent_grandparents as (
    select distinct mp.parent_id as my_parent_id,
           mp.parent_gender,
           ge.parent_id as grandparent_id
    from my_parents mp
    join parent_edges ge on ge.child_id = mp.parent_id
  ),
  parent_siblings_raw as (
    select distinct pg.my_parent_id,
           pg.parent_gender,
           se.child_id as relative_id
    from parent_grandparents pg
    join parent_edges se on se.parent_id = pg.grandparent_id
    where se.child_id <> pg.my_parent_id
      and se.child_id <> p_person_id
  ),
  parent_siblings as (
    select ps.my_parent_id, ps.parent_gender, ps.relative_id,
           rp.gender as relative_gender,
           rp.full_name as relative_name
    from parent_siblings_raw ps
    join public.people rp on rp.id = ps.relative_id and rp.status = 'approved'
  ),
  inferred_uncles_aunts as (
    select distinct rp.id, rp.full_name, rp.gender,
      case
        when ps.parent_gender = 'male' and rp.gender = 'male' then 'paternal_uncle'
        when ps.parent_gender = 'male' and rp.gender = 'female' then 'paternal_aunt'
        when ps.parent_gender = 'female' and rp.gender = 'male' then 'maternal_uncle'
        when ps.parent_gender = 'female' and rp.gender = 'female' then 'maternal_aunt'
        when ps.parent_gender = 'male' then 'paternal_parent_sibling'
        when ps.parent_gender = 'female' then 'maternal_parent_sibling'
        else 'parent_sibling'
      end::text as relation_type,
      case when ps.parent_gender = 'male' then 'من جهة الأب'
           when ps.parent_gender = 'female' then 'من جهة الأم'
           else 'من جهة أحد الوالدين' end::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from parent_siblings ps
    join public.people rp on rp.id = ps.relative_id and rp.status = 'approved'
  ),
  inferred_cousins as (
    select distinct cp.id, cp.full_name, cp.gender,
      case
        when ps.parent_gender = 'male' and ps.relative_gender = 'male' then 'paternal_uncle_child'
        when ps.parent_gender = 'male' and ps.relative_gender = 'female' then 'paternal_aunt_child'
        when ps.parent_gender = 'female' and ps.relative_gender = 'male' then 'maternal_uncle_child'
        when ps.parent_gender = 'female' and ps.relative_gender = 'female' then 'maternal_aunt_child'
        else 'cousin'
      end::text as relation_type,
      ('عن طريق ' || ps.relative_name)::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from parent_siblings ps
    join parent_edges ce on ce.parent_id = ps.relative_id
    join public.people cp on cp.id = ce.child_id and cp.status = 'approved'
    where cp.id <> p_person_id
  ),
  inferred_nephews_nieces as (
    select distinct np.id, np.full_name, np.gender,
      case when np.gender = 'female' then 'niece' else 'nephew' end::text as relation_type,
      ('من أبناء ' || sp.full_name)::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from all_sibling_ids si
    join public.people sp on sp.id = si.sibling_id and sp.status = 'approved'
    join parent_edges pe on pe.parent_id = si.sibling_id
    join public.people np on np.id = pe.child_id and np.status = 'approved'
    where np.id <> p_person_id
  ),
  great_grandparents as (
    select distinct ggp.id, ggp.full_name, ggp.gender,
      'great_grandparent'::text as relation_type,
      'من الجيل الأعلى في شجرة النسب'::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from my_parents mp
    join parent_edges e1 on e1.child_id = mp.parent_id
    join parent_edges e2 on e2.child_id = e1.parent_id
    join public.people ggp on ggp.id = e2.parent_id and ggp.status = 'approved'
    where ggp.id <> p_person_id
  ),
  great_grandchildren as (
    select distinct ggc.id, ggc.full_name, ggc.gender,
      'great_grandchild'::text as relation_type,
      'من الجيل الأدنى في شجرة النسب'::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from my_children mc
    join parent_edges e1 on e1.parent_id = mc.child_id
    join parent_edges e2 on e2.parent_id = e1.child_id
    join public.people ggc on ggc.id = e2.child_id and ggc.status = 'approved'
    where ggc.id <> p_person_id
  ),
  combined as (
    select * from direct_kin
    union all select * from inferred_siblings
    union all select * from grandparents
    union all select * from grandchildren
    union all select * from inferred_uncles_aunts
    union all select * from inferred_cousins
    union all select * from inferred_nephews_nieces
    union all select * from great_grandparents
    union all select * from great_grandchildren
  )
  select distinct on (c.id, c.relation_type)
    c.id as related_person_id,
    c.full_name,
    c.gender,
    c.relation_type,
    c.relation_detail,
    c.is_inferred,
    c.shared_parent_count
  from combined c
  where c.id <> p_person_id
  order by c.id, c.relation_type, c.is_inferred asc,
           c.shared_parent_count desc nulls last;
$$;

revoke all on function public.get_person_kinship(uuid) from public;
grant execute on function public.get_person_kinship(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- INCLUDED MIGRATION: 202608070009_extended_parent_sibling_kinship.sql
-- PHASE 6: ROBUST EXTENDED KINSHIP
-- Infers uncles/aunts/cousins from either direct sibling links of a parent
-- OR shared parents/grandparents. Also derives nephews/nieces and great-grandparents.

begin;

create or replace function public.get_person_extended_kinship(p_person_id uuid)
returns table (
  related_person_id uuid,
  full_name text,
  gender text,
  relation_type text,
  relation_detail text,
  is_inferred boolean,
  shared_parent_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with approved_relationships as (
    select r.source_person_id, r.target_person_id, r.relation_type, r.notes
    from public.person_relationships r
    where r.status = 'approved'
  ),
  parent_edges as (
    select r.source_person_id as parent_id, r.target_person_id as child_id
    from approved_relationships r
    where r.relation_type = 'parent'
    union
    select r.target_person_id as parent_id, r.source_person_id as child_id
    from approved_relationships r
    where r.relation_type = 'child'
  ),
  my_parents as (
    select distinct e.parent_id, p.gender as parent_gender
    from parent_edges e
    join public.people p on p.id = e.parent_id and p.status = 'approved'
    where e.child_id = p_person_id
  ),
  direct_parent_siblings as (
    select distinct
      mp.parent_id as my_parent_id,
      mp.parent_gender,
      case
        when r.source_person_id = mp.parent_id then r.target_person_id
        else r.source_person_id
      end as relative_id
    from my_parents mp
    join approved_relationships r
      on r.relation_type = 'sibling'
     and (r.source_person_id = mp.parent_id or r.target_person_id = mp.parent_id)
  ),
  shared_parent_siblings as (
    select distinct
      mp.parent_id as my_parent_id,
      mp.parent_gender,
      sibling_edge.child_id as relative_id
    from my_parents mp
    join parent_edges grandparent_edge on grandparent_edge.child_id = mp.parent_id
    join parent_edges sibling_edge on sibling_edge.parent_id = grandparent_edge.parent_id
    where sibling_edge.child_id <> mp.parent_id
  ),
  parent_sibling_ids as (
    select * from direct_parent_siblings
    union
    select * from shared_parent_siblings
  ),
  parent_siblings as (
    select distinct
      psi.my_parent_id,
      psi.parent_gender,
      psi.relative_id,
      rp.gender as relative_gender,
      rp.full_name as relative_name
    from parent_sibling_ids psi
    join public.people rp on rp.id = psi.relative_id and rp.status = 'approved'
    where psi.relative_id <> p_person_id
  ),
  uncles_aunts as (
    select distinct
      rp.id,
      rp.full_name,
      rp.gender,
      case
        when ps.parent_gender = 'male' and rp.gender = 'male' then 'paternal_uncle'
        when ps.parent_gender = 'male' and rp.gender = 'female' then 'paternal_aunt'
        when ps.parent_gender = 'female' and rp.gender = 'male' then 'maternal_uncle'
        when ps.parent_gender = 'female' and rp.gender = 'female' then 'maternal_aunt'
        when ps.parent_gender = 'male' then 'paternal_parent_sibling'
        when ps.parent_gender = 'female' then 'maternal_parent_sibling'
        else 'parent_sibling'
      end::text as relation_type,
      case
        when ps.parent_gender = 'male' then 'مستنتجة من صلة الأب بإخوته'
        when ps.parent_gender = 'female' then 'مستنتجة من صلة الأم بإخوتها'
        else 'مستنتجة من صلة أحد الوالدين بإخوته'
      end::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from parent_siblings ps
    join public.people rp on rp.id = ps.relative_id and rp.status = 'approved'
  ),
  cousins as (
    select distinct
      cp.id,
      cp.full_name,
      cp.gender,
      case
        when ps.parent_gender = 'male' and ps.relative_gender = 'male' then 'paternal_uncle_child'
        when ps.parent_gender = 'male' and ps.relative_gender = 'female' then 'paternal_aunt_child'
        when ps.parent_gender = 'female' and ps.relative_gender = 'male' then 'maternal_uncle_child'
        when ps.parent_gender = 'female' and ps.relative_gender = 'female' then 'maternal_aunt_child'
        else 'cousin'
      end::text as relation_type,
      ('عن طريق ' || ps.relative_name)::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from parent_siblings ps
    join parent_edges child_edge on child_edge.parent_id = ps.relative_id
    join public.people cp on cp.id = child_edge.child_id and cp.status = 'approved'
    where cp.id <> p_person_id
  ),
  my_direct_siblings as (
    select distinct case
      when r.source_person_id = p_person_id then r.target_person_id
      else r.source_person_id
    end as sibling_id
    from approved_relationships r
    where r.relation_type = 'sibling'
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)
  ),
  my_shared_siblings as (
    select distinct e.child_id as sibling_id
    from parent_edges e
    join my_parents mp on mp.parent_id = e.parent_id
    where e.child_id <> p_person_id
  ),
  my_siblings as (
    select sibling_id from my_direct_siblings
    union
    select sibling_id from my_shared_siblings
  ),
  nephews_nieces as (
    select distinct
      np.id,
      np.full_name,
      np.gender,
      case when np.gender = 'female' then 'niece' else 'nephew' end::text as relation_type,
      ('من أبناء ' || sp.full_name)::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from my_siblings ms
    join public.people sp on sp.id = ms.sibling_id and sp.status = 'approved'
    join parent_edges pe on pe.parent_id = ms.sibling_id
    join public.people np on np.id = pe.child_id and np.status = 'approved'
    where np.id <> p_person_id
  ),
  great_grandparents as (
    select distinct
      ggp.id,
      ggp.full_name,
      ggp.gender,
      'great_grandparent'::text as relation_type,
      'من الجيل الأعلى في شجرة النسب'::text as relation_detail,
      true as is_inferred,
      null::integer as shared_parent_count
    from my_parents mp
    join parent_edges grandparent_edge on grandparent_edge.child_id = mp.parent_id
    join parent_edges great_edge on great_edge.child_id = grandparent_edge.parent_id
    join public.people ggp on ggp.id = great_edge.parent_id and ggp.status = 'approved'
    where ggp.id <> p_person_id
  ),
  combined as (
    select * from uncles_aunts
    union all select * from cousins
    union all select * from nephews_nieces
    union all select * from great_grandparents
  )
  select distinct on (c.id, c.relation_type)
    c.id as related_person_id,
    c.full_name,
    c.gender,
    c.relation_type,
    c.relation_detail,
    c.is_inferred,
    c.shared_parent_count
  from combined c
  where c.id <> p_person_id
  order by c.id, c.relation_type;
$$;

revoke all on function public.get_person_extended_kinship(uuid) from public;
grant execute on function public.get_person_extended_kinship(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- INCLUDED MIGRATION: 202608070010_public_scale_performance.sql
-- PHASE 6: PUBLIC-SCALE PERFORMANCE FOUNDATION
-- Fast public search, relationship traversal and O(1) homepage statistics.

begin;

create extension if not exists pg_trgm with schema extensions;

-- Trigram indexes keep ILIKE '%term%' responsive as the public directory grows.
create index if not exists people_approved_full_name_trgm_idx
  on public.people using gin (full_name extensions.gin_trgm_ops)
  where status = 'approved';

create index if not exists families_approved_name_trgm_idx
  on public.families using gin (name extensions.gin_trgm_ops)
  where status = 'approved';

-- Common public-list filters and sort paths.
create index if not exists people_approved_created_at_idx
  on public.people (created_at desc)
  where status = 'approved';

create index if not exists families_approved_created_at_idx
  on public.families (created_at desc)
  where status = 'approved';

create index if not exists events_approved_event_date_idx
  on public.events (event_date desc nulls last)
  where status = 'approved';

create index if not exists people_approved_family_idx
  on public.people (family_id, created_at desc)
  where status = 'approved';

create index if not exists family_memberships_approved_family_idx
  on public.person_family_memberships (family_id, is_primary desc, created_at desc)
  where status = 'approved';

create index if not exists family_memberships_approved_person_idx
  on public.person_family_memberships (person_id, is_primary desc)
  where status = 'approved';

-- Kinship traversal indexes. These are critical because inferred relationships walk both directions.
create index if not exists person_relationships_approved_source_idx
  on public.person_relationships (source_person_id, relation_type, target_person_id)
  where status = 'approved';

create index if not exists person_relationships_approved_target_idx
  on public.person_relationships (target_person_id, relation_type, source_person_id)
  where status = 'approved';

create index if not exists person_relationships_pending_created_idx
  on public.person_relationships (created_at)
  where status = 'pending';

create index if not exists account_link_requests_user_status_idx
  on public.account_link_requests (user_id, status, created_at desc);

create index if not exists content_edit_requests_pending_created_idx
  on public.content_edit_requests (created_at)
  where status = 'pending';

-- Public counters are maintained incrementally so every visitor does not execute COUNT(*) scans.
create table if not exists public.platform_stats (
  id smallint primary key default 1 check (id = 1),
  approved_families bigint not null default 0,
  approved_people bigint not null default 0,
  approved_events bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.platform_stats (id, approved_families, approved_people, approved_events, updated_at)
values (
  1,
  (select count(*) from public.families where status = 'approved'),
  (select count(*) from public.people where status = 'approved'),
  (select count(*) from public.events where status = 'approved'),
  now()
)
on conflict (id) do update set
  approved_families = excluded.approved_families,
  approved_people = excluded.approved_people,
  approved_events = excluded.approved_events,
  updated_at = now();

alter table public.platform_stats enable row level security;
revoke all on table public.platform_stats from anon, authenticated;
grant select on table public.platform_stats to anon, authenticated;

drop policy if exists "Public can read platform stats" on public.platform_stats;
create policy "Public can read platform stats"
  on public.platform_stats
  for select
  to anon, authenticated
  using (true);

create or replace function public.refresh_platform_stats_delta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_approved boolean := false;
  new_approved boolean := false;
  delta bigint := 0;
begin
  if tg_op <> 'INSERT' then
    old_approved := (old.status = 'approved');
  end if;
  if tg_op <> 'DELETE' then
    new_approved := (new.status = 'approved');
  end if;

  delta := (case when new_approved then 1 else 0 end) - (case when old_approved then 1 else 0 end);

  if delta <> 0 then
    if tg_table_name = 'families' then
      update public.platform_stats
        set approved_families = greatest(0, approved_families + delta), updated_at = now()
        where id = 1;
    elsif tg_table_name = 'people' then
      update public.platform_stats
        set approved_people = greatest(0, approved_people + delta), updated_at = now()
        where id = 1;
    elsif tg_table_name = 'events' then
      update public.platform_stats
        set approved_events = greatest(0, approved_events + delta), updated_at = now()
        where id = 1;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_platform_stats_families on public.families;
create trigger trg_platform_stats_families
after insert or delete or update of status on public.families
for each row execute function public.refresh_platform_stats_delta();

drop trigger if exists trg_platform_stats_people on public.people;
create trigger trg_platform_stats_people
after insert or delete or update of status on public.people
for each row execute function public.refresh_platform_stats_delta();

drop trigger if exists trg_platform_stats_events on public.events;
create trigger trg_platform_stats_events
after insert or delete or update of status on public.events
for each row execute function public.refresh_platform_stats_delta();

create or replace function public.get_public_platform_stats()
returns table (
  approved_families bigint,
  approved_people bigint,
  approved_events bigint,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.approved_families, s.approved_people, s.approved_events, s.updated_at
  from public.platform_stats s
  where s.id = 1;
$$;

revoke all on function public.get_public_platform_stats() from public;
grant execute on function public.get_public_platform_stats() to anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- INCLUDED MIGRATION: 202608070011_smart_duplicate_person_search.sql
-- PHASE 7: SMART DUPLICATE-PERSON SEARCH
-- Arabic-name normalization + trigram similarity for duplicate prevention while adding people.

begin;

create extension if not exists pg_trgm with schema extensions;

create or replace function public.normalize_arabic_name(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(
    regexp_replace(
      translate(
        regexp_replace(coalesce(p_value, ''), '[\u064B-\u065F\u0670\u06D6-\u06ED]', '', 'g'),
        'أإآٱىئؤ',
        'ااااييو'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

create index if not exists people_approved_normalized_name_trgm_idx
  on public.people using gin ((public.normalize_arabic_name(full_name)) extensions.gin_trgm_ops)
  where status = 'approved';

create or replace function public.find_similar_people(
  p_query text,
  p_limit integer default 6
)
returns table (
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
security invoker
set search_path = public, extensions
as $$
declare
  v_query text := public.normalize_arabic_name(p_query);
  v_limit integer := greatest(1, least(coalesce(p_limit, 6), 10));
begin
  if char_length(v_query) < 3 then
    return;
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.gender,
    p.birth_year,
    p.family_id,
    f.name as family_name,
    p.status,
    greatest(
      similarity(public.normalize_arabic_name(p.full_name), v_query),
      case
        when public.normalize_arabic_name(p.full_name) = v_query then 1.0
        when public.normalize_arabic_name(p.full_name) ilike '%' || v_query || '%' then 0.92
        else 0.0
      end
    )::real as match_score
  from public.people p
  left join public.families f on f.id = p.family_id
  where
    p.status in ('approved', 'pending')
    and (
      public.normalize_arabic_name(p.full_name) ilike '%' || v_query || '%'
      or public.normalize_arabic_name(p.full_name) % v_query
    )
  order by
    (public.normalize_arabic_name(p.full_name) = v_query) desc,
    match_score desc,
    p.full_name asc
  limit v_limit;
end;
$$;

revoke all on function public.find_similar_people(text, integer) from public;
grant execute on function public.find_similar_people(text, integer) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- INCLUDED MIGRATION: 202608070012_kinship_path_explorer.sql
-- PHASE 8: KINSHIP PATH EXPLORER
-- Shortest approved relationship path between two people, capped for predictable public performance.

begin;

create or replace function public.get_kinship_path(
  p_from_person_id uuid,
  p_to_person_id uuid,
  p_max_depth integer default 6
)
returns table (
  step_no integer,
  person_id uuid,
  full_name text,
  gender text,
  relation_type text,
  is_inferred boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive
  approved_relationships as (
    select r.source_person_id, r.target_person_id, r.relation_type
    from public.person_relationships r
    where r.status = 'approved'
      and r.relation_type in ('parent', 'child', 'spouse', 'sibling')
  ),
  parent_edges as (
    select r.source_person_id as parent_id, r.target_person_id as child_id
    from approved_relationships r
    where r.relation_type = 'parent'
    union
    select r.target_person_id as parent_id, r.source_person_id as child_id
    from approved_relationships r
    where r.relation_type = 'child'
  ),
  sibling_edges as (
    select r.source_person_id as from_id, r.target_person_id as to_id, false as is_inferred
    from approved_relationships r
    where r.relation_type = 'sibling'
    union
    select r.target_person_id, r.source_person_id, false
    from approved_relationships r
    where r.relation_type = 'sibling'
    union
    select distinct a.child_id, b.child_id, true
    from parent_edges a
    join parent_edges b
      on b.parent_id = a.parent_id
     and b.child_id <> a.child_id
  ),
  graph as (
    select e.parent_id as from_id, e.child_id as to_id, 'child'::text as relation_type, false as is_inferred
    from parent_edges e
    union all
    select e.child_id, e.parent_id, 'parent'::text, false
    from parent_edges e
    union all
    select r.source_person_id, r.target_person_id, 'spouse'::text, false
    from approved_relationships r
    where r.relation_type = 'spouse'
    union all
    select r.target_person_id, r.source_person_id, 'spouse'::text, false
    from approved_relationships r
    where r.relation_type = 'spouse'
    union all
    select s.from_id, s.to_id, 'sibling'::text, s.is_inferred
    from sibling_edges s
  ),
  walk as (
    select
      0::integer as depth,
      p.id as current_id,
      array[p.id]::uuid[] as path_ids,
      array['self'::text] as relation_types,
      array[false]::boolean[] as inferred_flags
    from public.people p
    where p.id = p_from_person_id
      and p.status = 'approved'

    union all

    select
      w.depth + 1,
      g.to_id,
      w.path_ids || g.to_id,
      w.relation_types || g.relation_type,
      w.inferred_flags || g.is_inferred
    from walk w
    join graph g on g.from_id = w.current_id
    join public.people target_person on target_person.id = g.to_id and target_person.status = 'approved'
    where w.depth < least(greatest(coalesce(p_max_depth, 6), 1), 6)
      and not (g.to_id = any(w.path_ids))
  ),
  best as (
    select w.*
    from walk w
    where w.current_id = p_to_person_id
    order by w.depth, cardinality(w.path_ids)
    limit 1
  ),
  expanded as (
    select
      (u.ordinality - 1)::integer as step_no,
      u.pid as person_id,
      b.relation_types[u.ordinality] as relation_type,
      b.inferred_flags[u.ordinality] as is_inferred
    from best b,
    unnest(b.path_ids) with ordinality as u(pid, ordinality)
  )
  select
    e.step_no,
    p.id,
    p.full_name,
    p.gender,
    e.relation_type,
    e.is_inferred
  from expanded e
  join public.people p on p.id = e.person_id and p.status = 'approved'
  order by e.step_no;
$$;

revoke all on function public.get_kinship_path(uuid, uuid, integer) from public;
grant execute on function public.get_kinship_path(uuid, uuid, integer) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- INCLUDED MIGRATION: 202608070013_admin_role_management_and_direct_approval.sql
-- PHASE 9: PROTECTED ADMIN MANAGEMENT + DIRECT ADMIN PUBLISHING
-- Primary super admin can switch confirmed registered users between member/admin.
-- Ordinary admins can publish their own additions immediately and moderate requests,
-- but cannot grant or revoke administrator access.

begin;

create schema if not exists private;

-- Audit role changes outside the exposed public schema.
create table if not exists private.admin_role_audit (
  id bigint generated always as identity primary key,
  target_user_id uuid not null,
  previous_role text not null,
  new_role text not null,
  changed_by uuid not null,
  changed_at timestamptz not null default now()
);

revoke all on table private.admin_role_audit from public, anon, authenticated;

create index if not exists admin_role_audit_target_changed_idx
  on private.admin_role_audit (target_user_id, changed_at desc);

-- Only the protected primary administrator can read the temporary user-management list.
create or replace function public.list_registered_users_for_role_management(
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text,
  is_primary_admin boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role = 'super_admin'
      and p.is_primary_admin = true
  ) then
    raise exception 'Not authorized to manage administrators';
  end if;

  return query
  select
    p.id,
    p.email,
    p.display_name,
    p.role,
    p.is_primary_admin,
    p.created_at,
    u.last_sign_in_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.account_status = 'active'
    and u.email_confirmed_at is not null
    and (
      v_search is null
      or coalesce(p.display_name, '') ilike '%' || v_search || '%'
      or coalesce(p.email, '') ilike '%' || v_search || '%'
    )
  order by p.is_primary_admin desc, p.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.list_registered_users_for_role_management(text, integer, integer)
  from public, anon;
grant execute on function public.list_registered_users_for_role_management(text, integer, integer)
  to authenticated;

-- Temporary role switcher: only member/admin until the full RBAC screen is implemented.
create or replace function public.set_basic_user_role(
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_role text;
  v_is_primary boolean;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role = 'super_admin'
      and p.is_primary_admin = true
  ) then
    raise exception 'Only the primary administrator can change administrator access';
  end if;

  if p_role not in ('member', 'admin') then
    raise exception 'Only member/admin roles are available in this temporary role screen';
  end if;

  select p.role, p.is_primary_admin
  into v_previous_role, v_is_primary
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = p_user_id
    and p.account_status = 'active'
    and u.email_confirmed_at is not null
  for update;

  if v_previous_role is null then
    raise exception 'Registered user not found';
  end if;

  if v_is_primary then
    raise exception 'The primary administrator role is protected';
  end if;

  if v_previous_role = p_role then
    return;
  end if;

  update public.profiles
  set role = p_role,
      updated_at = now()
  where id = p_user_id;

  -- Keep authorization metadata server-controlled and synchronized.
  update auth.users
  set raw_app_meta_data =
    (coalesce(raw_app_meta_data, '{}'::jsonb) - 'is_primary_admin')
    || jsonb_build_object('app_role', p_role)
  where id = p_user_id;

  insert into private.admin_role_audit(target_user_id, previous_role, new_role, changed_by)
  values (p_user_id, v_previous_role, p_role, auth.uid());
end;
$$;

revoke all on function public.set_basic_user_role(uuid, text)
  from public, anon;
grant execute on function public.set_basic_user_role(uuid, text)
  to authenticated;

-- Administrators may INSERT already-approved public records they create themselves.
-- Members keep the existing pending-only policies from earlier migrations.
drop policy if exists "Admins can directly publish families" on public.families;
create policy "Admins can directly publish families"
on public.families for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'approved'
  and approved_by = (select auth.uid())
  and approved_at is not null
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

drop policy if exists "Admins can directly publish people" on public.people;
create policy "Admins can directly publish people"
on public.people for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'approved'
  and approved_by = (select auth.uid())
  and approved_at is not null
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

drop policy if exists "Admins can directly publish events" on public.events;
create policy "Admins can directly publish events"
on public.events for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'approved'
  and approved_by = (select auth.uid())
  and approved_at is not null
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

drop policy if exists "Admins can directly publish relationships" on public.person_relationships;
create policy "Admins can directly publish relationships"
on public.person_relationships for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'approved'
  and approved_by = (select auth.uid())
  and approved_at is not null
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

drop policy if exists "Admins can directly publish memberships" on public.person_family_memberships;
create policy "Admins can directly publish memberships"
on public.person_family_memberships for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'approved'
  and approved_by = (select auth.uid())
  and approved_at is not null
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

notify pgrst, 'reload schema';

commit;

-- INCLUDED MIGRATION: 202608070014_person_death_date_integrity.sql
-- PHASE 10: PERSON DEATH STATUS INTEGRITY
-- New/updated deceased records must include a death date. Existing historical
-- rows without a date remain readable until they are edited and completed.

begin;

alter table public.people
  drop constraint if exists people_deceased_requires_death_date;

alter table public.people
  add constraint people_deceased_requires_death_date
  check (is_deceased = false or death_date is not null)
  not valid;

comment on constraint people_deceased_requires_death_date on public.people is
  'A deceased person must have a death date. NOT VALID preserves legacy rows while enforcing future writes.';

commit;

-- INCLUDED MIGRATION: 202608070015_paginated_moderation_feed.sql
-- PHASE 11: PAGINATED MODERATION FEED
-- One protected server-side feed replaces loading every pending row from five tables.

begin;

create index if not exists families_pending_moderation_idx
  on public.families (created_at, id)
  where status = 'pending';

create index if not exists people_pending_moderation_idx
  on public.people (created_at, id)
  where status = 'pending';

create index if not exists events_pending_moderation_idx
  on public.events (created_at, id)
  where status = 'pending';

create index if not exists person_relationships_pending_moderation_idx
  on public.person_relationships (created_at, id)
  where status = 'pending';

create index if not exists account_link_requests_pending_moderation_idx
  on public.account_link_requests (created_at, id)
  where status = 'pending';

create or replace function public.list_pending_moderation_feed(
  p_limit integer default 16,
  p_offset integer default 0
)
returns table (
  id uuid,
  table_name text,
  title text,
  subtitle text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 16), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  ) then
    raise exception 'Not authorized to review pending content';
  end if;

  return query
  with pending as (
    select
      f.id,
      'families'::text as table_name,
      f.name::text as title,
      coalesce(nullif(f.origin_place, ''), 'عائلة جديدة')::text as subtitle,
      f.created_at
    from public.families f
    where f.status = 'pending'

    union all

    select
      p.id,
      'people'::text,
      p.full_name::text,
      coalesce(nullif(f.name, ''), 'شخص جديد')::text,
      p.created_at
    from public.people p
    left join public.families f on f.id = p.family_id
    where p.status = 'pending'

    union all

    select
      e.id,
      'events'::text,
      e.title::text,
      case e.event_type
        when 'death' then 'وفاة وعزاء'
        when 'wedding' then 'زواج'
        when 'birth' then 'مولود'
        when 'naming' then 'سماية'
        when 'graduation' then 'تخرج ونجاح'
        when 'general' then 'مناسبة عامة'
        else coalesce(nullif(e.event_type, ''), 'مناسبة')
      end::text,
      e.created_at
    from public.events e
    where e.status = 'pending'

    union all

    select
      r.id,
      'person_relationships'::text,
      (coalesce(s.full_name, 'شخص أول') || ' — ' || coalesce(t.full_name, 'شخص ثانٍ'))::text,
      case r.relation_type
        when 'parent' then 'والد أو والدة'
        when 'child' then 'ابن أو ابنة'
        when 'spouse' then 'زوج أو زوجة'
        when 'sibling' then 'أخ أو أخت'
        when 'guardian' then 'ولي أو وصي'
        else 'صلة أخرى'
      end::text,
      r.created_at
    from public.person_relationships r
    left join public.people s on s.id = r.source_person_id
    left join public.people t on t.id = r.target_person_id
    where r.status = 'pending'

    union all

    select
      l.id,
      'account_link_requests'::text,
      coalesce(p.full_name, 'طلب ربط حساب')::text,
      'طلب إثبات أن الحساب يعود لهذا الشخص'::text,
      l.created_at
    from public.account_link_requests l
    left join public.people p on p.id = l.person_id
    where l.status = 'pending'
  )
  select
    q.id,
    q.table_name,
    q.title,
    q.subtitle,
    q.created_at
  from pending q
  order by q.created_at asc, q.id
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.list_pending_moderation_feed(integer, integer) from public, anon;
grant execute on function public.list_pending_moderation_feed(integer, integer) to authenticated;

notify pgrst, 'reload schema';

commit;

-- INCLUDED MIGRATION: 202608070016_paginated_secondary_moderation.sql
-- PHASE 12: PAGINATED EDIT + MEMBERSHIP MODERATION
-- Keeps the secondary admin queue bounded as public usage grows.

begin;

create index if not exists content_edit_requests_pending_moderation_idx
  on public.content_edit_requests (created_at, id)
  where status = 'pending';

create index if not exists person_family_memberships_pending_created_idx
  on public.person_family_memberships (created_at, id)
  where status = 'pending';

create or replace function public.list_pending_secondary_moderation_feed(
  p_limit integer default 13,
  p_offset integer default 0
)
returns table (
  id uuid,
  request_type text,
  title text,
  subtitle text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 13), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  ) then
    raise exception 'Not authorized to review pending changes';
  end if;

  return query
  with pending as (
    select
      e.id,
      'edit'::text as request_type,
      case e.entity_type
        when 'families' then 'تعديل بيانات عائلة'
        when 'people' then 'تعديل بيانات شخص'
        when 'events' then 'تعديل مناسبة'
        else 'تعديل سجل'
      end::text as title,
      coalesce(
        nullif(e.proposed_data ->> 'full_name', ''),
        nullif(e.proposed_data ->> 'name', ''),
        nullif(e.proposed_data ->> 'title', ''),
        nullif(e.proposed_data ->> 'origin_place', ''),
        nullif(e.proposed_data ->> 'location_name', ''),
        'راجع البيانات المقترحة ثم اعتمد أو ارفض.'
      )::text as subtitle,
      e.created_at
    from public.content_edit_requests e
    where e.status = 'pending'

    union all

    select
      m.id,
      'membership'::text,
      (coalesce(p.full_name, 'شخص') || ' ← ' || coalesce(f.name, 'عائلة'))::text,
      (
        case m.membership_type
          when 'birth' then 'بالنسب / عائلة الأصل'
          when 'marriage' then 'بالزواج'
          when 'paternal' then 'من جهة الأب'
          when 'maternal' then 'من جهة الأم'
          when 'guardian' then 'وصاية أو كفالة'
          else 'انتماء آخر'
        end
        || case when m.is_primary then ' · عائلة أساسية' else '' end
        || case when nullif(m.notes, '') is not null then ' · ' || m.notes else '' end
      )::text,
      m.created_at
    from public.person_family_memberships m
    left join public.people p on p.id = m.person_id
    left join public.families f on f.id = m.family_id
    where m.status = 'pending'
  )
  select q.id, q.request_type, q.title, q.subtitle, q.created_at
  from pending q
  order by q.created_at asc, q.id
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.list_pending_secondary_moderation_feed(integer, integer) from public, anon;
grant execute on function public.list_pending_secondary_moderation_feed(integer, integer) to authenticated;

notify pgrst, 'reload schema';

commit;

-- INCLUDED MIGRATION: 202608070017_full_role_scopes_and_moderation.sql
-- PHASE 13: FULL ROLE FOUNDATIONS + SCOPED MODERATION
-- Roles become real database permissions, not UI labels.
-- - linked member => verified_member automatically
-- - family_moderator => limited to explicitly assigned families
-- - content_moderator => public events/content only
-- - admin/super_admin => broad moderation; direct publishing remains admin-only
-- - primary super admin alone manages roles/scopes

begin;

create schema if not exists private;
create extension if not exists pg_trgm with schema extensions;

create table if not exists private.admin_role_audit (
  id bigint generated always as identity primary key,
  target_user_id uuid not null,
  previous_role text not null,
  new_role text not null,
  changed_by uuid not null,
  changed_at timestamptz not null default now()
);
revoke all on table private.admin_role_audit from public, anon, authenticated;

create table if not exists public.family_moderator_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, family_id)
);

create index if not exists family_moderator_assignments_user_idx
  on public.family_moderator_assignments (user_id, family_id);
create index if not exists family_moderator_assignments_family_idx
  on public.family_moderator_assignments (family_id, user_id);
create index if not exists profiles_display_name_trgm_idx
  on public.profiles using gin (display_name extensions.gin_trgm_ops)
  where account_status = 'active';
create index if not exists profiles_email_trgm_idx
  on public.profiles using gin (email extensions.gin_trgm_ops)
  where account_status = 'active';

alter table public.family_moderator_assignments enable row level security;
revoke all on table public.family_moderator_assignments from anon, authenticated;
grant select on table public.family_moderator_assignments to authenticated;

drop policy if exists "Users can read own family moderator scopes" on public.family_moderator_assignments;
create policy "Users can read own family moderator scopes"
on public.family_moderator_assignments for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role = 'super_admin'
      and p.is_primary_admin = true
  )
);

create or replace function private.is_primary_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.account_status = 'active'
      and p.role = 'super_admin'
      and p.is_primary_admin = true
  );
$$;

create or replace function private.active_role(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = p_user_id
    and p.account_status = 'active';
$$;

create or replace function private.has_family_moderator_scope(p_user_id uuid, p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_family_id is not null and exists (
    select 1
    from public.family_moderator_assignments a
    where a.user_id = p_user_id
      and a.family_id = p_family_id
  );
$$;

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

revoke all on function private.is_primary_admin(uuid) from public, anon, authenticated;
revoke all on function private.active_role(uuid) from public, anon, authenticated;
revoke all on function private.has_family_moderator_scope(uuid, uuid) from public, anon, authenticated;
revoke all on function private.person_in_family_moderator_scope(uuid, uuid) from public, anon, authenticated;

create or replace function private.sync_app_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set raw_app_meta_data =
    (coalesce(raw_app_meta_data, '{}'::jsonb) - 'is_primary_admin')
    || jsonb_build_object('app_role', p_role)
  where id = p_user_id;
end;
$$;
revoke all on function private.sync_app_role(uuid, text) from public, anon, authenticated;

-- Primary-admin role setter. verified_member is derived from account linking;
-- family_moderator is derived from explicit family assignments.
create or replace function public.set_platform_user_role(
  p_user_id uuid,
  p_role text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_role text;
  v_next_role text;
  v_linked_person_id uuid;
  v_is_primary boolean;
begin
  if not private.is_primary_admin(auth.uid()) then
    raise exception 'Only the primary administrator can change platform roles';
  end if;

  if p_role not in ('member', 'content_moderator', 'admin') then
    raise exception 'Use family scope assignment for family moderators; verified membership is automatic';
  end if;

  select p.role, p.linked_person_id, p.is_primary_admin
  into v_previous_role, v_linked_person_id, v_is_primary
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = p_user_id
    and p.account_status = 'active'
    and u.email_confirmed_at is not null
  for update;

  if v_previous_role is null then
    raise exception 'Registered user not found';
  end if;
  if v_is_primary then
    raise exception 'The primary administrator role is protected';
  end if;

  v_next_role := case
    when p_role = 'member' and v_linked_person_id is not null then 'verified_member'
    else p_role
  end;

  if v_previous_role = 'family_moderator' then
    delete from public.family_moderator_assignments where user_id = p_user_id;
  end if;

  if v_previous_role <> v_next_role then
    update public.profiles
    set role = v_next_role, updated_at = now()
    where id = p_user_id;

    insert into private.admin_role_audit(target_user_id, previous_role, new_role, changed_by)
    values (p_user_id, v_previous_role, v_next_role, auth.uid());
  end if;

  perform private.sync_app_role(p_user_id, v_next_role);
  return v_next_role;
end;
$$;

revoke all on function public.set_platform_user_role(uuid, text) from public, anon;
grant execute on function public.set_platform_user_role(uuid, text) to authenticated;

-- Keep the temporary member/admin function compatible with the new role model.
create or replace function public.set_basic_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_role not in ('member', 'admin') then
    raise exception 'Only member/admin are accepted by this compatibility function';
  end if;
  perform public.set_platform_user_role(p_user_id, p_role);
end;
$$;
revoke all on function public.set_basic_user_role(uuid, text) from public, anon;
grant execute on function public.set_basic_user_role(uuid, text) to authenticated;

create or replace function public.set_family_moderator_assignment(
  p_user_id uuid,
  p_family_id uuid,
  p_enabled boolean default true
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_role text;
  v_next_role text;
  v_linked_person_id uuid;
  v_is_primary boolean;
begin
  if not private.is_primary_admin(auth.uid()) then
    raise exception 'Only the primary administrator can manage family moderator scopes';
  end if;

  select p.role, p.linked_person_id, p.is_primary_admin
  into v_previous_role, v_linked_person_id, v_is_primary
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = p_user_id
    and p.account_status = 'active'
    and u.email_confirmed_at is not null
  for update;

  if v_previous_role is null then
    raise exception 'Registered user not found';
  end if;
  if v_is_primary then
    raise exception 'The primary administrator role is protected';
  end if;
  if not exists (select 1 from public.families f where f.id = p_family_id and f.status = 'approved') then
    raise exception 'Family not found or not approved';
  end if;

  if p_enabled then
    -- Family moderation is a dedicated scoped role, not an extra hidden permission.
    delete from public.family_moderator_assignments where user_id = p_user_id and family_id <> p_family_id and v_previous_role <> 'family_moderator';
    insert into public.family_moderator_assignments(user_id, family_id, assigned_by)
    values (p_user_id, p_family_id, auth.uid())
    on conflict (user_id, family_id) do nothing;

    v_next_role := 'family_moderator';
  else
    delete from public.family_moderator_assignments
    where user_id = p_user_id and family_id = p_family_id;

    if exists (select 1 from public.family_moderator_assignments a where a.user_id = p_user_id) then
      v_next_role := 'family_moderator';
    else
      v_next_role := case when v_linked_person_id is not null then 'verified_member' else 'member' end;
    end if;
  end if;

  if v_previous_role <> v_next_role then
    update public.profiles set role = v_next_role, updated_at = now() where id = p_user_id;
    insert into private.admin_role_audit(target_user_id, previous_role, new_role, changed_by)
    values (p_user_id, v_previous_role, v_next_role, auth.uid());
  end if;

  perform private.sync_app_role(p_user_id, v_next_role);
  return v_next_role;
end;
$$;

revoke all on function public.set_family_moderator_assignment(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_family_moderator_assignment(uuid, uuid, boolean) to authenticated;

create or replace function public.list_family_moderator_assignments(p_user_id uuid)
returns table (
  family_id uuid,
  family_name text,
  origin_place text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_primary_admin(auth.uid()) then
    raise exception 'Only the primary administrator can inspect family moderator scopes';
  end if;

  return query
  select a.family_id, f.name, f.origin_place
  from public.family_moderator_assignments a
  join public.families f on f.id = a.family_id
  where a.user_id = p_user_id
  order by f.name;
end;
$$;

revoke all on function public.list_family_moderator_assignments(uuid) from public, anon;
grant execute on function public.list_family_moderator_assignments(uuid) to authenticated;

-- Account linking automatically promotes a plain member to verified_member.
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

  if p_status = 'approved' and not exists (
    select 1 from public.people p where p.id = v_person_id and p.status = 'approved'
  ) then
    raise exception 'The person record must be approved before linking an account';
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

    perform private.sync_app_role(v_user_id, v_role);
  end if;
end;
$$;

revoke all on function public.review_account_link_request(uuid, text) from public, anon;
grant execute on function public.review_account_link_request(uuid, text) to authenticated;

-- Scope-aware primary moderation feed. Same return shape as phase 11.
create or replace function public.list_pending_moderation_feed(
  p_limit integer default 16,
  p_offset integer default 0
)
returns table (
  id uuid,
  table_name text,
  title text,
  subtitle text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.active_role(auth.uid());
  v_limit integer := greatest(1, least(coalesce(p_limit, 16), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if coalesce(v_role, '') not in ('family_moderator', 'content_moderator', 'admin', 'super_admin') then
    raise exception 'Not authorized to review pending content';
  end if;

  return query
  with pending as (
    select f.id, 'families'::text table_name, f.name::text title,
           coalesce(nullif(f.origin_place, ''), 'عائلة جديدة')::text subtitle, f.created_at
    from public.families f
    where f.status = 'pending'
      and (
        v_role in ('admin', 'super_admin')
        or (v_role = 'family_moderator' and f.created_by <> auth.uid()
            and private.has_family_moderator_scope(auth.uid(), f.id))
      )

    union all

    select p.id, 'people'::text, p.full_name::text,
           coalesce(nullif(f.name, ''), 'شخص جديد')::text, p.created_at
    from public.people p
    left join public.families f on f.id = p.family_id
    where p.status = 'pending'
      and (
        v_role in ('admin', 'super_admin')
        or (v_role = 'family_moderator' and p.created_by <> auth.uid()
            and private.person_in_family_moderator_scope(auth.uid(), p.id))
      )

    union all

    select e.id, 'events'::text, e.title::text,
           case e.event_type
             when 'death' then 'وفاة وعزاء'
             when 'wedding' then 'زواج'
             when 'birth' then 'مولود'
             when 'naming' then 'سماية'
             when 'graduation' then 'تخرج ونجاح'
             when 'general' then 'مناسبة عامة'
             else coalesce(nullif(e.event_type, ''), 'مناسبة')
           end::text,
           e.created_at
    from public.events e
    where e.status = 'pending'
      and (
        v_role in ('admin', 'super_admin')
        or (v_role = 'content_moderator' and e.created_by <> auth.uid())
        or (v_role = 'family_moderator' and e.created_by <> auth.uid()
            and private.has_family_moderator_scope(auth.uid(), e.family_id))
      )

    union all

    select r.id, 'person_relationships'::text,
           (coalesce(s.full_name, 'شخص أول') || ' — ' || coalesce(t.full_name, 'شخص ثانٍ'))::text,
           case r.relation_type
             when 'parent' then 'والد أو والدة'
             when 'child' then 'ابن أو ابنة'
             when 'spouse' then 'زوج أو زوجة'
             when 'sibling' then 'أخ أو أخت'
             when 'guardian' then 'ولي أو وصي'
             else 'صلة أخرى'
           end::text,
           r.created_at
    from public.person_relationships r
    left join public.people s on s.id = r.source_person_id
    left join public.people t on t.id = r.target_person_id
    where r.status = 'pending'
      and (
        v_role in ('admin', 'super_admin')
        or (v_role = 'family_moderator' and r.created_by <> auth.uid()
            and private.person_in_family_moderator_scope(auth.uid(), r.source_person_id)
            and private.person_in_family_moderator_scope(auth.uid(), r.target_person_id))
      )

    union all

    select l.id, 'account_link_requests'::text,
           coalesce(p.full_name, 'طلب ربط حساب')::text,
           'طلب إثبات أن الحساب يعود لهذا الشخص'::text,
           l.created_at
    from public.account_link_requests l
    left join public.people p on p.id = l.person_id
    where l.status = 'pending'
      and v_role in ('admin', 'super_admin')
  )
  select q.id, q.table_name, q.title, q.subtitle, q.created_at
  from pending q
  order by q.created_at asc, q.id
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.list_pending_moderation_feed(integer, integer) from public, anon;
grant execute on function public.list_pending_moderation_feed(integer, integer) to authenticated;

-- One protected review endpoint for primary queue records.
create or replace function public.review_pending_moderation_record(
  p_table_name text,
  p_record_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.active_role(auth.uid());
  v_created_by uuid;
  v_family_id uuid;
  v_source_id uuid;
  v_target_id uuid;
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;
  if coalesce(v_role, '') not in ('family_moderator', 'content_moderator', 'admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  if p_table_name = 'account_link_requests' then
    if v_role not in ('admin', 'super_admin') then raise exception 'Not authorized for account verification'; end if;
    perform public.review_account_link_request(p_record_id, p_status);
    return;
  elsif p_table_name = 'families' then
    select f.created_by, f.id into v_created_by, v_family_id
    from public.families f where f.id = p_record_id and f.status = 'pending' for update;
    if v_created_by is null then raise exception 'Request not found or already reviewed'; end if;
    if v_role = 'family_moderator' and (v_created_by = auth.uid() or not private.has_family_moderator_scope(auth.uid(), v_family_id)) then raise exception 'Outside assigned family scope or own request'; end if;
    if v_role = 'content_moderator' then raise exception 'Content moderators cannot review families'; end if;
    update public.families set status=p_status, approved_by=auth.uid(), approved_at=case when p_status='approved' then now() else null end where id=p_record_id;
  elsif p_table_name = 'people' then
    select p.created_by, p.family_id into v_created_by, v_family_id
    from public.people p where p.id = p_record_id and p.status = 'pending' for update;
    if v_created_by is null then raise exception 'Request not found or already reviewed'; end if;
    if v_role = 'family_moderator' and (v_created_by = auth.uid() or not private.person_in_family_moderator_scope(auth.uid(), p_record_id)) then raise exception 'Outside assigned family scope or own request'; end if;
    if v_role = 'content_moderator' then raise exception 'Content moderators cannot review people'; end if;
    update public.people set status=p_status, approved_by=auth.uid(), approved_at=case when p_status='approved' then now() else null end where id=p_record_id;
  elsif p_table_name = 'events' then
    select e.created_by, e.family_id into v_created_by, v_family_id
    from public.events e where e.id = p_record_id and e.status = 'pending' for update;
    if v_created_by is null then raise exception 'Request not found or already reviewed'; end if;
    if v_role = 'content_moderator' and v_created_by = auth.uid() then raise exception 'Moderators cannot approve their own request'; end if;
    if v_role = 'family_moderator' and (v_created_by = auth.uid() or not private.has_family_moderator_scope(auth.uid(), v_family_id)) then raise exception 'Outside assigned family scope or own request'; end if;
    update public.events set status=p_status, approved_by=auth.uid(), approved_at=case when p_status='approved' then now() else null end where id=p_record_id;
  elsif p_table_name = 'person_relationships' then
    select r.created_by, r.source_person_id, r.target_person_id into v_created_by, v_source_id, v_target_id
    from public.person_relationships r where r.id = p_record_id and r.status = 'pending' for update;
    if v_created_by is null then raise exception 'Request not found or already reviewed'; end if;
    if v_role = 'family_moderator' and (v_created_by = auth.uid()
      or not private.person_in_family_moderator_scope(auth.uid(), v_source_id)
      or not private.person_in_family_moderator_scope(auth.uid(), v_target_id)) then raise exception 'Outside assigned family scope or own request'; end if;
    if v_role = 'content_moderator' then raise exception 'Content moderators cannot review relationships'; end if;
    update public.person_relationships set status=p_status, approved_by=auth.uid(), approved_at=case when p_status='approved' then now() else null end where id=p_record_id;
  else
    raise exception 'Unsupported moderation table';
  end if;
end;
$$;

revoke all on function public.review_pending_moderation_record(text, uuid, text) from public, anon;
grant execute on function public.review_pending_moderation_record(text, uuid, text) to authenticated;

-- Scope-aware secondary queue. Same return shape as phase 12.
create or replace function public.list_pending_secondary_moderation_feed(
  p_limit integer default 13,
  p_offset integer default 0
)
returns table (
  id uuid,
  request_type text,
  title text,
  subtitle text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.active_role(auth.uid());
  v_limit integer := greatest(1, least(coalesce(p_limit, 13), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if coalesce(v_role, '') not in ('family_moderator', 'content_moderator', 'admin', 'super_admin') then
    raise exception 'Not authorized to review pending changes';
  end if;

  return query
  with pending as (
    select e.id, 'edit'::text request_type,
      case e.entity_type when 'families' then 'تعديل بيانات عائلة' when 'people' then 'تعديل بيانات شخص' when 'events' then 'تعديل مناسبة' else 'تعديل سجل' end::text title,
      coalesce(nullif(e.proposed_data->>'full_name',''), nullif(e.proposed_data->>'name',''), nullif(e.proposed_data->>'title',''), nullif(e.proposed_data->>'origin_place',''), nullif(e.proposed_data->>'location_name',''), 'راجع البيانات المقترحة ثم اعتمد أو ارفض.')::text subtitle,
      e.created_at
    from public.content_edit_requests e
    where e.status='pending'
      and (
        v_role in ('admin','super_admin')
        or (v_role='content_moderator' and e.requested_by<>auth.uid() and e.entity_type='events')
        or (v_role='family_moderator' and e.requested_by<>auth.uid() and (
          (e.entity_type='families' and private.has_family_moderator_scope(auth.uid(), e.record_id))
          or (e.entity_type='people' and private.person_in_family_moderator_scope(auth.uid(), e.record_id))
          or (e.entity_type='events' and exists (select 1 from public.events ev where ev.id=e.record_id and private.has_family_moderator_scope(auth.uid(), ev.family_id)))
        ))
      )

    union all

    select m.id, 'membership'::text,
      (coalesce(p.full_name,'شخص') || ' ← ' || coalesce(f.name,'عائلة'))::text,
      (case m.membership_type when 'birth' then 'بالنسب / عائلة الأصل' when 'marriage' then 'بالزواج' when 'paternal' then 'من جهة الأب' when 'maternal' then 'من جهة الأم' when 'guardian' then 'وصاية أو كفالة' else 'انتماء آخر' end
       || case when m.is_primary then ' · عائلة أساسية' else '' end
       || case when nullif(m.notes,'') is not null then ' · '||m.notes else '' end)::text,
      m.created_at
    from public.person_family_memberships m
    left join public.people p on p.id=m.person_id
    left join public.families f on f.id=m.family_id
    where m.status='pending'
      and (
        v_role in ('admin','super_admin')
        or (v_role='family_moderator' and m.created_by<>auth.uid() and private.has_family_moderator_scope(auth.uid(), m.family_id))
      )
  )
  select q.id,q.request_type,q.title,q.subtitle,q.created_at
  from pending q order by q.created_at asc,q.id limit v_limit offset v_offset;
end;
$$;

revoke all on function public.list_pending_secondary_moderation_feed(integer, integer) from public, anon;
grant execute on function public.list_pending_secondary_moderation_feed(integer, integer) to authenticated;

-- Unified protected review endpoint for edit requests and family memberships.
create or replace function public.review_secondary_moderation_request(
  p_request_type text,
  p_request_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.active_role(auth.uid());
  v_edit public.content_edit_requests%rowtype;
  v_membership public.person_family_memberships%rowtype;
  v_event_family_id uuid;
begin
  if p_status not in ('approved','rejected') then raise exception 'Invalid review status'; end if;
  if coalesce(v_role, '') not in ('family_moderator','content_moderator','admin','super_admin') then raise exception 'Not authorized'; end if;

  if p_request_type = 'membership' then
    select * into v_membership from public.person_family_memberships where id=p_request_id and status='pending' for update;
    if v_membership.id is null then raise exception 'Request not found or already reviewed'; end if;
    if v_role not in ('admin','super_admin') then
      if v_role <> 'family_moderator' or v_membership.created_by=auth.uid() or not private.has_family_moderator_scope(auth.uid(),v_membership.family_id) then
        raise exception 'Outside assigned family scope or own request';
      end if;
    end if;
    update public.person_family_memberships set status=p_status, approved_by=auth.uid(), approved_at=case when p_status='approved' then now() else null end where id=p_request_id;
    return;
  end if;

  if p_request_type <> 'edit' then raise exception 'Unsupported secondary request type'; end if;

  select * into v_edit from public.content_edit_requests where id=p_request_id and status='pending' for update;
  if v_edit.id is null then raise exception 'Request not found or already reviewed'; end if;

  if v_role not in ('admin','super_admin') then
    if v_edit.requested_by=auth.uid() then raise exception 'Moderators cannot approve their own request'; end if;
    if v_role='content_moderator' and v_edit.entity_type<>'events' then raise exception 'Content moderator scope is limited to events'; end if;
    if v_role='family_moderator' then
      if v_edit.entity_type='families' and not private.has_family_moderator_scope(auth.uid(),v_edit.record_id) then raise exception 'Outside assigned family scope'; end if;
      if v_edit.entity_type='people' and not private.person_in_family_moderator_scope(auth.uid(),v_edit.record_id) then raise exception 'Outside assigned family scope'; end if;
      if v_edit.entity_type='events' then
        select e.family_id into v_event_family_id from public.events e where e.id=v_edit.record_id;
        if not private.has_family_moderator_scope(auth.uid(),v_event_family_id) then raise exception 'Outside assigned family scope'; end if;
      end if;
    end if;
  end if;

  if p_status='approved' then
    if v_edit.entity_type='families' then
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
        location_name=case when v_edit.proposed_data?'location_name' then nullif(trim(v_edit.proposed_data->>'location_name'),'') else location_name end,
        family_id=case when v_edit.proposed_data?'family_id' then nullif(v_edit.proposed_data->>'family_id','')::uuid else family_id end
      where id=v_edit.record_id;
    end if;
  end if;

  update public.content_edit_requests set status=p_status, reviewed_by=auth.uid(), reviewed_at=now(), updated_at=now() where id=p_request_id;
end;
$$;

revoke all on function public.review_secondary_moderation_request(text, uuid, text) from public, anon;
grant execute on function public.review_secondary_moderation_request(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;

-- INCLUDED MIGRATION: 202608070018_family_moderator_event_scope_guard.sql
-- PHASE 14: FAMILY-MODERATOR EVENT SCOPE GUARD
-- Even through a SECURITY DEFINER review function, a family moderator must not
-- move an event to an unassigned family (or to the global scope) while approving an edit.

begin;

create or replace function private.enforce_family_moderator_event_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(private.active_role(auth.uid()), '') = 'family_moderator'
     and new.family_id is distinct from old.family_id
     and not private.has_family_moderator_scope(auth.uid(), new.family_id) then
    raise exception 'Family moderator cannot move an event outside assigned family scope';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_family_moderator_event_scope() from public, anon, authenticated;

drop trigger if exists enforce_family_moderator_event_scope on public.events;
create trigger enforce_family_moderator_event_scope
before update of family_id on public.events
for each row execute function private.enforce_family_moderator_event_scope();

commit;

-- INCLUDED MIGRATION: 202608070019_my_submission_activity_feed.sql
-- PHASE 15: MY SUBMISSIONS / ACTIVITY FEED
-- One lightweight server-side feed for a signed-in user's own submissions.

begin;

create index if not exists families_owner_activity_idx on public.families (created_by, created_at desc);
create index if not exists people_owner_activity_idx on public.people (created_by, created_at desc);
create index if not exists events_owner_activity_idx on public.events (created_by, created_at desc);
create index if not exists relationships_owner_activity_idx on public.person_relationships (created_by, created_at desc);
create index if not exists memberships_owner_activity_idx on public.person_family_memberships (created_by, created_at desc);
create index if not exists edit_requests_owner_activity_idx on public.content_edit_requests (requested_by, created_at desc);
create index if not exists link_requests_owner_activity_idx on public.account_link_requests (user_id, created_at desc);

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
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if v_status is not null and v_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid activity status';
  end if;

  return query
  with activity as (
    select f.id, 'family'::text item_type, 'families'::text entity_type, f.id record_id,
      f.name::text title,
      coalesce(nullif(f.origin_place,''), 'إضافة عائلة')::text subtitle,
      f.status::text status, null::text review_note, f.created_at
    from public.families f
    where f.created_by=v_user_id and (v_status is null or f.status=v_status)

    union all

    select p.id, 'person'::text, 'people'::text, p.id,
      p.full_name::text,
      coalesce(nullif(f.name,''), 'إضافة شخص')::text,
      p.status::text, null::text, p.created_at
    from public.people p
    left join public.families f on f.id=p.family_id
    where p.created_by=v_user_id and (v_status is null or p.status=v_status)

    union all

    select e.id, 'event'::text, 'events'::text, e.id,
      e.title::text,
      case e.event_type when 'death' then 'وفاة وعزاء' when 'wedding' then 'زواج' when 'birth' then 'مولود' when 'naming' then 'سماية' when 'graduation' then 'تخرج ونجاح' else 'مناسبة' end::text,
      e.status::text, null::text, e.created_at
    from public.events e
    where e.created_by=v_user_id and (v_status is null or e.status=v_status)

    union all

    select r.id, 'relationship'::text, 'person_relationships'::text, r.source_person_id,
      (coalesce(s.full_name,'شخص') || ' — ' || coalesce(t.full_name,'شخص'))::text,
      case r.relation_type when 'parent' then 'صلة والد/والدة' when 'child' then 'صلة ابن/ابنة' when 'spouse' then 'صلة زوجية' when 'sibling' then 'صلة أخوة' else 'صلة قرابة' end::text,
      r.status::text, null::text, r.created_at
    from public.person_relationships r
    left join public.people s on s.id=r.source_person_id
    left join public.people t on t.id=r.target_person_id
    where r.created_by=v_user_id and (v_status is null or r.status=v_status)

    union all

    select m.id, 'membership'::text, 'person_family_memberships'::text, m.person_id,
      (coalesce(p.full_name,'شخص') || ' ← ' || coalesce(f.name,'عائلة'))::text,
      case m.membership_type when 'birth' then 'انتماء بالنسب' when 'marriage' then 'انتماء بالزواج' when 'paternal' then 'من جهة الأب' when 'maternal' then 'من جهة الأم' else 'انتماء عائلي' end::text,
      m.status::text, null::text, m.created_at
    from public.person_family_memberships m
    left join public.people p on p.id=m.person_id
    left join public.families f on f.id=m.family_id
    where m.created_by=v_user_id and (v_status is null or m.status=v_status)

    union all

    select e.id, 'edit'::text, e.entity_type::text, e.record_id,
      case e.entity_type when 'families' then 'تعديل عائلة' when 'people' then 'تعديل شخص' when 'events' then 'تعديل مناسبة' else 'تعديل سجل' end::text,
      coalesce(nullif(e.proposed_data->>'full_name',''), nullif(e.proposed_data->>'name',''), nullif(e.proposed_data->>'title',''), 'طلب تعديل')::text,
      e.status::text, e.review_note::text, e.created_at
    from public.content_edit_requests e
    where e.requested_by=v_user_id and (v_status is null or e.status=v_status)

    union all

    select l.id, 'account_link'::text, 'people'::text, l.person_id,
      coalesce(p.full_name,'ربط الحساب بسجل شخص')::text,
      'طلب ربط الحساب بالشخص'::text,
      l.status::text, null::text, l.created_at
    from public.account_link_requests l
    left join public.people p on p.id=l.person_id
    where l.user_id=v_user_id and (v_status is null or l.status=v_status)
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

-- INCLUDED MIGRATION: 202608070020_verified_people_primary_family_relationship_edits_event_people_arabic_search.sql
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

-- INCLUDED MIGRATION: 202608070021_edit_review_details.sql
-- PHASE 17: ON-DEMAND EDIT REVIEW DETAILS
-- Reviewers fetch old/new values only when they open one edit request.

begin;

create or replace function public.get_edit_request_review_details(p_request_id uuid)
returns table(
  request_id uuid,
  entity_type text,
  record_id uuid,
  requester_name text,
  created_at timestamptz,
  current_data jsonb,
  proposed_data jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(private.active_role(auth.uid()), '');
  v_edit public.content_edit_requests%rowtype;
  v_event_family_id uuid;
  v_rel public.person_relationships%rowtype;
  v_current jsonb := '{}'::jsonb;
  v_proposed jsonb;
  v_family_name text;
begin
  if v_role not in ('family_moderator','content_moderator','admin','super_admin') then
    raise exception 'Not authorized';
  end if;

  select * into v_edit
  from public.content_edit_requests e
  where e.id = p_request_id and e.status = 'pending';

  if v_edit.id is null then
    raise exception 'Request not found or already reviewed';
  end if;

  if v_role = 'content_moderator' and v_edit.entity_type <> 'events' then
    raise exception 'Outside content moderator scope';
  end if;

  if v_role = 'family_moderator' then
    if v_edit.entity_type = 'families' and not private.has_family_moderator_scope(auth.uid(), v_edit.record_id) then
      raise exception 'Outside assigned family scope';
    elsif v_edit.entity_type = 'people' and not private.person_in_family_moderator_scope(auth.uid(), v_edit.record_id) then
      raise exception 'Outside assigned family scope';
    elsif v_edit.entity_type = 'events' then
      select e.family_id into v_event_family_id from public.events e where e.id = v_edit.record_id;
      if not private.has_family_moderator_scope(auth.uid(), v_event_family_id) then raise exception 'Outside assigned family scope'; end if;
    elsif v_edit.entity_type = 'person_relationships' then
      select * into v_rel from public.person_relationships r where r.id = v_edit.record_id;
      if not private.person_in_family_moderator_scope(auth.uid(), v_rel.source_person_id)
         or not private.person_in_family_moderator_scope(auth.uid(), v_rel.target_person_id) then
        raise exception 'Outside assigned family scope';
      end if;
    end if;
  end if;

  if v_edit.entity_type = 'families' then
    select jsonb_build_object(
      'name', f.name,
      'origin_place', f.origin_place,
      'description', f.description
    ) into v_current
    from public.families f where f.id = v_edit.record_id;
  elsif v_edit.entity_type = 'people' then
    select jsonb_build_object(
      'full_name', p.full_name,
      'gender', p.gender,
      'birth_year', p.birth_year,
      'is_deceased', p.is_deceased,
      'death_date', p.death_date,
      'description', p.description,
      'family_id', p.family_id,
      'family_name', f.name
    ) into v_current
    from public.people p left join public.families f on f.id = p.family_id
    where p.id = v_edit.record_id;
  elsif v_edit.entity_type = 'events' then
    select jsonb_build_object(
      'event_type', e.event_type,
      'title', e.title,
      'event_date', e.event_date,
      'location_name', e.location_name,
      'description', e.description,
      'family_id', e.family_id,
      'family_name', f.name
    ) into v_current
    from public.events e left join public.families f on f.id = e.family_id
    where e.id = v_edit.record_id;
  elsif v_edit.entity_type = 'person_relationships' then
    select jsonb_build_object(
      'relation_type', r.relation_type,
      'notes', r.notes,
      'source_person', s.full_name,
      'target_person', t.full_name
    ) into v_current
    from public.person_relationships r
    left join public.people s on s.id = r.source_person_id
    left join public.people t on t.id = r.target_person_id
    where r.id = v_edit.record_id;
  end if;

  v_proposed := v_edit.proposed_data;
  if v_edit.entity_type in ('people','events') and v_proposed ? 'family_id' then
    select f.name into v_family_name
    from public.families f
    where f.id = nullif(v_proposed->>'family_id','')::uuid;
    v_proposed := v_proposed || jsonb_build_object('family_name', v_family_name);
  end if;

  return query
  select
    v_edit.id,
    v_edit.entity_type,
    v_edit.record_id,
    coalesce(nullif(p.display_name,''), nullif(p.email,''), 'مستخدم مسجل')::text,
    v_edit.created_at,
    coalesce(v_current, '{}'::jsonb),
    coalesce(v_proposed, '{}'::jsonb)
  from public.profiles p
  where p.id = v_edit.requested_by;
end;
$$;

revoke all on function public.get_edit_request_review_details(uuid) from public, anon;
grant execute on function public.get_edit_request_review_details(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;

-- INCLUDED MIGRATION: 202608070022_social_feature_hardening.sql
-- PHASE 18: SOCIAL FEATURE HARDENING
-- Finalizes the six requested social-style features after phase 16/17.

begin;

-- Treat a standalone hamza as ignorable as well, and normalize taa marbuta to haa.
create or replace function public.normalize_arabic_name(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(trim(
    regexp_replace(
      regexp_replace(
        translate(
          regexp_replace(coalesce(p_value, ''), '[\u064B-\u065F\u0670\u06D6-\u06ED]', '', 'g'),
          'أإآٱىئؤةۀ',
          'ااااييوهه'
        ),
        'ء', '', 'g'
      ),
      '\s+', ' ', 'g'
    )
  ));
$$;

-- A verified linked person may choose their own primary family even when they did not create the public record.
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
  v_linked boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select p.created_by into v_owner from public.people p where p.id = p_person_id;
  if v_owner is null then raise exception 'Person not found'; end if;
  if not exists (
    select 1 from public.person_family_memberships m
    where m.person_id=p_person_id and m.family_id=p_family_id and m.status='approved'
  ) then raise exception 'Selected family is not an approved membership'; end if;

  v_role := coalesce(private.active_role(auth.uid()), '');
  v_linked := exists (
    select 1 from public.profiles pr
    where pr.id=auth.uid()
      and pr.account_status='active'
      and pr.linked_person_id=p_person_id
  );

  if v_role in ('admin','super_admin') or v_linked then
    perform private.apply_primary_family(p_person_id, p_family_id);
    return 'approved';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'Only the verified person, record owner, or an administrator can change the primary family';
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

-- The new request_relationship_change workflow supersedes the older edit-only RPC.
do $$
begin
  begin
    revoke execute on function public.request_relationship_edit(uuid,text,text) from authenticated;
  exception when undefined_function then
    null;
  end;
end $$;

notify pgrst,'reload schema';

commit;

-- INCLUDED MIGRATION: 202608070023_relationship_edit_delete_requests.sql
-- PHASE 17: RELATIONSHIP EDIT / DELETE WORKFLOW
-- Admins apply directly; owners edit/delete their own pending relation directly,
-- while changes to approved relationships require an admin review request.
-- Change requests keep an immutable relationship snapshot so approved deletions remain auditable.

begin;

create table if not exists public.relationship_change_requests (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid null,
  source_person_id uuid null references public.people(id) on delete set null,
  target_person_id uuid null references public.people(id) on delete set null,
  source_name text null,
  target_name text null,
  original_relation_type text null,
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

-- Upgrade safely if an older draft of phase 17 was executed already.
alter table public.relationship_change_requests add column if not exists source_person_id uuid null references public.people(id) on delete set null;
alter table public.relationship_change_requests add column if not exists target_person_id uuid null references public.people(id) on delete set null;
alter table public.relationship_change_requests add column if not exists source_name text null;
alter table public.relationship_change_requests add column if not exists target_name text null;
alter table public.relationship_change_requests add column if not exists original_relation_type text null;
alter table public.relationship_change_requests alter column relationship_id drop not null;
alter table public.relationship_change_requests drop constraint if exists relationship_change_requests_relationship_id_fkey;
alter table public.relationship_change_requests
  add constraint relationship_change_requests_relationship_id_fkey
  foreign key (relationship_id) references public.person_relationships(id) on delete set null;

update public.relationship_change_requests q
set source_person_id = coalesce(q.source_person_id, r.source_person_id),
    target_person_id = coalesce(q.target_person_id, r.target_person_id),
    source_name = coalesce(q.source_name, s.full_name),
    target_name = coalesce(q.target_name, t.full_name),
    original_relation_type = coalesce(q.original_relation_type, r.relation_type)
from public.person_relationships r
left join public.people s on s.id=r.source_person_id
left join public.people t on t.id=r.target_person_id
where q.relationship_id=r.id
  and (q.source_person_id is null or q.target_person_id is null or q.source_name is null or q.target_name is null or q.original_relation_type is null);

create unique index if not exists relationship_change_one_pending_idx
  on public.relationship_change_requests (relationship_id)
  where status='pending' and relationship_id is not null;
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
  v_source_name text;
  v_target_name text;
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

  select s.full_name,t.full_name into v_source_name,v_target_name
  from public.people s, public.people t
  where s.id=v_relation.source_person_id and t.id=v_relation.target_person_id;

  insert into public.relationship_change_requests(
    relationship_id,source_person_id,target_person_id,source_name,target_name,original_relation_type,
    requested_by,action,proposed_relation_type,proposed_notes
  )
  values (
    p_relationship_id,v_relation.source_person_id,v_relation.target_person_id,v_source_name,v_target_name,v_relation.relation_type,
    v_user_id,p_action,
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
    (coalesce(q.source_name,'شخص')||' — '||coalesce(q.target_name,'شخص'))::text,
    (case when q.action='delete' then 'طلب حذف صلة قرابة' else 'تعديل إلى: '||
      case q.proposed_relation_type when 'parent' then 'والد/والدة' when 'child' then 'ابن/ابنة' when 'spouse' then 'زوج/زوجة' when 'sibling' then 'أخ/أخت' when 'guardian' then 'ولي/وصي' else 'صلة أخرى' end end)::text,
    q.created_at
  from public.relationship_change_requests q
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
    if v_request.relationship_id is null then raise exception 'The original relationship no longer exists'; end if;
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

-- INCLUDED MIGRATION: 202608070024_relationship_changes_in_my_activity.sql
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

-- INCLUDED MIGRATION: 202608070025_link_integrity_repair_and_unique_guard.sql
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

-- INCLUDED MIGRATION: 202608070026_admin_contributor_stats_and_link_integrity.sql
-- PHASE 18: ADMIN CONTRIBUTOR RANKINGS + ACCOUNT LINK INTEGRITY

begin;

create index if not exists profiles_linked_person_active_idx
  on public.profiles(linked_person_id, account_status)
  where linked_person_id is not null;
create index if not exists content_edit_requests_requester_activity_idx
  on public.content_edit_requests(requested_by, created_at desc);

create or replace function public.list_admin_contributor_stats(
  p_period_days integer default null,
  p_limit integer default 12,
  p_offset integer default 0
)
returns table(
  user_id uuid,
  display_name text,
  email text,
  role text,
  total_contributions bigint,
  approved_contributions bigint,
  pending_contributions bigint,
  rejected_contributions bigint,
  people_count bigint,
  families_count bigint,
  events_count bigint,
  relationships_count bigint,
  memberships_count bigint,
  edits_count bigint,
  last_contribution_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(private.active_role(auth.uid()), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 12), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_since timestamptz := case
    when p_period_days is null or p_period_days <= 0 then null
    else now() - make_interval(days => least(p_period_days, 3650))
  end;
begin
  if v_role not in ('admin','super_admin') then
    raise exception 'Administrator access required';
  end if;

  return query
  with activity as (
    select f.created_by user_id, 'family'::text kind, f.status::text status, f.created_at
    from public.families f
    where f.created_by is not null and (v_since is null or f.created_at >= v_since)

    union all
    select p.created_by, 'person', p.status::text, p.created_at
    from public.people p
    where p.created_by is not null and (v_since is null or p.created_at >= v_since)

    union all
    select e.created_by, 'event', e.status::text, e.created_at
    from public.events e
    where e.created_by is not null and (v_since is null or e.created_at >= v_since)

    union all
    select r.created_by, 'relationship', r.status::text, r.created_at
    from public.person_relationships r
    where r.created_by is not null and (v_since is null or r.created_at >= v_since)

    union all
    select m.created_by, 'membership', m.status::text, m.created_at
    from public.person_family_memberships m
    where m.created_by is not null and (v_since is null or m.created_at >= v_since)

    union all
    select c.requested_by, 'edit', c.status::text, c.created_at
    from public.content_edit_requests c
    where c.requested_by is not null and (v_since is null or c.created_at >= v_since)
  ), ranked as (
    select
      a.user_id,
      count(*)::bigint total_contributions,
      count(*) filter (where a.status='approved')::bigint approved_contributions,
      count(*) filter (where a.status='pending')::bigint pending_contributions,
      count(*) filter (where a.status='rejected')::bigint rejected_contributions,
      count(*) filter (where a.kind='person')::bigint people_count,
      count(*) filter (where a.kind='family')::bigint families_count,
      count(*) filter (where a.kind='event')::bigint events_count,
      count(*) filter (where a.kind='relationship')::bigint relationships_count,
      count(*) filter (where a.kind='membership')::bigint memberships_count,
      count(*) filter (where a.kind='edit')::bigint edits_count,
      max(a.created_at) last_contribution_at
    from activity a
    group by a.user_id
  )
  select
    r.user_id,
    coalesce(nullif(p.display_name,''), nullif(p.email,''), 'مستخدم مسجل')::text,
    p.email::text,
    coalesce(p.role,'member')::text,
    r.total_contributions,
    r.approved_contributions,
    r.pending_contributions,
    r.rejected_contributions,
    r.people_count,
    r.families_count,
    r.events_count,
    r.relationships_count,
    r.memberships_count,
    r.edits_count,
    r.last_contribution_at
  from ranked r
  join public.profiles p on p.id=r.user_id
  order by r.approved_contributions desc, r.total_contributions desc, r.last_contribution_at desc, r.user_id
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.list_admin_contributor_stats(integer,integer,integer) from public, anon;
grant execute on function public.list_admin_contributor_stats(integer,integer,integer) to authenticated;

create or replace function public.get_admin_contribution_overview(p_period_days integer default null)
returns table(
  total_contributions bigint,
  active_contributors bigint,
  approved_contributions bigint,
  pending_contributions bigint,
  rejected_contributions bigint,
  duplicate_linked_people bigint,
  duplicate_linked_accounts bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(private.active_role(auth.uid()), '');
  v_since timestamptz := case
    when p_period_days is null or p_period_days <= 0 then null
    else now() - make_interval(days => least(p_period_days, 3650))
  end;
begin
  if v_role not in ('admin','super_admin') then
    raise exception 'Administrator access required';
  end if;

  return query
  with activity as (
    select f.created_by user_id, f.status::text status, f.created_at from public.families f where f.created_by is not null and (v_since is null or f.created_at >= v_since)
    union all select p.created_by, p.status::text, p.created_at from public.people p where p.created_by is not null and (v_since is null or p.created_at >= v_since)
    union all select e.created_by, e.status::text, e.created_at from public.events e where e.created_by is not null and (v_since is null or e.created_at >= v_since)
    union all select r.created_by, r.status::text, r.created_at from public.person_relationships r where r.created_by is not null and (v_since is null or r.created_at >= v_since)
    union all select m.created_by, m.status::text, m.created_at from public.person_family_memberships m where m.created_by is not null and (v_since is null or m.created_at >= v_since)
    union all select c.requested_by, c.status::text, c.created_at from public.content_edit_requests c where c.requested_by is not null and (v_since is null or c.created_at >= v_since)
  ), duplicate_people as (
    select pr.linked_person_id, count(*)::bigint account_count
    from public.profiles pr
    where pr.linked_person_id is not null and pr.account_status='active'
    group by pr.linked_person_id
    having count(*) > 1
  )
  select
    count(*)::bigint,
    count(distinct a.user_id)::bigint,
    count(*) filter (where a.status='approved')::bigint,
    count(*) filter (where a.status='pending')::bigint,
    count(*) filter (where a.status='rejected')::bigint,
    (select count(*)::bigint from duplicate_people),
    (select coalesce(sum(dp.account_count),0)::bigint from duplicate_people dp)
  from activity a;
end;
$$;

revoke all on function public.get_admin_contribution_overview(integer) from public, anon;
grant execute on function public.get_admin_contribution_overview(integer) to authenticated;

notify pgrst, 'reload schema';

commit;

-- INCLUDED MIGRATION: 202608070027_relationship_delete_integrity.sql
-- PHASE 20: RELATIONSHIP DELETE INTEGRITY
-- Delete a logical kinship edge, not only one physical row.
-- Parent/child can be stored in either direction, while spouse/sibling are symmetric.
-- This migration also repairs duplicate active logical edges and prevents them from returning.

begin;

create or replace function private.delete_logical_person_relationship(p_relationship_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_relation public.person_relationships%rowtype;
  v_parent_id uuid;
  v_child_id uuid;
  v_deleted integer := 0;
begin
  select *
  into v_relation
  from public.person_relationships
  where id = p_relationship_id
  for update;

  if v_relation.id is null then
    return 0;
  end if;

  if v_relation.relation_type in ('parent', 'child') then
    v_parent_id := case
      when v_relation.relation_type = 'parent' then v_relation.source_person_id
      else v_relation.target_person_id
    end;
    v_child_id := case
      when v_relation.relation_type = 'parent' then v_relation.target_person_id
      else v_relation.source_person_id
    end;

    delete from public.person_relationships r
    where r.id = p_relationship_id
       or (
         r.status in ('pending', 'approved')
         and (
           (r.relation_type = 'parent' and r.source_person_id = v_parent_id and r.target_person_id = v_child_id)
           or
           (r.relation_type = 'child' and r.source_person_id = v_child_id and r.target_person_id = v_parent_id)
         )
       );
  elsif v_relation.relation_type in ('spouse', 'sibling') then
    delete from public.person_relationships r
    where r.id = p_relationship_id
       or (
         r.status in ('pending', 'approved')
         and r.relation_type = v_relation.relation_type
         and (
           (r.source_person_id = v_relation.source_person_id and r.target_person_id = v_relation.target_person_id)
           or
           (r.source_person_id = v_relation.target_person_id and r.target_person_id = v_relation.source_person_id)
         )
       );
  else
    delete from public.person_relationships
    where id = p_relationship_id;
  end if;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.delete_logical_person_relationship(uuid) from public, anon, authenticated;

-- Repair duplicate active parent/child rows that represent the same logical edge.
with ranked_parent_child as (
  select
    r.id,
    row_number() over (
      partition by
        case when r.relation_type = 'parent' then r.source_person_id else r.target_person_id end,
        case when r.relation_type = 'parent' then r.target_person_id else r.source_person_id end
      order by
        case when r.status = 'approved' then 0 else 1 end,
        r.created_at,
        r.id
    ) as rn
  from public.person_relationships r
  where r.status in ('pending', 'approved')
    and r.relation_type in ('parent', 'child')
)
delete from public.person_relationships r
using ranked_parent_child d
where r.id = d.id
  and d.rn > 1;

-- Repair reverse duplicates for symmetric relationships.
with ranked_symmetric as (
  select
    r.id,
    row_number() over (
      partition by
        r.relation_type,
        least(r.source_person_id::text, r.target_person_id::text),
        greatest(r.source_person_id::text, r.target_person_id::text)
      order by
        case when r.status = 'approved' then 0 else 1 end,
        r.created_at,
        r.id
    ) as rn
  from public.person_relationships r
  where r.status in ('pending', 'approved')
    and r.relation_type in ('spouse', 'sibling')
)
delete from public.person_relationships r
using ranked_symmetric d
where r.id = d.id
  and d.rn > 1;

create unique index if not exists person_relationships_parent_child_logical_unique_idx
on public.person_relationships (
  (case when relation_type = 'parent' then source_person_id else target_person_id end),
  (case when relation_type = 'parent' then target_person_id else source_person_id end)
)
where status in ('pending', 'approved')
  and relation_type in ('parent', 'child');

create unique index if not exists person_relationships_symmetric_logical_unique_idx
on public.person_relationships (
  relation_type,
  least(source_person_id::text, target_person_id::text),
  greatest(source_person_id::text, target_person_id::text)
)
where status in ('pending', 'approved')
  and relation_type in ('spouse', 'sibling');

create or replace function public.request_relationship_change(
  p_relationship_id uuid,
  p_action text,
  p_relation_type text default null,
  p_notes text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := private.active_role(auth.uid());
  v_relation public.person_relationships%rowtype;
  v_source_name text;
  v_target_name text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_action not in ('edit', 'delete') then raise exception 'Invalid action'; end if;
  if p_action = 'edit' and p_relation_type not in ('parent', 'child', 'spouse', 'sibling', 'guardian', 'other') then
    raise exception 'Invalid relationship type';
  end if;

  select * into v_relation
  from public.person_relationships
  where id = p_relationship_id
  for update;

  if v_relation.id is null then raise exception 'Relationship not found'; end if;
  if coalesce(v_role, '') not in ('admin', 'super_admin') and v_relation.created_by <> v_user_id then
    raise exception 'Only the relationship owner or an administrator can change it';
  end if;

  if coalesce(v_role, '') in ('admin', 'super_admin') then
    if p_action = 'delete' then
      perform private.delete_logical_person_relationship(p_relationship_id);
    else
      update public.person_relationships
      set relation_type = p_relation_type,
          notes = nullif(trim(coalesce(p_notes, '')), '')
      where id = p_relationship_id;
    end if;
    return 'applied';
  end if;

  if v_relation.status = 'pending' then
    if p_action = 'delete' then
      perform private.delete_logical_person_relationship(p_relationship_id);
    else
      update public.person_relationships
      set relation_type = p_relation_type,
          notes = nullif(trim(coalesce(p_notes, '')), '')
      where id = p_relationship_id;
    end if;
    return 'applied';
  end if;

  if v_relation.status <> 'approved' then raise exception 'Rejected relationship cannot be changed'; end if;

  select s.full_name, t.full_name
  into v_source_name, v_target_name
  from public.people s, public.people t
  where s.id = v_relation.source_person_id
    and t.id = v_relation.target_person_id;

  insert into public.relationship_change_requests(
    relationship_id, source_person_id, target_person_id, source_name, target_name, original_relation_type,
    requested_by, action, proposed_relation_type, proposed_notes
  )
  values (
    p_relationship_id, v_relation.source_person_id, v_relation.target_person_id, v_source_name, v_target_name, v_relation.relation_type,
    v_user_id, p_action,
    case when p_action = 'edit' then p_relation_type else null end,
    case when p_action = 'edit' then nullif(trim(coalesce(p_notes, '')), '') else null end
  );

  return 'pending';
end;
$$;

revoke all on function public.request_relationship_change(uuid, text, text, text) from public, anon;
grant execute on function public.request_relationship_change(uuid, text, text, text) to authenticated;

create or replace function public.review_relationship_change(
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
  v_request public.relationship_change_requests%rowtype;
begin
  if coalesce(private.active_role(auth.uid()), '') not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;
  if p_status not in ('approved', 'rejected') then raise exception 'Invalid review status'; end if;

  select * into v_request
  from public.relationship_change_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if v_request.id is null then raise exception 'Request not found or already reviewed'; end if;

  if p_status = 'approved' then
    if v_request.action = 'delete' then
      if v_request.relationship_id is not null then
        perform private.delete_logical_person_relationship(v_request.relationship_id);
      end if;
    else
      if v_request.relationship_id is null then
        raise exception 'The original relationship no longer exists';
      end if;
      update public.person_relationships
      set relation_type = v_request.proposed_relation_type,
          notes = v_request.proposed_notes
      where id = v_request.relationship_id;
    end if;
  end if;

  update public.relationship_change_requests
  set status = p_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(trim(coalesce(p_review_note, '')), ''),
      updated_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.review_relationship_change(uuid, text, text) from public, anon;
grant execute on function public.review_relationship_change(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;

-- INCLUDED MIGRATION: 202608070028_person_relationship_resync.sql
-- PHASE 21: PER-PERSON RELATIONSHIP RESYNC
-- Gives administrators a safe repair/rebuild action from a person's profile.
-- Kinship is derived dynamically, so resync validates the source graph, removes
-- invalid self-links, normalizes duplicate logical edges for this person, and
-- reports the rebuilt direct / inferred relationship counts.

begin;

create or replace function public.resync_person_relationships(p_person_id uuid)
returns table (
  direct_relationship_count integer,
  smart_relationship_count integer,
  extended_relationship_count integer,
  removed_invalid_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.active_role(auth.uid());
  v_direct integer := 0;
  v_smart integer := 0;
  v_extended integer := 0;
  v_removed integer := 0;
  v_step_removed integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if coalesce(v_role, '') not in ('admin', 'super_admin') then
    raise exception 'Administrator access required';
  end if;

  if not exists (select 1 from public.people p where p.id = p_person_id) then
    raise exception 'Person not found';
  end if;

  -- Self-links can make every downstream inference unreliable.
  delete from public.person_relationships r
  where r.source_person_id = p_person_id
    and r.target_person_id = p_person_id;
  get diagnostics v_step_removed = row_count;
  v_removed := v_removed + v_step_removed;

  -- Normalize any legacy duplicate parent/child rows that describe the same
  -- logical parent -> child edge and touch this person. Migration 027 prevents
  -- new duplicates, but this keeps resync useful for databases upgraded later.
  with candidates as (
    select
      r.id,
      row_number() over (
        partition by
          case when r.relation_type = 'parent' then r.source_person_id else r.target_person_id end,
          case when r.relation_type = 'parent' then r.target_person_id else r.source_person_id end
        order by
          case when r.status = 'approved' then 0 when r.status = 'pending' then 1 else 2 end,
          r.created_at,
          r.id
      ) as rn
    from public.person_relationships r
    where r.relation_type in ('parent', 'child')
      and r.status in ('approved', 'pending')
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)
  )
  delete from public.person_relationships r
  using candidates c
  where r.id = c.id
    and c.rn > 1;
  get diagnostics v_step_removed = row_count;
  v_removed := v_removed + v_step_removed;

  -- Spouse and sibling are symmetric; remove legacy reverse duplicates.
  with candidates as (
    select
      r.id,
      row_number() over (
        partition by
          r.relation_type,
          least(r.source_person_id::text, r.target_person_id::text),
          greatest(r.source_person_id::text, r.target_person_id::text)
        order by
          case when r.status = 'approved' then 0 when r.status = 'pending' then 1 else 2 end,
          r.created_at,
          r.id
      ) as rn
    from public.person_relationships r
    where r.relation_type in ('spouse', 'sibling')
      and r.status in ('approved', 'pending')
      and (r.source_person_id = p_person_id or r.target_person_id = p_person_id)
  )
  delete from public.person_relationships r
  using candidates c
  where r.id = c.id
    and c.rn > 1;
  get diagnostics v_step_removed = row_count;
  v_removed := v_removed + v_step_removed;

  select count(*)::integer
  into v_direct
  from public.person_relationships r
  where r.status = 'approved'
    and (r.source_person_id = p_person_id or r.target_person_id = p_person_id);

  select count(*)::integer
  into v_smart
  from public.get_person_kinship(p_person_id);

  select count(*)::integer
  into v_extended
  from public.get_person_extended_kinship(p_person_id);

  return query select v_direct, v_smart, v_extended, v_removed;
end;
$$;

revoke all on function public.resync_person_relationships(uuid) from public, anon;
grant execute on function public.resync_person_relationships(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
