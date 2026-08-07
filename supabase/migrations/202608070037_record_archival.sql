-- Safe deletion for family/person records.
-- Records are archived instead of physically deleted so genealogy history and dependent rows are preserved.

begin;

alter table public.families
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text;

alter table public.people
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text;

alter table public.families drop constraint if exists families_status_check;
alter table public.families
  add constraint families_status_check
  check (status in ('pending', 'approved', 'rejected', 'archived'));

alter table public.people drop constraint if exists people_status_check;
alter table public.people
  add constraint people_status_check
  check (status in ('pending', 'approved', 'rejected', 'archived'));

create schema if not exists private;

create table if not exists private.community_record_archive_audit (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('families', 'people')),
  record_id uuid not null,
  record_label text not null,
  previous_status text not null,
  reason text,
  archived_by uuid not null,
  archived_at timestamptz not null default now()
);

revoke all on table private.community_record_archive_audit from public, anon, authenticated;

create index if not exists community_record_archive_audit_record_idx
  on private.community_record_archive_audit (entity_type, record_id, archived_at desc);

-- Archived records are hidden from every normal browser query, including administrator reads.
drop policy if exists "Members can read approved or own families" on public.families;
create policy "Members can read approved or own families"
on public.families for select to authenticated
using (
  status <> 'archived'
  and (
    status = 'approved'
    or created_by = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.account_status = 'active'
        and p.role in ('admin', 'super_admin')
    )
  )
);

drop policy if exists "Members can read approved or own people" on public.people;
create policy "Members can read approved or own people"
on public.people for select to authenticated
using (
  status <> 'archived'
  and (
    status = 'approved'
    or created_by = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.account_status = 'active'
        and p.role in ('admin', 'super_admin')
    )
  )
);

create or replace function public.archive_community_record(
  p_entity_type text,
  p_record_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_label text;
  v_previous_status text;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
begin
  if v_actor is null or not exists (
    select 1
    from public.profiles p
    where p.id = v_actor
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  ) then
    raise exception 'Not authorized to archive community records';
  end if;

  if p_entity_type = 'families' then
    select f.name, f.status
      into v_label, v_previous_status
    from public.families f
    where f.id = p_record_id
      and f.status <> 'archived'
    for update;

    if not found then
      raise exception 'Family not found or already archived';
    end if;

    update public.families
    set status = 'archived',
        archived_at = now(),
        archived_by = v_actor,
        archive_reason = v_reason,
        updated_at = now()
    where id = p_record_id;

  elsif p_entity_type = 'people' then
    select p.full_name, p.status
      into v_label, v_previous_status
    from public.people p
    where p.id = p_record_id
      and p.status <> 'archived'
    for update;

    if not found then
      raise exception 'Person not found or already archived';
    end if;

    if exists (
      select 1 from public.profiles p
      where p.linked_person_id = p_record_id
        and p.account_status = 'active'
    ) then
      raise exception 'Cannot archive a person linked to an active user account';
    end if;

    update public.people
    set status = 'archived',
        archived_at = now(),
        archived_by = v_actor,
        archive_reason = v_reason,
        updated_at = now()
    where id = p_record_id;

  else
    raise exception 'Unsupported entity type';
  end if;

  insert into private.community_record_archive_audit(
    entity_type, record_id, record_label, previous_status, reason, archived_by
  ) values (
    p_entity_type, p_record_id, v_label, v_previous_status, v_reason, v_actor
  );
end;
$$;

revoke all on function public.archive_community_record(text, uuid, text) from public, anon;
grant execute on function public.archive_community_record(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
