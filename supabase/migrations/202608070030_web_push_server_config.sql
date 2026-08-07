-- Server-side Web Push configuration.
-- The actual VAPID private key is intentionally NOT stored in this migration
-- or in GitHub. It is inserted directly into the private schema on deployment.

create table if not exists private.web_push_config (
  id smallint primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  subject text not null default 'mailto:admin@family.local',
  updated_at timestamptz not null default now()
);

alter table private.web_push_config enable row level security;

revoke all on table private.web_push_config from public, anon, authenticated;

create or replace function public.get_web_push_server_config()
returns table(public_key text, private_key text, subject text)
language sql
security definer
set search_path = private, public
as $$
  select c.public_key, c.private_key, c.subject
  from private.web_push_config c
  where c.id = 1
  limit 1;
$$;

revoke all on function public.get_web_push_server_config() from public, anon, authenticated;
grant execute on function public.get_web_push_server_config() to service_role;
