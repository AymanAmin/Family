-- Fix the person photo Storage filename regex.
-- The previous policy escaped the literal dot twice, so valid names such as
-- <person-uuid>.webp were rejected before the upload reached Storage.

DROP POLICY IF EXISTS "person_photos_admin_insert" ON storage.objects;
CREATE POLICY "person_photos_admin_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'person-photos'
  AND name ~ '^[0-9a-fA-F-]{36}[.](webp|jpg|jpeg)$'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.account_status = 'active'
      AND p.role IN ('admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "person_photos_admin_update" ON storage.objects;
CREATE POLICY "person_photos_admin_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'person-photos'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.account_status = 'active'
      AND p.role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  bucket_id = 'person-photos'
  AND name ~ '^[0-9a-fA-F-]{36}[.](webp|jpg|jpeg)$'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.account_status = 'active'
      AND p.role IN ('admin', 'super_admin')
  )
);
