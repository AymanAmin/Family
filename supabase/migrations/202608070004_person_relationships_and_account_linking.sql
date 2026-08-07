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
