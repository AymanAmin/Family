-- PHASE 14: FAMILY-MODERATOR EVENT SCOPE GUARD
-- Even through a SECURITY DEFINER review function, a family moderator must not
-- move an event to an unassigned family (or to the global scope) while approving an edit.

begin;

create or replace function private.enforce_family_moderator_event_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(private.active_role(auth.uid()), '') = 'family_moderator'
     and new.family_id is distinct from old.family_id
     and not private.has_family_moderator_scope(auth.uid(), new.family_id) then
    raise exception 'Family moderator cannot move an event outside assigned family scope';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_family_moderator_event_scope() from public, anon, authenticated;

drop trigger if exists enforce_family_moderator_event_scope on public.events;
create trigger enforce_family_moderator_event_scope
before update of family_id on public.events
for each row execute function private.enforce_family_moderator_event_scope();

commit;
