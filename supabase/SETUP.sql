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

commit;
notify pgrst, 'reload schema';
