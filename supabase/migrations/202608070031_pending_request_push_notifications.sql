-- Notify eligible moderators when a new moderation request becomes pending.
-- Delivery is server-to-server through pg_net and an internal secret stored only
-- in the private schema. No secret is committed to GitHub.

create extension if not exists pg_net with schema extensions;

alter table private.web_push_config
  add column if not exists internal_webhook_key text;

create or replace function public.get_web_push_internal_key()
returns text
language sql
security definer
set search_path = private, public
as $$
  select c.internal_webhook_key
  from private.web_push_config c
  where c.id = 1
  limit 1;
$$;

revoke all on function public.get_web_push_internal_key() from public, anon, authenticated;
grant execute on function public.get_web_push_internal_key() to service_role;

create or replace function private.notify_pending_request_push()
returns trigger
language plpgsql
security definer
set search_path = private, public, extensions, net
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_internal_key text;
  v_status text := coalesce(v_new ->> 'status', '');
begin
  if v_status <> 'pending' then
    return new;
  end if;

  -- Do not resend when an unrelated update occurs while the record is already pending.
  if tg_op = 'UPDATE' and coalesce(v_old ->> 'status', '') = 'pending' then
    return new;
  end if;

  select c.internal_webhook_key
    into v_internal_key
  from private.web_push_config c
  where c.id = 1;

  if coalesce(v_internal_key, '') = '' then
    raise warning 'Web Push internal webhook key is not configured';
    return new;
  end if;

  perform net.http_post(
    url := 'https://rtmdaalabudycimnnena.supabase.co/functions/v1/push-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-internal-key', v_internal_key
    ),
    body := jsonb_build_object(
      'action', 'new-pending-request',
      'table', tg_table_name,
      'recordId', v_new ->> 'id'
    ),
    timeout_milliseconds := 5000
  );

  return new;
exception when others then
  -- Moderation writes must never fail just because Push delivery is unavailable.
  raise warning 'Unable to enqueue pending-request push for %.%: %', tg_table_name, v_new ->> 'id', sqlerrm;
  return new;
end;
$$;

revoke all on function private.notify_pending_request_push() from public, anon, authenticated;

create trigger families_pending_push
  after insert or update of status on public.families
  for each row execute function private.notify_pending_request_push();

create trigger people_pending_push
  after insert or update of status on public.people
  for each row execute function private.notify_pending_request_push();

create trigger events_pending_push
  after insert or update of status on public.events
  for each row execute function private.notify_pending_request_push();

create trigger relationships_pending_push
  after insert or update of status on public.person_relationships
  for each row execute function private.notify_pending_request_push();

create trigger memberships_pending_push
  after insert or update of status on public.person_family_memberships
  for each row execute function private.notify_pending_request_push();

create trigger account_links_pending_push
  after insert or update of status on public.account_link_requests
  for each row execute function private.notify_pending_request_push();

create trigger content_edits_pending_push
  after insert or update of status on public.content_edit_requests
  for each row execute function private.notify_pending_request_push();

create trigger relationship_changes_pending_push
  after insert or update of status on public.relationship_change_requests
  for each row execute function private.notify_pending_request_push();
