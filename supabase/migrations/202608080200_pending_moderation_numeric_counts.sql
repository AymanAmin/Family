-- Clear numeric moderation counters for admin UI and notification badge.
-- Uses the same role/scope rules as the moderation feeds.

create or replace function public.get_pending_moderation_counts()
returns table (
  primary_count bigint,
  edit_count bigint,
  membership_count bigint,
  relationship_change_count bigint,
  secondary_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.active_role(auth.uid());
  v_primary bigint := 0;
  v_edits bigint := 0;
  v_memberships bigint := 0;
  v_relationship_changes bigint := 0;
begin
  if auth.uid() is null or coalesce(v_role, '') not in ('family_moderator', 'content_moderator', 'admin', 'super_admin') then
    raise exception 'Not authorized to inspect moderation counts';
  end if;

  select count(*) into v_primary
  from (
    select f.id
    from public.families f
    where f.status = 'pending'
      and (
        v_role in ('admin', 'super_admin')
        or (v_role = 'family_moderator'
            and f.created_by <> auth.uid()
            and private.has_family_moderator_scope(auth.uid(), f.id))
      )

    union all

    select p.id
    from public.people p
    where p.status = 'pending'
      and (
        v_role in ('admin', 'super_admin')
        or (v_role = 'family_moderator'
            and p.created_by <> auth.uid()
            and private.person_in_family_moderator_scope(auth.uid(), p.id))
      )

    union all

    select e.id
    from public.events e
    where e.status = 'pending'
      and (
        v_role in ('admin', 'super_admin')
        or (v_role = 'content_moderator' and e.created_by <> auth.uid())
        or (v_role = 'family_moderator'
            and e.created_by <> auth.uid()
            and private.has_family_moderator_scope(auth.uid(), e.family_id))
      )

    union all

    select r.id
    from public.person_relationships r
    where r.status = 'pending'
      and (
        v_role in ('admin', 'super_admin')
        or (v_role = 'family_moderator'
            and r.created_by <> auth.uid()
            and private.person_in_family_moderator_scope(auth.uid(), r.source_person_id)
            and private.person_in_family_moderator_scope(auth.uid(), r.target_person_id))
      )

    union all

    select l.id
    from public.account_link_requests l
    where l.status = 'pending'
      and v_role in ('admin', 'super_admin')
  ) q;

  select count(*) into v_edits
  from public.content_edit_requests e
  where e.status = 'pending'
    and (
      v_role in ('admin', 'super_admin')
      or (v_role = 'content_moderator'
          and e.requested_by <> auth.uid()
          and e.entity_type = 'events')
      or (v_role = 'family_moderator'
          and e.requested_by <> auth.uid()
          and (
            (e.entity_type = 'families' and private.has_family_moderator_scope(auth.uid(), e.record_id))
            or (e.entity_type = 'people' and private.person_in_family_moderator_scope(auth.uid(), e.record_id))
            or (e.entity_type = 'events' and exists (
              select 1 from public.events ev
              where ev.id = e.record_id
                and private.has_family_moderator_scope(auth.uid(), ev.family_id)
            ))
          ))
    );

  select count(*) into v_memberships
  from public.person_family_memberships m
  where m.status = 'pending'
    and (
      v_role in ('admin', 'super_admin')
      or (v_role = 'family_moderator'
          and m.created_by <> auth.uid()
          and private.has_family_moderator_scope(auth.uid(), m.family_id))
    );

  if v_role in ('admin', 'super_admin') then
    select count(*) into v_relationship_changes
    from public.relationship_change_requests q
    where q.status = 'pending';
  end if;

  return query
  select
    v_primary,
    v_edits,
    v_memberships,
    v_relationship_changes,
    (v_edits + v_memberships + v_relationship_changes),
    (v_primary + v_edits + v_memberships + v_relationship_changes);
end;
$$;

revoke all on function public.get_pending_moderation_counts() from public, anon;
grant execute on function public.get_pending_moderation_counts() to authenticated;

notify pgrst, 'reload schema';
