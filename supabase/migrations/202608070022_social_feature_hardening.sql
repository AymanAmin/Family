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
