-- Replace the legacy user-facing family context with three explicit scopes:
-- household (generated from marriage), lineage, and lineage branch.

alter table public.events add column if not exists scope_type text;
alter table public.events add column if not exists scope_id uuid;
alter table public.events add column if not exists scope_source text;
update public.events set scope_type='community' where scope_type is null;
update public.events set scope_source='legacy' where scope_source is null;
alter table public.events alter column scope_type set default 'community';
alter table public.events alter column scope_type set not null;
alter table public.events alter column scope_source set default 'auto';
alter table public.events alter column scope_source set not null;

do $$ begin
  alter table public.events add constraint events_scope_type_check check(scope_type in ('community','household','lineage','branch'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.events add constraint events_scope_source_check check(scope_source in ('auto','manual','legacy'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.events add constraint events_scope_pair_check check((scope_type='community' and scope_id is null) or (scope_type<>'community' and scope_id is not null));
exception when duplicate_object then null; end $$;

create table public.moderator_scope_assignments(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope_type text not null check(scope_type in ('household','lineage','branch')),
  scope_id uuid not null,
  assigned_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(user_id,scope_type,scope_id)
);
alter table public.moderator_scope_assignments enable row level security;
grant select,insert,delete on public.moderator_scope_assignments to authenticated;
create policy "Primary admin can read moderator scopes" on public.moderator_scope_assignments for select to authenticated using(private.is_primary_admin((select auth.uid())));
create policy "Primary admin can insert moderator scopes" on public.moderator_scope_assignments for insert to authenticated with check(private.is_primary_admin((select auth.uid())) and assigned_by=(select auth.uid()));
create policy "Primary admin can delete moderator scopes" on public.moderator_scope_assignments for delete to authenticated using(private.is_primary_admin((select auth.uid())));

create table public.person_scope_affiliations(
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  scope_type text not null check(scope_type in ('household','lineage','branch')),
  scope_id uuid not null,
  affiliation_type text not null,
  source text not null default 'legacy_migration' check(source in ('legacy_migration','derived','manual')),
  legacy_membership_id uuid unique references public.person_family_memberships(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  unique(person_id,scope_type,scope_id,affiliation_type)
);
alter table public.person_scope_affiliations enable row level security;
grant select on public.person_scope_affiliations to anon,authenticated;
create policy "Public can read scope affiliations of approved people" on public.person_scope_affiliations for select to anon,authenticated using(exists(select 1 from public.people p where p.id=person_id and p.status='approved' and p.archived_at is null));

create or replace function private.scope_reference_exists(p_scope_type text,p_scope_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select case p_scope_type
    when 'household' then p_scope_id is not null and exists(select 1 from public.family_units fu where fu.husband_person_id=p_scope_id and fu.status='approved')
    when 'lineage' then p_scope_id is not null and exists(select 1 from public.lineages l where l.id=p_scope_id and l.status='approved')
    when 'branch' then p_scope_id is not null and exists(select 1 from public.lineage_branches b where b.id=p_scope_id and b.status='approved' and b.is_current)
    else false end;
$$;

create or replace function private.person_in_scope(p_person_id uuid,p_scope_type text,p_scope_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select case p_scope_type
    when 'household' then exists(
      select 1 from public.family_units fu
      join public.family_unit_members fum on fum.family_unit_id=fu.id
      where fu.husband_person_id=p_scope_id and fu.status='approved' and fum.person_id=p_person_id
    )
    when 'lineage' then exists(select 1 from public.get_person_lineage_context(p_person_id) c where c.lineage_id=p_scope_id)
    when 'branch' then exists(
      select 1 from public.get_person_lineage_context(p_person_id) c
      join public.lineage_branches b on b.lineage_id=c.lineage_id and b.branch_person_id=c.branch_person_id and b.status='approved' and b.is_current
      where b.id=p_scope_id
    )
    else false end;
$$;

create or replace function private.has_moderator_scope(p_user_id uuid,p_scope_type text,p_scope_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_scope_id is not null and exists(
    select 1 from public.moderator_scope_assignments a
    where a.user_id=p_user_id and a.scope_type=p_scope_type and a.scope_id=p_scope_id
  );
$$;

-- Compatibility helper: old moderation code may still pass a legacy family_id.
create or replace function private.has_family_moderator_scope(p_user_id uuid,p_family_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_family_id is not null and (
    exists(select 1 from public.family_moderator_assignments a where a.user_id=p_user_id and a.family_id=p_family_id)
    or exists(
      select 1 from public.moderator_scope_assignments s
      where s.user_id=p_user_id and (
        (s.scope_type='household' and exists(
          select 1 from public.family_units fu
          where fu.legacy_family_id=p_family_id and fu.husband_person_id=s.scope_id and fu.status='approved'
        ))
        or (s.scope_type in ('lineage','branch') and exists(
          select 1 from public.person_family_memberships m
          where m.family_id=p_family_id and m.status='approved' and private.person_in_scope(m.person_id,s.scope_type,s.scope_id)
        ))
      )
    )
  );
$$;

create or replace function private.person_in_family_moderator_scope(p_user_id uuid,p_person_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.moderator_scope_assignments a
    where a.user_id=p_user_id and private.person_in_scope(p_person_id,a.scope_type,a.scope_id)
  ) or exists(
    select 1 from public.people p
    where p.id=p_person_id and p.status='approved' and (
      private.has_family_moderator_scope(p_user_id,p.family_id)
      or exists(
        select 1 from public.person_family_memberships m
        join public.family_moderator_assignments a on a.family_id=m.family_id and a.user_id=p_user_id
        where m.person_id=p.id and m.status='approved'
      )
    )
  );
$$;

create or replace function private.infer_event_scope(p_event_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_type text:='community';
  v_id uuid:=null;
  v_event_type text;
  v_lineage_count int;
  v_branch_count int;
  v_lineage_id uuid;
  v_branch_id uuid;
begin
  select e.event_type into v_event_type from public.events e where e.id=p_event_id;
  if v_event_type is null then return; end if;

  select fu.husband_person_id into v_id
  from public.event_people a
  join public.event_people b on b.event_id=a.event_id and b.id<>a.id
  join public.family_units fu on fu.status='approved'
    and ((fu.husband_person_id=a.person_id and fu.wife_person_id=b.person_id)
      or (fu.husband_person_id=b.person_id and fu.wife_person_id=a.person_id))
  where a.event_id=p_event_id
    and a.participant_role in ('spouse_1','spouse_2')
    and b.participant_role in ('spouse_1','spouse_2')
  limit 1;

  if v_id is not null then
    v_type:='household';
  else
    select fu.husband_person_id into v_id
    from public.event_people ep
    join public.canonical_parent_edges pf on pf.child_id=ep.person_id
    join public.people father on father.id=pf.parent_id and father.gender='male'
    join public.canonical_parent_edges pm on pm.child_id=ep.person_id and pm.parent_id<>pf.parent_id
    join public.people mother on mother.id=pm.parent_id and mother.gender='female'
    join public.family_units fu on fu.husband_person_id=father.id and fu.wife_person_id=mother.id and fu.status='approved'
    where ep.event_id=p_event_id and ep.participant_role in ('newborn','child')
    limit 1;

    if v_id is not null then
      v_type:='household';
    else
      with contexts as (
        select distinct c.lineage_id,c.branch_person_id
        from public.event_people ep
        join lateral public.get_person_lineage_context(ep.person_id) c on true
        where ep.event_id=p_event_id
      ), branch_ids as (
        select distinct b.id,b.lineage_id
        from contexts c
        join public.lineage_branches b on b.lineage_id=c.lineage_id and b.branch_person_id=c.branch_person_id and b.status='approved' and b.is_current
      )
      select
        (select count(distinct lineage_id) from contexts),
        (select count(distinct id) from branch_ids),
        (select lineage_id from contexts limit 1),
        (select id from branch_ids limit 1)
      into v_lineage_count,v_branch_count,v_lineage_id,v_branch_id;

      if coalesce(v_branch_count,0)=1 then
        v_type:='branch'; v_id:=v_branch_id;
      elsif coalesce(v_lineage_count,0)=1 then
        v_type:='lineage'; v_id:=v_lineage_id;
      else
        v_type:='community'; v_id:=null;
      end if;
    end if;
  end if;

  update public.events set scope_type=v_type,scope_id=v_id,scope_source='auto' where id=p_event_id;
end;
$$;

create or replace function private.event_scope_legacy_family(p_event_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select coalesce(
    (select fu.legacy_family_id
     from public.events e
     join public.family_units fu on e.scope_type='household' and fu.husband_person_id=e.scope_id and fu.status='approved' and fu.legacy_family_id is not null
     where e.id=p_event_id order by fu.created_at limit 1),
    (select m.family_id
     from public.event_people ep
     join public.person_family_memberships m on m.person_id=ep.person_id and m.status='approved'
     where ep.event_id=p_event_id order by m.is_primary desc,m.created_at limit 1)
  );
$$;

create or replace function public.create_event_with_people(
  p_event_type text,
  p_title text,
  p_family_id uuid default null,
  p_event_date date default null,
  p_location_name text default null,
  p_description text default null,
  p_participants jsonb default '[]'::jsonb
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_event_id uuid;
  v_role text:=coalesce(private.active_role(auth.uid()),'');
  v_direct boolean:=v_role in ('admin','super_admin');
  v_item jsonb;
  v_person_id uuid;
  v_participant_role text;
  v_order integer:=0;
  v_legacy uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if trim(coalesce(p_title,''))='' then raise exception 'Event title is required'; end if;
  if p_event_type not in ('death','wedding','birth','naming','graduation','general','other') then raise exception 'Invalid event type'; end if;
  if jsonb_typeof(coalesce(p_participants,'[]'::jsonb))<>'array' then raise exception 'Invalid participants'; end if;

  insert into public.events(event_type,title,family_id,event_date,location_name,description,created_by,status,approved_by,approved_at,scope_type,scope_id,scope_source)
  values(
    p_event_type,trim(p_title),p_family_id,p_event_date,
    nullif(trim(coalesce(p_location_name,'')),''),
    nullif(trim(coalesce(p_description,'')),''),
    auth.uid(),
    case when v_direct then 'approved' else 'pending' end,
    case when v_direct then auth.uid() else null end,
    case when v_direct then now() else null end,
    'community',null,'auto'
  ) returning id into v_event_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_participants,'[]'::jsonb)) loop
    v_person_id:=nullif(v_item->>'person_id','')::uuid;
    v_participant_role:=coalesce(nullif(v_item->>'role',''),'mentioned');
    if v_person_id is null then continue; end if;
    if v_participant_role not in ('spouse_1','spouse_2','deceased','graduate','newborn','child','mentioned') then raise exception 'Invalid participant role'; end if;
    if not exists(select 1 from public.people p where p.id=v_person_id and p.status='approved') then raise exception 'Tagged person must be approved'; end if;
    insert into public.event_people(event_id,person_id,participant_role,sort_order,created_by)
    values(v_event_id,v_person_id,v_participant_role,v_order,auth.uid())
    on conflict do nothing;
    v_order:=v_order+1;
  end loop;

  perform private.infer_event_scope(v_event_id);
  if p_family_id is null then
    v_legacy:=private.event_scope_legacy_family(v_event_id);
    update public.events set family_id=v_legacy where id=v_event_id;
  end if;
  return v_event_id;
end;
$$;

create or replace function private.enforce_family_moderator_event_scope()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if coalesce(private.active_role(auth.uid()),'')='family_moderator' then
    if (new.scope_type is distinct from old.scope_type or new.scope_id is distinct from old.scope_id)
       and not private.has_moderator_scope(auth.uid(),new.scope_type,new.scope_id) then
      raise exception 'Scope moderator cannot move an event outside assigned scope';
    end if;
    if new.family_id is distinct from old.family_id
       and not private.has_family_moderator_scope(auth.uid(),new.family_id) then
      raise exception 'Scope moderator cannot move an event outside assigned scope';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_family_moderator_event_scope on public.events;
create trigger enforce_family_moderator_event_scope
before update of family_id,scope_type,scope_id on public.events
for each row execute function private.enforce_family_moderator_event_scope();

create or replace function public.search_scope_options_v1(p_query text default null,p_scope_type text default null,p_limit integer default 20)
returns table(scope_type text,scope_id uuid,scope_name text,subtitle text)
language sql stable security invoker set search_path='' as $$
  with q as(select trim(coalesce(p_query,'')) t),
  options(scope_type,scope_id,scope_name,subtitle) as (
    select 'household'::text,h.household_id,h.display_name,concat(h.spouse_count,' زوجات · ',h.child_count,' أبناء')
    from public.list_households_v1((select t from q),greatest(5,least(coalesce(p_limit,20),50)),0) h
    where p_scope_type is null or p_scope_type='household'
    union all
    select 'lineage',l.id,regexp_replace(l.display_name,'^عائلة\s+','نسب '),coalesce(r.full_name,'أصل معتمد')
    from public.lineages l join public.people r on r.id=l.root_person_id cross join q
    where l.status='approved' and (p_scope_type is null or p_scope_type='lineage')
      and (q.t='' or l.display_name ilike '%'||q.t||'%' or r.full_name ilike '%'||q.t||'%')
    union all
    select 'branch',b.id,b.display_name,regexp_replace(l.display_name,'^عائلة\s+','نسب ')
    from public.lineage_branches b
    join public.lineages l on l.id=b.lineage_id
    join public.people p on p.id=b.branch_person_id
    cross join q
    where b.status='approved' and b.is_current and (p_scope_type is null or p_scope_type='branch')
      and (q.t='' or b.display_name ilike '%'||q.t||'%' or p.full_name ilike '%'||q.t||'%')
  )
  select * from options limit greatest(1,least(coalesce(p_limit,20),50));
$$;
revoke all on function public.search_scope_options_v1(text,text,integer) from public;
grant execute on function public.search_scope_options_v1(text,text,integer) to authenticated;

create or replace function public.list_moderator_scope_assignments(p_user_id uuid)
returns table(scope_type text,scope_id uuid,scope_name text,subtitle text)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_primary_admin(auth.uid()) then raise exception 'Only the primary administrator can inspect moderator scopes'; end if;
  return query
  select a.scope_type,a.scope_id,
    case a.scope_type
      when 'household' then 'أسرة '||(select p.full_name from public.people p where p.id=a.scope_id)
      when 'lineage' then regexp_replace((select l.display_name from public.lineages l where l.id=a.scope_id),'^عائلة\s+','نسب ')
      when 'branch' then (select b.display_name from public.lineage_branches b where b.id=a.scope_id)
    end,
    case a.scope_type
      when 'household' then 'أسرة زوجية'
      when 'lineage' then 'نسب كامل'
      when 'branch' then 'فرع من النسب'
    end
  from public.moderator_scope_assignments a
  where a.user_id=p_user_id
  order by a.scope_type,3;
end;
$$;
revoke all on function public.list_moderator_scope_assignments(uuid) from public,anon;
grant execute on function public.list_moderator_scope_assignments(uuid) to authenticated;

create or replace function public.set_moderator_scope_assignment(p_user_id uuid,p_scope_type text,p_scope_id uuid,p_enabled boolean)
returns text language plpgsql security definer set search_path='' as $$
declare
  v_previous_role text;
  v_next_role text;
  v_linked_person_id uuid;
  v_is_primary boolean;
begin
  if not private.is_primary_admin(auth.uid()) then raise exception 'Only the primary administrator can manage moderator scopes'; end if;
  if p_scope_type not in ('household','lineage','branch') or not private.scope_reference_exists(p_scope_type,p_scope_id) then raise exception 'Scope not found'; end if;

  select p.role,p.linked_person_id,p.is_primary_admin
  into v_previous_role,v_linked_person_id,v_is_primary
  from public.profiles p join auth.users u on u.id=p.id
  where p.id=p_user_id and p.account_status='active' and u.email_confirmed_at is not null
  for update;

  if v_previous_role is null then raise exception 'Registered user not found'; end if;
  if v_is_primary then raise exception 'The primary administrator role is protected'; end if;

  if p_enabled then
    insert into public.moderator_scope_assignments(user_id,scope_type,scope_id,assigned_by)
    values(p_user_id,p_scope_type,p_scope_id,auth.uid())
    on conflict(user_id,scope_type,scope_id) do nothing;
    v_next_role:='family_moderator';
  else
    delete from public.moderator_scope_assignments
    where user_id=p_user_id and scope_type=p_scope_type and scope_id=p_scope_id;
    if exists(select 1 from public.moderator_scope_assignments a where a.user_id=p_user_id) then
      v_next_role:='family_moderator';
    else
      v_next_role:=case when v_linked_person_id is not null then 'verified_member' else 'member' end;
    end if;
  end if;

  if v_previous_role<>v_next_role then
    update public.profiles set role=v_next_role,updated_at=now() where id=p_user_id;
    insert into private.admin_role_audit(target_user_id,previous_role,new_role,changed_by)
    values(p_user_id,v_previous_role,v_next_role,auth.uid());
  end if;
  perform private.sync_app_role(p_user_id,v_next_role);
  return v_next_role;
end;
$$;
revoke all on function public.set_moderator_scope_assignment(uuid,text,uuid,boolean) from public,anon;
grant execute on function public.set_moderator_scope_assignment(uuid,text,uuid,boolean) to authenticated;

create or replace function public.set_platform_user_role(p_user_id uuid,p_role text)
returns text language plpgsql security definer set search_path='' as $$
declare
  v_previous_role text;
  v_next_role text;
  v_linked_person_id uuid;
  v_is_primary boolean;
begin
  if not private.is_primary_admin(auth.uid()) then raise exception 'Only the primary administrator can change platform roles'; end if;
  if p_role not in ('member','content_moderator','admin') then raise exception 'Use scope assignment for scoped moderators; verified membership is automatic'; end if;

  select p.role,p.linked_person_id,p.is_primary_admin
  into v_previous_role,v_linked_person_id,v_is_primary
  from public.profiles p join auth.users u on u.id=p.id
  where p.id=p_user_id and p.account_status='active' and u.email_confirmed_at is not null
  for update;

  if v_previous_role is null then raise exception 'Registered user not found'; end if;
  if v_is_primary then raise exception 'The primary administrator role is protected'; end if;

  v_next_role:=case when p_role='member' and v_linked_person_id is not null then 'verified_member' else p_role end;
  if v_previous_role='family_moderator' then
    delete from public.family_moderator_assignments where user_id=p_user_id;
    delete from public.moderator_scope_assignments where user_id=p_user_id;
  end if;

  if v_previous_role<>v_next_role then
    update public.profiles set role=v_next_role,updated_at=now() where id=p_user_id;
    insert into private.admin_role_audit(target_user_id,previous_role,new_role,changed_by)
    values(p_user_id,v_previous_role,v_next_role,auth.uid());
  end if;
  perform private.sync_app_role(p_user_id,v_next_role);
  return v_next_role;
end;
$$;

-- Migrate legacy affiliations only when the new scope is provable.
insert into public.person_scope_affiliations(person_id,scope_type,scope_id,affiliation_type,source,legacy_membership_id,notes)
select distinct on(m.id) m.person_id,'household',fu.husband_person_id,'marriage','legacy_migration',m.id,m.notes
from public.person_family_memberships m
join public.family_units fu on fu.legacy_family_id=m.family_id and fu.status='approved' and (fu.husband_person_id=m.person_id or fu.wife_person_id=m.person_id)
where m.status='approved' and m.membership_type='marriage'
order by m.id,fu.created_at
on conflict do nothing;

insert into public.person_scope_affiliations(person_id,scope_type,scope_id,affiliation_type,source,legacy_membership_id,notes)
select m.person_id,
  case when b.id is not null then 'branch' else 'lineage' end,
  coalesce(b.id,c.lineage_id),
  'origin','legacy_migration',m.id,m.notes
from public.person_family_memberships m
join lateral public.get_person_lineage_context(m.person_id) c on true
left join public.lineage_branches b on b.lineage_id=c.lineage_id and b.branch_person_id=c.branch_person_id and b.status='approved' and b.is_current
where m.status='approved' and m.membership_type='birth'
on conflict do nothing;

insert into public.person_scope_affiliations(person_id,scope_type,scope_id,affiliation_type,source,legacy_membership_id,notes)
select distinct on(m.id) m.person_id,
  case when b.id is not null then 'branch' else 'lineage' end,
  coalesce(b.id,c.lineage_id),
  m.membership_type,'legacy_migration',m.id,m.notes
from public.person_family_memberships m
join public.canonical_parent_edges pe on pe.child_id=m.person_id
join public.people par on par.id=pe.parent_id and ((m.membership_type='paternal' and par.gender='male') or (m.membership_type='maternal' and par.gender='female'))
join lateral public.get_person_lineage_context(par.id) c on true
left join public.lineage_branches b on b.lineage_id=c.lineage_id and b.branch_person_id=c.branch_person_id and b.status='approved' and b.is_current
where m.status='approved' and m.membership_type in ('paternal','maternal')
order by m.id
on conflict do nothing;

create or replace function public.list_person_scope_context_v1(p_person_id uuid)
returns table(scope_type text,scope_id uuid,scope_name text,relation_type text,source text)
language sql stable security invoker set search_path='' as $$
  with derived(scope_type,scope_id,scope_name,relation_type,source) as (
    select 'lineage'::text,c.lineage_id,regexp_replace(c.lineage_name,'^عائلة\s+','نسب '),'النسب'::text,'derived'::text
    from public.get_person_lineage_context(p_person_id) c
    union all
    select 'branch',b.id,b.display_name,'الفرع','derived'
    from public.get_person_lineage_context(p_person_id) c
    join public.lineage_branches b on b.lineage_id=c.lineage_id and b.branch_person_id=c.branch_person_id and b.status='approved' and b.is_current
    union all
    select distinct 'household',fu.husband_person_id,'أسرة '||h.full_name,
      case fum.member_role when 'husband' then 'رأس الأسرة' when 'wife' then 'زوجة' else 'ابن/ابنة' end,
      'derived'
    from public.family_unit_members fum
    join public.family_units fu on fu.id=fum.family_unit_id and fu.status='approved'
    join public.people h on h.id=fu.husband_person_id
    where fum.person_id=p_person_id
  ), migrated(scope_type,scope_id,scope_name,relation_type,source) as (
    select a.scope_type,a.scope_id,
      case a.scope_type
        when 'household' then 'أسرة '||(select p.full_name from public.people p where p.id=a.scope_id)
        when 'lineage' then regexp_replace((select l.display_name from public.lineages l where l.id=a.scope_id),'^عائلة\s+','نسب ')
        when 'branch' then (select b.display_name from public.lineage_branches b where b.id=a.scope_id)
      end,
      case a.affiliation_type
        when 'marriage' then 'بالزواج'
        when 'origin' then 'أصل مسجل سابقًا'
        when 'paternal' then 'من جهة الأب'
        when 'maternal' then 'من جهة الأم'
        else a.affiliation_type
      end,
      a.source
    from public.person_scope_affiliations a
    where a.person_id=p_person_id
  )
  select * from derived
  union
  select * from migrated m
  where not exists(
    select 1 from derived d
    where d.scope_type=m.scope_type and d.scope_id=m.scope_id and d.relation_type=m.relation_type
  )
  order by 1,3;
$$;
revoke all on function public.list_person_scope_context_v1(uuid) from public;
grant execute on function public.list_person_scope_context_v1(uuid) to anon,authenticated;

create index moderator_scope_assignments_user_idx on public.moderator_scope_assignments(user_id);
create index moderator_scope_assignments_scope_idx on public.moderator_scope_assignments(scope_type,scope_id);
create index person_scope_affiliations_person_idx on public.person_scope_affiliations(person_id);
create index events_scope_idx on public.events(scope_type,scope_id) where status<>'rejected';
