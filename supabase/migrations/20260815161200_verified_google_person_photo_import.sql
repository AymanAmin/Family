-- Allow a verified linked person to import only the photo URL supplied by their Google auth identity.

create or replace function public.enforce_person_photo_admin_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_linked_person_id uuid;
  v_google_photo text;
  v_provider text;
  v_providers jsonb;
begin
  if new.photo_url is not distinct from old.photo_url then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  select
    p.role,
    p.linked_person_id,
    nullif(trim(coalesce(u.raw_user_meta_data ->> 'picture', u.raw_user_meta_data ->> 'avatar_url', '')), ''),
    u.raw_app_meta_data ->> 'provider',
    u.raw_app_meta_data -> 'providers'
  into v_role, v_linked_person_id, v_google_photo, v_provider, v_providers
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = auth.uid()
    and p.account_status = 'active';

  if coalesce(v_role, '') in ('admin', 'super_admin') then
    return new;
  end if;

  if v_linked_person_id = old.id
     and old.is_verified = true
     and new.is_verified = true
     and new.photo_url is not null
     and new.photo_url = v_google_photo
     and (
       v_provider = 'google'
       or coalesce(v_providers, '[]'::jsonb) @> '["google"]'::jsonb
     ) then
    return new;
  end if;

  raise exception 'Only administrators or the verified linked Google account can change this person photo URL';
end;
$$;

revoke all on function public.enforce_person_photo_admin_only() from public;

create or replace function public.import_my_google_photo()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linked_person_id uuid;
  v_google_photo text;
  v_provider text;
  v_providers jsonb;
  v_is_verified boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select
    p.linked_person_id,
    nullif(trim(coalesce(u.raw_user_meta_data ->> 'picture', u.raw_user_meta_data ->> 'avatar_url', '')), ''),
    u.raw_app_meta_data ->> 'provider',
    u.raw_app_meta_data -> 'providers'
  into v_linked_person_id, v_google_photo, v_provider, v_providers
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = auth.uid()
    and p.account_status = 'active';

  if v_linked_person_id is null then
    raise exception 'Your account is not linked to a person record';
  end if;

  if not (
    v_provider = 'google'
    or coalesce(v_providers, '[]'::jsonb) @> '["google"]'::jsonb
  ) then
    raise exception 'A Google account is required';
  end if;

  if v_google_photo is null or v_google_photo !~ '^https://[^[:space:]]+$' then
    raise exception 'Google profile photo is not available';
  end if;

  select p.is_verified
  into v_is_verified
  from public.people p
  where p.id = v_linked_person_id
    and p.status = 'approved'
    and p.archived_at is null;

  if not found then
    raise exception 'Linked person record was not found';
  end if;

  if coalesce(v_is_verified, false) is not true then
    raise exception 'Linked person must be verified first';
  end if;

  update public.people
  set photo_url = v_google_photo,
      updated_at = now()
  where id = v_linked_person_id;

  return v_google_photo;
end;
$$;

revoke all on function public.import_my_google_photo() from public, anon;
grant execute on function public.import_my_google_photo() to authenticated;
