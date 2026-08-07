-- PHASE 18: ADMIN CONTRIBUTOR RANKINGS + ACCOUNT LINK INTEGRITY

begin;

create index if not exists profiles_linked_person_active_idx
  on public.profiles(linked_person_id, account_status)
  where linked_person_id is not null;
create index if not exists content_edit_requests_requester_activity_idx
  on public.content_edit_requests(requested_by, created_at desc);

create or replace function public.list_admin_contributor_stats(
  p_period_days integer default null,
  p_limit integer default 12,
  p_offset integer default 0
)
returns table(
  user_id uuid,
  display_name text,
  email text,
  role text,
  total_contributions bigint,
  approved_contributions bigint,
  pending_contributions bigint,
  rejected_contributions bigint,
  people_count bigint,
  families_count bigint,
  events_count bigint,
  relationships_count bigint,
  memberships_count bigint,
  edits_count bigint,
  last_contribution_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(private.active_role(auth.uid()), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 12), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_since timestamptz := case
    when p_period_days is null or p_period_days <= 0 then null
    else now() - make_interval(days => least(p_period_days, 3650))
  end;
begin
  if v_role not in ('admin','super_admin') then
    raise exception 'Administrator access required';
  end if;

  return query
  with activity as (
    select f.created_by user_id, 'family'::text kind, f.status::text status, f.created_at
    from public.families f
    where f.created_by is not null and (v_since is null or f.created_at >= v_since)

    union all
    select p.created_by, 'person', p.status::text, p.created_at
    from public.people p
    where p.created_by is not null and (v_since is null or p.created_at >= v_since)

    union all
    select e.created_by, 'event', e.status::text, e.created_at
    from public.events e
    where e.created_by is not null and (v_since is null or e.created_at >= v_since)

    union all
    select r.created_by, 'relationship', r.status::text, r.created_at
    from public.person_relationships r
    where r.created_by is not null and (v_since is null or r.created_at >= v_since)

    union all
    select m.created_by, 'membership', m.status::text, m.created_at
    from public.person_family_memberships m
    where m.created_by is not null and (v_since is null or m.created_at >= v_since)

    union all
    select c.requested_by, 'edit', c.status::text, c.created_at
    from public.content_edit_requests c
    where c.requested_by is not null and (v_since is null or c.created_at >= v_since)
  ), ranked as (
    select
      a.user_id,
      count(*)::bigint total_contributions,
      count(*) filter (where a.status='approved')::bigint approved_contributions,
      count(*) filter (where a.status='pending')::bigint pending_contributions,
      count(*) filter (where a.status='rejected')::bigint rejected_contributions,
      count(*) filter (where a.kind='person')::bigint people_count,
      count(*) filter (where a.kind='family')::bigint families_count,
      count(*) filter (where a.kind='event')::bigint events_count,
      count(*) filter (where a.kind='relationship')::bigint relationships_count,
      count(*) filter (where a.kind='membership')::bigint memberships_count,
      count(*) filter (where a.kind='edit')::bigint edits_count,
      max(a.created_at) last_contribution_at
    from activity a
    group by a.user_id
  )
  select
    r.user_id,
    coalesce(nullif(p.display_name,''), nullif(p.email,''), 'مستخدم مسجل')::text,
    p.email::text,
    coalesce(p.role,'member')::text,
    r.total_contributions,
    r.approved_contributions,
    r.pending_contributions,
    r.rejected_contributions,
    r.people_count,
    r.families_count,
    r.events_count,
    r.relationships_count,
    r.memberships_count,
    r.edits_count,
    r.last_contribution_at
  from ranked r
  join public.profiles p on p.id=r.user_id
  order by r.approved_contributions desc, r.total_contributions desc, r.last_contribution_at desc, r.user_id
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.list_admin_contributor_stats(integer,integer,integer) from public, anon;
grant execute on function public.list_admin_contributor_stats(integer,integer,integer) to authenticated;

create or replace function public.get_admin_contribution_overview(p_period_days integer default null)
returns table(
  total_contributions bigint,
  active_contributors bigint,
  approved_contributions bigint,
  pending_contributions bigint,
  rejected_contributions bigint,
  duplicate_linked_people bigint,
  duplicate_linked_accounts bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(private.active_role(auth.uid()), '');
  v_since timestamptz := case
    when p_period_days is null or p_period_days <= 0 then null
    else now() - make_interval(days => least(p_period_days, 3650))
  end;
begin
  if v_role not in ('admin','super_admin') then
    raise exception 'Administrator access required';
  end if;

  return query
  with activity as (
    select f.created_by user_id, f.status::text status, f.created_at from public.families f where f.created_by is not null and (v_since is null or f.created_at >= v_since)
    union all select p.created_by, p.status::text, p.created_at from public.people p where p.created_by is not null and (v_since is null or p.created_at >= v_since)
    union all select e.created_by, e.status::text, e.created_at from public.events e where e.created_by is not null and (v_since is null or e.created_at >= v_since)
    union all select r.created_by, r.status::text, r.created_at from public.person_relationships r where r.created_by is not null and (v_since is null or r.created_at >= v_since)
    union all select m.created_by, m.status::text, m.created_at from public.person_family_memberships m where m.created_by is not null and (v_since is null or m.created_at >= v_since)
    union all select c.requested_by, c.status::text, c.created_at from public.content_edit_requests c where c.requested_by is not null and (v_since is null or c.created_at >= v_since)
  ), duplicate_people as (
    select pr.linked_person_id, count(*)::bigint account_count
    from public.profiles pr
    where pr.linked_person_id is not null and pr.account_status='active'
    group by pr.linked_person_id
    having count(*) > 1
  )
  select
    count(*)::bigint,
    count(distinct a.user_id)::bigint,
    count(*) filter (where a.status='approved')::bigint,
    count(*) filter (where a.status='pending')::bigint,
    count(*) filter (where a.status='rejected')::bigint,
    (select count(*)::bigint from duplicate_people),
    (select coalesce(sum(dp.account_count),0)::bigint from duplicate_people dp)
  from activity a;
end;
$$;

revoke all on function public.get_admin_contribution_overview(integer) from public, anon;
grant execute on function public.get_admin_contribution_overview(integer) to authenticated;

notify pgrst, 'reload schema';

commit;
