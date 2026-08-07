-- PHASE 20: ADMIN CONTRIBUTOR ACTIVITY STATISTICS
-- Server-side aggregates for the admin dashboard. Designed to stay fast as the community grows.

begin;

create or replace function public.get_admin_contribution_summary(
  p_days integer default 30
)
returns table (
  active_contributors bigint,
  total_contributions bigint,
  approved_contributions bigint,
  pending_contributions bigint,
  rejected_contributions bigint,
  families_count bigint,
  people_count bigint,
  events_count bigint,
  relationships_count bigint,
  memberships_count bigint,
  edit_requests_count bigint,
  reviews_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(0, coalesce(p_days, 30));
  v_since timestamptz := case when greatest(0, coalesce(p_days, 30)) = 0 then '-infinity'::timestamptz else now() - make_interval(days => greatest(0, coalesce(p_days, 30))) end;
begin
  if coalesce(private.active_role(auth.uid()), '') not in ('admin','super_admin') then
    raise exception 'Not authorized';
  end if;

  return query
  with contributions as (
    select f.created_by user_id, 'family'::text kind, f.status::text status, f.created_at from public.families f where f.created_at >= v_since
    union all
    select p.created_by, 'person', p.status::text, p.created_at from public.people p where p.created_at >= v_since
    union all
    select e.created_by, 'event', e.status::text, e.created_at from public.events e where e.created_at >= v_since
    union all
    select r.created_by, 'relationship', r.status::text, r.created_at from public.person_relationships r where r.created_at >= v_since
    union all
    select m.created_by, 'membership', m.status::text, m.created_at from public.person_family_memberships m where m.created_at >= v_since
    union all
    select q.requested_by, 'edit', q.status::text, q.created_at from public.content_edit_requests q where q.created_at >= v_since
    union all
    select q.requested_by, 'edit', q.status::text, q.created_at from public.relationship_change_requests q where q.created_at >= v_since
  ),
  reviews as (
    select f.approved_by user_id, f.approved_at reviewed_at from public.families f where f.approved_by is not null and f.approved_at >= v_since
    union all
    select p.approved_by, p.approved_at from public.people p where p.approved_by is not null and p.approved_at >= v_since
    union all
    select e.approved_by, e.approved_at from public.events e where e.approved_by is not null and e.approved_at >= v_since
    union all
    select r.approved_by, r.approved_at from public.person_relationships r where r.approved_by is not null and r.approved_at >= v_since
    union all
    select m.approved_by, m.approved_at from public.person_family_memberships m where m.approved_by is not null and m.approved_at >= v_since
    union all
    select q.reviewed_by, q.reviewed_at from public.content_edit_requests q where q.reviewed_by is not null and q.reviewed_at >= v_since
    union all
    select q.reviewed_by, q.reviewed_at from public.account_link_requests q where q.reviewed_by is not null and q.reviewed_at >= v_since
    union all
    select q.reviewed_by, q.reviewed_at from public.relationship_change_requests q where q.reviewed_by is not null and q.reviewed_at >= v_since
  )
  select
    count(distinct c.user_id)::bigint,
    count(*)::bigint,
    count(*) filter (where c.status='approved')::bigint,
    count(*) filter (where c.status='pending')::bigint,
    count(*) filter (where c.status='rejected')::bigint,
    count(*) filter (where c.kind='family')::bigint,
    count(*) filter (where c.kind='person')::bigint,
    count(*) filter (where c.kind='event')::bigint,
    count(*) filter (where c.kind='relationship')::bigint,
    count(*) filter (where c.kind='membership')::bigint,
    count(*) filter (where c.kind='edit')::bigint,
    (select count(*)::bigint from reviews)
  from contributions c;
end;
$$;

revoke all on function public.get_admin_contribution_summary(integer) from public, anon;
grant execute on function public.get_admin_contribution_summary(integer) to authenticated;

create or replace function public.list_admin_contributor_stats(
  p_days integer default 30,
  p_limit integer default 15
)
returns table (
  user_id uuid,
  display_name text,
  email text,
  role text,
  total_contributions bigint,
  approved_contributions bigint,
  pending_contributions bigint,
  rejected_contributions bigint,
  families_count bigint,
  people_count bigint,
  events_count bigint,
  relationships_count bigint,
  memberships_count bigint,
  edit_requests_count bigint,
  reviews_count bigint,
  approval_rate numeric,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(0, coalesce(p_days, 30));
  v_limit integer := greatest(1, least(coalesce(p_limit, 15), 50));
  v_since timestamptz := case when greatest(0, coalesce(p_days, 30)) = 0 then '-infinity'::timestamptz else now() - make_interval(days => greatest(0, coalesce(p_days, 30))) end;
begin
  if coalesce(private.active_role(auth.uid()), '') not in ('admin','super_admin') then
    raise exception 'Not authorized';
  end if;

  return query
  with contributions as (
    select f.created_by user_id, 'family'::text kind, f.status::text status, f.created_at from public.families f where f.created_at >= v_since
    union all
    select p.created_by, 'person', p.status::text, p.created_at from public.people p where p.created_at >= v_since
    union all
    select e.created_by, 'event', e.status::text, e.created_at from public.events e where e.created_at >= v_since
    union all
    select r.created_by, 'relationship', r.status::text, r.created_at from public.person_relationships r where r.created_at >= v_since
    union all
    select m.created_by, 'membership', m.status::text, m.created_at from public.person_family_memberships m where m.created_at >= v_since
    union all
    select q.requested_by, 'edit', q.status::text, q.created_at from public.content_edit_requests q where q.created_at >= v_since
    union all
    select q.requested_by, 'edit', q.status::text, q.created_at from public.relationship_change_requests q where q.created_at >= v_since
  ),
  review_activity as (
    select x.user_id, count(*)::bigint reviews_count
    from (
      select f.approved_by user_id from public.families f where f.approved_by is not null and f.approved_at >= v_since
      union all select p.approved_by from public.people p where p.approved_by is not null and p.approved_at >= v_since
      union all select e.approved_by from public.events e where e.approved_by is not null and e.approved_at >= v_since
      union all select r.approved_by from public.person_relationships r where r.approved_by is not null and r.approved_at >= v_since
      union all select m.approved_by from public.person_family_memberships m where m.approved_by is not null and m.approved_at >= v_since
      union all select q.reviewed_by from public.content_edit_requests q where q.reviewed_by is not null and q.reviewed_at >= v_since
      union all select q.reviewed_by from public.account_link_requests q where q.reviewed_by is not null and q.reviewed_at >= v_since
      union all select q.reviewed_by from public.relationship_change_requests q where q.reviewed_by is not null and q.reviewed_at >= v_since
    ) x
    group by x.user_id
  ),
  grouped as (
    select
      c.user_id,
      count(*)::bigint total_contributions,
      count(*) filter (where c.status='approved')::bigint approved_contributions,
      count(*) filter (where c.status='pending')::bigint pending_contributions,
      count(*) filter (where c.status='rejected')::bigint rejected_contributions,
      count(*) filter (where c.kind='family')::bigint families_count,
      count(*) filter (where c.kind='person')::bigint people_count,
      count(*) filter (where c.kind='event')::bigint events_count,
      count(*) filter (where c.kind='relationship')::bigint relationships_count,
      count(*) filter (where c.kind='membership')::bigint memberships_count,
      count(*) filter (where c.kind='edit')::bigint edit_requests_count,
      max(c.created_at) last_activity_at
    from contributions c
    group by c.user_id
  )
  select
    g.user_id,
    coalesce(nullif(p.display_name,''), split_part(coalesce(p.email,''),'@',1), 'مستخدم')::text,
    p.email::text,
    p.role::text,
    g.total_contributions,
    g.approved_contributions,
    g.pending_contributions,
    g.rejected_contributions,
    g.families_count,
    g.people_count,
    g.events_count,
    g.relationships_count,
    g.memberships_count,
    g.edit_requests_count,
    coalesce(r.reviews_count,0)::bigint,
    case when g.total_contributions=0 then 0::numeric else round((g.approved_contributions::numeric * 100) / g.total_contributions, 1) end,
    g.last_activity_at
  from grouped g
  left join public.profiles p on p.id=g.user_id
  left join review_activity r on r.user_id=g.user_id
  order by g.total_contributions desc, g.approved_contributions desc, g.last_activity_at desc
  limit v_limit;
end;
$$;

revoke all on function public.list_admin_contributor_stats(integer, integer) from public, anon;
grant execute on function public.list_admin_contributor_stats(integer, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
