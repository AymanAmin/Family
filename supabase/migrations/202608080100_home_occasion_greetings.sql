create or replace function public.get_home_occasion_greetings()
returns table (
  event_id uuid,
  event_type text,
  title text,
  event_date date,
  day_offset integer,
  anniversary_years integer,
  person_names text[],
  family_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with date_context as (
    select (timezone('Asia/Riyadh', now()))::date as today
  ), nearby_days as (
    select
      dc.today,
      v.day_offset,
      dc.today + v.day_offset as target_date
    from date_context dc
    cross join (values (-1), (0), (1)) as v(day_offset)
  )
  select
    e.id as event_id,
    e.event_type,
    e.title,
    e.event_date,
    d.day_offset,
    (extract(year from d.target_date)::int - extract(year from e.event_date)::int) as anniversary_years,
    coalesce(names.person_names, array[]::text[]) as person_names,
    f.name as family_name
  from nearby_days d
  join public.events e
    on e.status = 'approved'
   and e.event_type in ('birth', 'wedding')
   and e.event_date is not null
   and e.event_date <= d.target_date
   and extract(month from e.event_date) = extract(month from d.target_date)
   and extract(day from e.event_date) = extract(day from d.target_date)
  left join public.families f
    on f.id = e.family_id
   and f.status = 'approved'
  left join lateral (
    select array_agg(p.full_name order by ep.sort_order, p.full_name) as person_names
    from public.event_people ep
    join public.people p
      on p.id = ep.person_id
     and p.status = 'approved'
    where ep.event_id = e.id
  ) names on true
  order by
    case d.day_offset when 0 then 0 when 1 then 1 else 2 end,
    e.event_date desc,
    e.id;
$$;

revoke all on function public.get_home_occasion_greetings() from public;
grant execute on function public.get_home_occasion_greetings() to anon, authenticated;

comment on function public.get_home_occasion_greetings() is
  'Returns approved birth and wedding anniversaries matching yesterday, today, or tomorrow in Asia/Riyadh.';
