-- Bootstrap exactly one primary super administrator without exposing the email
-- address as plain text in this public repository. The SHA-256 fingerprint below
-- belongs to the approved primary administrator account.

create extension if not exists pgcrypto with schema extensions;

alter table public.profiles
  add column if not exists is_primary_admin boolean not null default false;

comment on column public.profiles.is_primary_admin is
  'Marks the single protected primary administrator. Users cannot modify this field.';

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
  was_primary boolean := false;
begin
  select coalesce(p.is_primary_admin, false)
    into was_primary
  from public.profiles as p
  where p.id = new.id;

  insert into public.profiles (
    id,
    email,
    display_name,
    avatar_url,
    role,
    account_status,
    is_primary_admin
  )
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    case when is_primary then 'super_admin' else 'member' end,
    'active',
    is_primary
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    role = case
      when is_primary then 'super_admin'
      when public.profiles.is_primary_admin then 'member'
      else public.profiles.role
    end,
    account_status = case
      when is_primary then 'active'
      else public.profiles.account_status
    end,
    is_primary_admin = is_primary,
    updated_at = pg_catalog.now();

  if is_primary then
    update auth.users
    set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || pg_catalog.jsonb_build_object(
        'app_role', 'super_admin',
        'is_primary_admin', true
      )
    where id = new.id;
  elsif was_primary then
    update auth.users
    set raw_app_meta_data =
      (coalesce(raw_app_meta_data, '{}'::jsonb) - 'is_primary_admin')
      || pg_catalog.jsonb_build_object('app_role', 'member')
    where id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public;
revoke all on function private.handle_new_auth_user() from anon;
revoke all on function private.handle_new_auth_user() from authenticated;

-- Upgrade the account immediately when it already exists in auth.users.
insert into public.profiles (
  id,
  email,
  display_name,
  avatar_url,
  role,
  account_status,
  is_primary_admin
)
select
  u.id,
  u.email,
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name'
  ),
  coalesce(
    u.raw_user_meta_data ->> 'avatar_url',
    u.raw_user_meta_data ->> 'picture'
  ),
  'super_admin',
  'active',
  true
from auth.users as u
where pg_catalog.encode(
  extensions.digest(pg_catalog.lower(coalesce(u.email, '')), 'sha256'),
  'hex'
) = '55182deea52079a2f264d88e5a1a4a08c93362468bbb22d792daa777beeb530c'
on conflict (id) do update
set
  email = excluded.email,
  role = 'super_admin',
  account_status = 'active',
  is_primary_admin = true,
  updated_at = pg_catalog.now();

update auth.users as u
set raw_app_meta_data =
  coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || pg_catalog.jsonb_build_object(
    'app_role', 'super_admin',
    'is_primary_admin', true
  )
where pg_catalog.encode(
  extensions.digest(pg_catalog.lower(coalesce(u.email, '')), 'sha256'),
  'hex'
) = '55182deea52079a2f264d88e5a1a4a08c93362468bbb22d792daa777beeb530c';

-- The system may have many administrators, but only one primary administrator.
create unique index if not exists profiles_single_primary_admin_idx
  on public.profiles (is_primary_admin)
  where is_primary_admin = true;
