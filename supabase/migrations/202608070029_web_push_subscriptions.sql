-- Web Push subscriptions for the installable Family PWA.
-- The endpoint and keys belong to the signed-in user only. Edge Functions use
-- the project secret key/service role to send notifications server-side.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  device_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions(user_id, is_active)
  where is_active = true;

alter table public.push_subscriptions enable row level security;

drop policy if exists "push subscriptions select own" on public.push_subscriptions;
create policy "push subscriptions select own"
  on public.push_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "push subscriptions insert own" on public.push_subscriptions;
create policy "push subscriptions insert own"
  on public.push_subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "push subscriptions update own" on public.push_subscriptions;
create policy "push subscriptions update own"
  on public.push_subscriptions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "push subscriptions delete own" on public.push_subscriptions;
create policy "push subscriptions delete own"
  on public.push_subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.touch_push_subscription()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.last_seen_at := now();
  return new;
end;
$$;

drop trigger if exists push_subscriptions_touch on public.push_subscriptions;
create trigger push_subscriptions_touch
before update on public.push_subscriptions
for each row execute function public.touch_push_subscription();

grant select, insert, update, delete on public.push_subscriptions to authenticated;
