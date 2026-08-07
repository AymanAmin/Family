-- ADMIN VISITOR ANALYTICS
-- Counts unique browser visitors and total app opens without collecting IP/device fingerprints.

begin;

create table if not exists public.site_visitors (
  visitor_key uuid primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  view_count bigint not null default 1 check (view_count > 0),
  user_id uuid null references auth.users(id) on delete set null
);

create index if not exists site_visitors_last_seen_idx
  on public.site_visitors (last_seen desc);

create index if not exists site_visitors_user_id_idx
  on public.site_visitors (user_id)
  where user_id is not null;

alter table public.site_visitors enable row level security;
revoke all on table public.site_visitors from public, anon, authenticated;

create or replace function public.record_site_visit(p_visitor_key uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_visitor_key is null then
    return;
  end if;

  insert into public.site_visitors(visitor_key, first_seen, last_seen, view_count, user_id)
  values (p_visitor_key, now(), now(), 1, auth.uid())
  on conflict (visitor_key) do update
  set last_seen = now(),
      view_count = public.site_visitors.view_count + 1,
      user_id = coalesce(auth.uid(), public.site_visitors.user_id);
end;
$$;

revoke all on function public.record_site_visit(uuid) from public;
grant execute on function public.record_site_visit(uuid) to anon, authenticated;

create or replace function public.get_admin_visitor_stats()
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
    count(*)::bigint,
    coalesce(sum(v.view_count), 0)::bigint,
    count(*) filter (where v.last_seen >= now() - interval '24 hours')::bigint
  from public.site_visitors v;
end;
$$;

revoke all on function public.get_admin_visitor_stats() from public, anon;
grant execute on function public.get_admin_visitor_stats() to authenticated;

notify pgrst, 'reload schema';

commit;
