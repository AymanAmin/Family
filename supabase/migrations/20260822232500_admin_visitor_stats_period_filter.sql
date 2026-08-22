-- ADMIN VISITOR STATS PERIOD FILTER
-- Keeps the existing visitor tracker but lets admin dashboards request a matching time window.

begin;

drop function if exists public.get_admin_visitor_stats();

create function public.get_admin_visitor_stats(p_period_days integer default null)
returns table (
  unique_visitors bigint,
  total_views bigint,
  visitors_24h bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := case
    when p_period_days is null or p_period_days <= 0 then null
    else now() - make_interval(days => least(p_period_days, 3650))
  end;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  ) then
    raise exception 'Not authorized to view visitor analytics';
  end if;

  return query
  select
    count(*) filter (where v_since is null or v.last_seen >= v_since)::bigint,
    coalesce(sum(v.view_count), 0)::bigint,
    count(*) filter (where v.last_seen >= now() - interval '24 hours')::bigint
  from public.site_visitors v;
end;
$$;

revoke all on function public.get_admin_visitor_stats(integer) from public, anon;
grant execute on function public.get_admin_visitor_stats(integer) to authenticated;

notify pgrst, 'reload schema';

commit;
