-- PHASE 10: PERSON DEATH STATUS INTEGRITY
-- New/updated deceased records must include a death date. Existing historical
-- rows without a date remain readable until they are edited and completed.

begin;

alter table public.people
  drop constraint if exists people_deceased_requires_death_date;

alter table public.people
  add constraint people_deceased_requires_death_date
  check (is_deceased = false or death_date is not null)
  not valid;

comment on constraint people_deceased_requires_death_date on public.people is
  'A deceased person must have a death date. NOT VALID preserves legacy rows while enforcing future writes.';

commit;
