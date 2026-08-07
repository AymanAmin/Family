-- PHASE 6: PUBLIC-SCALE PERFORMANCE FOUNDATION
-- Fast public search, relationship traversal and O(1) homepage statistics.

begin;

create extension if not exists pg_trgm with schema extensions;

-- Trigram indexes keep ILIKE '%term%' responsive as the public directory grows.
create index if not exists people_approved_full_name_trgm_idx
  on public.people using gin (full_name extensions.gin_trgm_ops)
  where status = 'approved';

create index if not exists families_approved_name_trgm_idx
  on public.families using gin (name extensions.gin_trgm_ops)
  where status = 'approved';

-- Common public-list filters and sort paths.
create index if not exists people_approved_created_at_idx
  on public.people (created_at desc)
  where status = 'approved';

create index if not exists families_approved_created_at_idx
  on public.families (created_at desc)
  where status = 'approved';

create index if not exists events_approved_event_date_idx
  on public.events (event_date desc nulls last)
  where status = 'approved';

create index if not exists people_approved_family_idx
  on public.people (family_id, created_at desc)
  where status = 'approved';

create index if not exists family_memberships_approved_family_idx
  on public.person_family_memberships (family_id, is_primary desc, created_at desc)
  where status = 'approved';

create index if not exists family_memberships_approved_person_idx
  on public.person_family_memberships (person_id, is_primary desc)
  where status = 'approved';

-- Kinship traversal indexes. These are critical because inferred relationships walk both directions.
create index if not exists person_relationships_approved_source_idx
  on public.person_relationships (source_person_id, relation_type, target_person_id)
  where status = 'approved';

create index if not exists person_relationships_approved_target_idx
  on public.person_relationships (target_person_id, relation_type, source_person_id)
  where status = 'approved';

create index if not exists person_relationships_pending_created_idx
  on public.person_relationships (created_at)
  where status = 'pending';

create index if not exists account_link_requests_user_status_idx
  on public.account_link_requests (user_id, status, created_at desc);

-- Public counters are maintained incrementally so every visitor does not execute COUNT(*) scans.
create table if not exists public.platform_stats (
  id smallint primary key default 1 check (id = 1),
  approved_families bigint not null default 0,
  approved_people bigint not null default 0,
  approved_events bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.platform_stats (id, approved_families, approved_people, approved_events, updated_at)
values (
  1,
  (select count(*) from public.families where status = 'approved'),
  (select count(*) from public.people where status = 'approved'),
  (select count(*) from public.events where status = 'approved'),
  now()
)
on conflict (id) do update set
  approved_families = excluded.approved_families,
  approved_people = excluded.approved_people,
  approved_events = excluded.approved_events,
  updated_at = now();

alter table public.platform_stats enable row level security;

drop policy if exists "Public can read platform stats" on public.platform_stats;
create policy "Public can read platform stats"
  on public.platform_stats
  for select
  to anon, authenticated
  using (true);

create or replace function public.refresh_platform_stats_delta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_approved boolean := false;
  new_approved boolean := false;
  delta bigint := 0;
begin
  if tg_op <> 'INSERT' then
    old_approved := coalesce(old.status = 'approved', false);
  end if;
  if tg_op <> 'DELETE' then
    new_approved := coalesce(new.status = 'approved', false);
  end if;

  delta := (case when new_approved then 1 else 0 end) - (case when old_approved then 1 else 0 end);

  if delta = 0 then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'families' then
    update public.platform_stats
      set approved_families = greatest(0, approved_families + delta), updated_at = now()
      where id = 1;
  elsif tg_table_name = 'people' then
    update public.platform_stats
      set approved_people = greatest(0, approved_people + delta), updated_at = now()
      where id = 1;
  elsif tg_table_name = 'events' then
    update public.platform_stats
      set approved_events = greatest(0, approved_events + delta), updated_at = now()
      where id = 1;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_platform_stats_families on public.families;
create trigger trg_platform_stats_families
after insert or update of status or delete on public.families
for each row execute function public.refresh_platform_stats_delta();

drop trigger if exists trg_platform_stats_people on public.people;
create trigger trg_platform_stats_people
after insert or update of status or delete on public.people
for each row execute function public.refresh_platform_stats_delta();

drop trigger if exists trg_platform_stats_events on public.events;
create trigger trg_platform_stats_events
after insert or update of status or delete on public.events
for each row execute function public.refresh_platform_stats_delta();

create or replace function public.get_public_platform_stats()
returns table (
  approved_families bigint,
  approved_people bigint,
  approved_events bigint,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.approved_families, s.approved_people, s.approved_events, s.updated_at
  from public.platform_stats s
  where s.id = 1;
$$;

grant execute on function public.get_public_platform_stats() to anon, authenticated;

notify pgrst, 'reload schema';

commit;
