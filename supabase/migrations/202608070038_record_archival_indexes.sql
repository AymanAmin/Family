-- Cover the archive actor foreign keys added by migration 037.

create index if not exists families_archived_by_idx
  on public.families (archived_by)
  where archived_by is not null;

create index if not exists people_archived_by_idx
  on public.people (archived_by)
  where archived_by is not null;
