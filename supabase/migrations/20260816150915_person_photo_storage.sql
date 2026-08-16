-- Store administrator-managed person profile photos in Supabase Storage.
-- The UI compresses every uploaded photo to <= 50 KiB before upload, and the
-- bucket repeats the same limit server-side so an oversized file cannot bypass it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'person-photos',
  'person-photos',
  true,
  51200,
  array['image/webp', 'image/jpeg']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "person_photos_admin_select" on storage.objects;
create policy "person_photos_admin_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'person-photos'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

drop policy if exists "person_photos_admin_insert" on storage.objects;
create policy "person_photos_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'person-photos'
  and name ~ '^[0-9a-fA-F-]{36}\\.(webp|jpg|jpeg)$'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

drop policy if exists "person_photos_admin_update" on storage.objects;
create policy "person_photos_admin_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'person-photos'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
)
with check (
  bucket_id = 'person-photos'
  and name ~ '^[0-9a-fA-F-]{36}\\.(webp|jpg|jpeg)$'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);

drop policy if exists "person_photos_admin_delete" on storage.objects;
create policy "person_photos_admin_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'person-photos'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);
