-- Allow legacy deceased-person records to omit an unknown death date.
-- A death date, when provided, is still only valid for deceased people via the
-- existing people_check constraint: death_date is null or is_deceased = true.

begin;

alter table public.people
  drop constraint if exists people_deceased_requires_death_date;

comment on column public.people.death_date is
  'Optional death date. A person may be marked deceased even when the historical death date is unknown.';

commit;
