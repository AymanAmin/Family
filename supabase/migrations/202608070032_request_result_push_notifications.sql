-- Notify the original requester when a moderation request is approved or rejected.
-- Delivery is server-to-server and never blocks the moderation write if Push fails.

create or replace function private.notify_request_result_push()
returns trigger
language plpgsql
security definer
set search_path = private, public, extensions, net
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
  v_internal_key text;
  v_status text := coalesce(v_new ->> 'status', '');
  v_requester_id text;
  v_request_type text;
  v_label text;
begin
  if v_status not in ('approved', 'rejected') then
    return new;
  end if;

  if coalesce(v_old ->> 'status', '') = v_status then
    return new;
  end if;

  v_requester_id := coalesce(
    nullif(v_new ->> 'created_by', ''),
    nullif(v_new ->> 'requested_by', ''),
    nullif(v_new ->> 'user_id', '')
  );

  if coalesce(v_requester_id, '') = '' then
    return new;
  end if;

  v_request_type := case tg_table_name
    when 'families' then 'إضافة عائلة'
    when 'people' then 'إضافة شخص'
    when 'events' then 'إضافة مناسبة'
    when 'person_relationships' then 'إضافة صلة قرابة'
    when 'person_family_memberships' then 'عضوية عائلة'
    when 'account_link_requests' then 'ربط الحساب'
    when 'content_edit_requests' then 'تعديل البيانات'
    when 'relationship_change_requests' then 'تعديل صلة القرابة'
    else 'طلب'
  end;

  v_label := coalesce(
    nullif(v_new ->> 'full_name', ''),
    nullif(v_new ->> 'name', ''),
    nullif(v_new ->> 'title', ''),
    nullif(v_new ->> 'source_name', ''),
    ''
  );

  select c.internal_webhook_key
    into v_internal_key
  from private.web_push_config c
  where c.id = 1;

  if coalesce(v_internal_key, '') = '' then
    raise warning 'Web Push internal webhook key is not configured';
    return new;
  end if;

  perform net.http_post(
    url := 'https://rtmdaalabudycimnnena.supabase.co/functions/v1/push-request-result',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-internal-key', v_internal_key
    ),
    body := jsonb_build_object(
      'requesterId', v_requester_id,
      'status', v_status,
      'requestType', v_request_type,
      'label', v_label,
      'table', tg_table_name,
      'recordId', v_new ->> 'id'
    ),
    timeout_milliseconds := 5000
  );

  return new;
exception when others then
  raise warning 'Unable to enqueue request-result push for %.%: %', tg_table_name, v_new ->> 'id', sqlerrm;
  return new;
end;
$$;

revoke all on function private.notify_request_result_push() from public, anon, authenticated;

create trigger families_result_push
  after update of status on public.families
  for each row execute function private.notify_request_result_push();

create trigger people_result_push
  after update of status on public.people
  for each row execute function private.notify_request_result_push();

create trigger events_result_push
  after update of status on public.events
  for each row execute function private.notify_request_result_push();

create trigger relationships_result_push
  after update of status on public.person_relationships
  for each row execute function private.notify_request_result_push();

create trigger memberships_result_push
  after update of status on public.person_family_memberships
  for each row execute function private.notify_request_result_push();

create trigger account_links_result_push
  after update of status on public.account_link_requests
  for each row execute function private.notify_request_result_push();

create trigger content_edits_result_push
  after update of status on public.content_edit_requests
  for each row execute function private.notify_request_result_push();

create trigger relationship_changes_result_push
  after update of status on public.relationship_change_requests
  for each row execute function private.notify_request_result_push();
