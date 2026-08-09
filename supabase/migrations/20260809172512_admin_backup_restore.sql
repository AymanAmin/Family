create or replace function public.admin_restore_family_backup(p_snapshot jsonb, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_tables jsonb := p_snapshot -> 'tables';
  v_counts jsonb := p_snapshot -> 'row_counts';
  v_required_tables text[] := array[
    'families','people','person_relationships','person_family_memberships','family_units','lineages','lineage_branches','person_scope_affiliations','events','event_people','account_link_requests','content_edit_requests','relationship_change_requests','family_moderator_assignments','moderator_scope_assignments','profiles','push_subscriptions','platform_stats','site_visitors'
  ];
  v_table text;
  v_actual_total bigint := 0;
  v_expected_total bigint;
  v_expected_table_count bigint;
begin
  if p_actor is null or not exists (
    select 1 from public.profiles
    where id = p_actor
      and is_primary_admin = true
      and role = 'super_admin'
      and account_status = 'active'
  ) then
    raise exception 'Primary administrator permission is required.' using errcode = '42501';
  end if;

  if coalesce((p_snapshot ->> 'backup_version')::int, 0) <> 1 then
    raise exception 'Unsupported backup version.';
  end if;

  if p_snapshot ->> 'project_ref' <> 'rtmdaalabudycimnnena' then
    raise exception 'Backup belongs to a different Supabase project.';
  end if;

  if p_snapshot ->> 'scope' <> 'public_application_data' or jsonb_typeof(v_tables) <> 'object' then
    raise exception 'Invalid Family backup snapshot.';
  end if;

  if (select count(*) from jsonb_object_keys(v_tables)) <> array_length(v_required_tables, 1) then
    raise exception 'Backup table set does not match this application version.';
  end if;

  foreach v_table in array v_required_tables loop
    if jsonb_typeof(v_tables -> v_table) <> 'array' then
      raise exception 'Missing or invalid backup table: %', v_table;
    end if;

    v_actual_total := v_actual_total + jsonb_array_length(v_tables -> v_table);

    if jsonb_typeof(v_counts) = 'object' and v_counts ? v_table then
      v_expected_table_count := nullif(v_counts ->> v_table, '')::bigint;
      if v_expected_table_count is distinct from jsonb_array_length(v_tables -> v_table) then
        raise exception 'Backup row count validation failed for table: %', v_table;
      end if;
    end if;
  end loop;

  v_expected_total := nullif(p_snapshot ->> 'total_rows', '')::bigint;
  if v_expected_total is not null and v_expected_total <> v_actual_total then
    raise exception 'Backup total row count validation failed.';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(v_tables -> 'profiles') as p
    where p ->> 'id' = p_actor::text
      and coalesce((p ->> 'is_primary_admin')::boolean, false) = true
      and p ->> 'role' = 'super_admin'
      and p ->> 'account_status' = 'active'
  ) then
    raise exception 'Backup would remove the current primary administrator.';
  end if;

  foreach v_table in array v_required_tables loop
    execute format('alter table public.%I disable trigger user', v_table);
  end loop;

  delete from public.event_people;
  delete from public.account_link_requests;
  delete from public.content_edit_requests;
  delete from public.relationship_change_requests;
  delete from public.family_moderator_assignments;
  delete from public.moderator_scope_assignments;
  delete from public.person_scope_affiliations;
  delete from public.lineage_branches;
  delete from public.lineages;
  delete from public.family_units;
  delete from public.person_family_memberships;
  delete from public.person_relationships;
  delete from public.events;
  delete from public.push_subscriptions;
  delete from public.profiles;
  delete from public.people;
  delete from public.families;
  delete from public.platform_stats;
  delete from public.site_visitors;

  insert into public.families select * from jsonb_populate_recordset(null::public.families, v_tables -> 'families');
  insert into public.people select * from jsonb_populate_recordset(null::public.people, v_tables -> 'people');
  insert into public.person_relationships select * from jsonb_populate_recordset(null::public.person_relationships, v_tables -> 'person_relationships');
  insert into public.person_family_memberships select * from jsonb_populate_recordset(null::public.person_family_memberships, v_tables -> 'person_family_memberships');
  insert into public.family_units select * from jsonb_populate_recordset(null::public.family_units, v_tables -> 'family_units');
  insert into public.lineages select * from jsonb_populate_recordset(null::public.lineages, v_tables -> 'lineages');
  insert into public.lineage_branches select * from jsonb_populate_recordset(null::public.lineage_branches, v_tables -> 'lineage_branches');
  insert into public.person_scope_affiliations select * from jsonb_populate_recordset(null::public.person_scope_affiliations, v_tables -> 'person_scope_affiliations');
  insert into public.events select * from jsonb_populate_recordset(null::public.events, v_tables -> 'events');
  insert into public.event_people select * from jsonb_populate_recordset(null::public.event_people, v_tables -> 'event_people');
  insert into public.account_link_requests select * from jsonb_populate_recordset(null::public.account_link_requests, v_tables -> 'account_link_requests');
  insert into public.content_edit_requests select * from jsonb_populate_recordset(null::public.content_edit_requests, v_tables -> 'content_edit_requests');
  insert into public.relationship_change_requests select * from jsonb_populate_recordset(null::public.relationship_change_requests, v_tables -> 'relationship_change_requests');
  insert into public.profiles select * from jsonb_populate_recordset(null::public.profiles, v_tables -> 'profiles');
  insert into public.family_moderator_assignments select * from jsonb_populate_recordset(null::public.family_moderator_assignments, v_tables -> 'family_moderator_assignments');
  insert into public.moderator_scope_assignments select * from jsonb_populate_recordset(null::public.moderator_scope_assignments, v_tables -> 'moderator_scope_assignments');
  insert into public.push_subscriptions select * from jsonb_populate_recordset(null::public.push_subscriptions, v_tables -> 'push_subscriptions');
  insert into public.platform_stats select * from jsonb_populate_recordset(null::public.platform_stats, v_tables -> 'platform_stats');
  insert into public.site_visitors select * from jsonb_populate_recordset(null::public.site_visitors, v_tables -> 'site_visitors');

  if exists (select 1 from public.people p left join public.families f on f.id = p.family_id where p.family_id is not null and f.id is null)
    or exists (select 1 from public.person_relationships r left join public.people s on s.id = r.source_person_id left join public.people t on t.id = r.target_person_id where s.id is null or t.id is null)
    or exists (select 1 from public.person_family_memberships m left join public.people p on p.id = m.person_id left join public.families f on f.id = m.family_id where p.id is null or f.id is null)
    or exists (select 1 from public.family_units u left join public.people h on h.id = u.husband_person_id left join public.people w on w.id = u.wife_person_id left join public.families f on f.id = u.legacy_family_id where (u.husband_person_id is not null and h.id is null) or (u.wife_person_id is not null and w.id is null) or (u.legacy_family_id is not null and f.id is null))
    or exists (select 1 from public.lineages l left join public.people r on r.id = l.root_person_id left join public.people a on a.id = l.anchor_person_id where (l.root_person_id is not null and r.id is null) or (l.anchor_person_id is not null and a.id is null))
    or exists (select 1 from public.lineage_branches b left join public.lineages l on l.id = b.lineage_id left join public.people p on p.id = b.branch_person_id where l.id is null or p.id is null)
    or exists (select 1 from public.person_scope_affiliations a left join public.people p on p.id = a.person_id left join public.person_family_memberships m on m.id = a.legacy_membership_id where p.id is null or (a.legacy_membership_id is not null and m.id is null))
    or exists (select 1 from public.events e left join public.families f on f.id = e.family_id where e.family_id is not null and f.id is null)
    or exists (select 1 from public.event_people ep left join public.events e on e.id = ep.event_id left join public.people p on p.id = ep.person_id where e.id is null or p.id is null)
    or exists (select 1 from public.account_link_requests a left join public.people p on p.id = a.person_id where p.id is null)
    or exists (select 1 from public.family_moderator_assignments a left join public.profiles p on p.id = a.user_id left join public.families f on f.id = a.family_id where p.id is null or f.id is null)
    or exists (select 1 from public.moderator_scope_assignments a left join public.profiles u on u.id = a.user_id left join public.profiles b on b.id = a.assigned_by where u.id is null or (a.assigned_by is not null and b.id is null))
    or exists (select 1 from public.profiles p left join public.people pe on pe.id = p.linked_person_id where p.linked_person_id is not null and pe.id is null)
    or exists (select 1 from public.relationship_change_requests r left join public.person_relationships pr on pr.id = r.relationship_id left join public.people s on s.id = r.source_person_id left join public.people t on t.id = r.target_person_id where (r.relationship_id is not null and pr.id is null) or (r.source_person_id is not null and s.id is null) or (r.target_person_id is not null and t.id is null))
  then
    raise exception 'Restored backup failed relationship integrity validation.';
  end if;

  foreach v_table in array v_required_tables loop
    execute format('alter table public.%I enable trigger user', v_table);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'restored_at', now(),
    'table_count', array_length(v_required_tables, 1),
    'total_rows', v_actual_total
  );
end;
$function$;

revoke all on function public.admin_restore_family_backup(jsonb, uuid) from public;
revoke all on function public.admin_restore_family_backup(jsonb, uuid) from anon;
revoke all on function public.admin_restore_family_backup(jsonb, uuid) from authenticated;
grant execute on function public.admin_restore_family_backup(jsonb, uuid) to service_role;
