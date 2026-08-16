-- Every person uses one canonical storage object: <person_id>.webp.
-- New uploads use upsert on that exact key, so the latest image replaces the
-- previous content instead of reserving space for a second image.

drop policy if exists "person_photos_admin_insert" on storage.objects;
create policy "person_photos_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'person-photos'
  and name ~ '^[0-9a-fA-F-]{36}[.]webp$'
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
  and name ~ '^[0-9a-fA-F-]{36}[.]webp$'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  )
);
