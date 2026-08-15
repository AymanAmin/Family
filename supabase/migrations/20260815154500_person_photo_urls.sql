-- Person photos are stored as external HTTPS URLs only. No binary upload/storage.

alter table public.people
  add column if not exists photo_url text;

alter table public.people
  drop constraint if exists people_photo_url_https_chk;

alter table public.people
  add constraint people_photo_url_https_chk
  check (photo_url is null or photo_url ~ '^https://[^[:space:]]+$');

-- Enforce the admin-only rule even if somebody tries to update people directly
-- instead of using the helper RPC below.
create or replace function public.enforce_person_photo_admin_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if new.photo_url is not distinct from old.photo_url then
    return new;
  end if;

  -- Allow trusted SQL/service maintenance where auth.uid() is intentionally absent.
  if auth.uid() is null then
    return new;
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = auth.uid()
    and p.account_status = 'active';

  if coalesce(v_role, '') not in ('admin', 'super_admin') then
    raise exception 'Only administrators can change person photo URLs';
  end if;

  return new;
end;
$$;

drop trigger if exists people_photo_admin_only on public.people;
create trigger people_photo_admin_only
before update of photo_url on public.people
for each row
execute function public.enforce_person_photo_admin_only();

revoke all on function public.enforce_person_photo_admin_only() from public;

create or replace function public.set_person_photo_url(p_person_id uuid, p_photo_url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_photo_url text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = auth.uid()
    and p.account_status = 'active';

  if coalesce(v_role, '') not in ('admin', 'super_admin') then
    raise exception 'Only administrators can change person photo URLs';
  end if;

  v_photo_url := nullif(trim(coalesce(p_photo_url, '')), '');

  if v_photo_url is not null and v_photo_url !~ '^https://[^[:space:]]+$' then
    raise exception 'Photo URL must be a valid HTTPS URL';
  end if;

  update public.people
  set photo_url = v_photo_url,
      updated_at = now()
  where id = p_person_id
    and archived_at is null;

  if not found then
    raise exception 'Person not found';
  end if;

  return v_photo_url;
end;
$$;

revoke all on function public.set_person_photo_url(uuid, text) from public, anon;
grant execute on function public.set_person_photo_url(uuid, text) to authenticated;
