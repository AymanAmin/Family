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
  select distinct on (c.related_person_id, c.relation_type)
    c.id as related_person_id,
    c.full_name,
    c.gender,
    c.relation_type,
    c.relation_detail,
    c.is_inferred,
    c.shared_parent_count
  from combined c
  where c.id <> p_person_id
  order by c.related_person_id, c.relation_type, c.is_inferred asc,
           c.shared_parent_count desc nulls last;
$$;

revoke all on function public.get_person_kinship(uuid) from public;
grant execute on function public.get_person_kinship(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

