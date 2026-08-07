-- PHASE 16: VERIFIED PEOPLE + EVENT MENTIONS + PRIMARY FAMILY + ARABIC SEARCH
-- Mobile/public-scale foundations for identity badges, tagged events, and normalized Arabic search.

begin;

-- 1) Public verification flag belongs to the person record, never exposes account identity.
alter table public.people
  add column if not exists is_verified boolean not null default false;

update public.people p
set is_verified = true
where exists (
  select 1 from public.profiles pr where pr.linked_person_id = p.id
);

create index if not exists people_verified_idx
  on public.people (id) where is_verified = true and status = 'approved';

-- Keep account-link approval responsible for verification.
create or replace function public.review_account_link_request(
  p_request_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_person_id uuid;
  v_role text;
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  if coalesce(private.active_role(auth.uid()), '') not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  select r.user_id, r.person_id
  into v_user_id, v_person_id
  from public.account_link_requests r
  where r.id = p_request_id and r.status = 'pending'
  for update;

  if v_user_id is null then
    raise exception 'Request not found or already reviewed';
  end if;

  if p_status = 'approved' and not exists (
    select 1 from public.people p where p.id = v_person_id and p.status = 'approved'
  ) then
    raise exception 'The person record must be approved before linking an account';
  end if;

  update public.account_link_requests
  set status = p_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;

  if p_status = 'approved' then
    update public.profiles
    set linked_person_id = v_person_id,
        role = case when role = 'member' then 'verified_member' else role end,
        updated_at = now()
    where id = v_user_id
    returning role into v_role;

    update public.people
    set is_verified = true
    where id = v_person_id;

    perform private.sync_app_role(v_user_id, v_role);
  end if;
end;
$$;

revoke all on function public.review_account_link_request(uuid, text) from public, anon;
grant execute on function public.review_account_link_request(uuid, text) to authenticated;

-- 2) A verified person (or an administrator) may choose which approved membership is primary.
create or replace function public.set_person_primary_family(
  p_person_id uuid,
  p_membership_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := private.active_role(auth.uid());
  v_family_id uuid;
  v_allowed boolean := false;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  v_allowed := coalesce(v_role, '') in ('admin','super_admin') or exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.linked_person_id = p_person_id and p.account_status = 'active'
  );

  if not v_allowed then
    raise exception 'Only the verified person or an administrator can change the primary family';
  end if;

  select m.family_id into v_family_id
  from public.person_family_memberships m
  where m.id = p_membership_id
    and m.person_id = p_person_id
    and m.status = 'approved'
  for update;

  if v_family_id is null then raise exception 'Approved family membership not found'; end if;

  update public.person_family_memberships
  set is_primary = (id = p_membership_id)
  where person_id = p_person_id and status = 'approved';

  update public.people
  set family_id = v_family_id
  where id = p_person_id;

  return v_family_id;
end;
$$;

revoke all on function public.set_person_primary_family(uuid, uuid) from public, anon;
grant execute on function public.set_person_primary_family(uuid, uuid) to authenticated;

-- 3) Event-person tags live in a relational table for fast future search/reporting.
create table if not exists public.event_people (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete restrict,
  role text not null default 'primary' check (role in ('primary','partner','deceased','graduate','newborn','honoree')),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, person_id, role)
);

create index if not exists event_people_event_idx on public.event_people (event_id, sort_order, person_id);
create index if not exists event_people_person_idx on public.event_people (person_id, event_id);

alter table public.event_people enable row level security;
revoke all on table public.event_people from anon, authenticated;
grant select on table public.event_people to anon, authenticated;

drop policy if exists "Public can read people tagged in visible events" on public.event_people;
create policy "Public can read people tagged in visible events"
on public.event_people for select to anon, authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (
        e.status = 'approved'
        or e.created_by = (select auth.uid())
        or coalesce(private.active_role((select auth.uid())), '') in ('admin','super_admin')
      )
  )
);

create or replace function public.create_event_with_people(
  p_event_type text,
  p_title text,
  p_family_id uuid default null,
  p_event_date date default null,
  p_location_name text default null,
  p_description text default null,
  p_person_ids uuid[] default '{}'::uuid[],
  p_person_roles text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := private.active_role(auth.uid());
  v_direct boolean;
  v_event_id uuid;
  v_index integer;
  v_count integer := coalesce(array_length(p_person_ids, 1), 0);
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(trim(coalesce(p_title,''))) < 3 then raise exception 'Event title is required'; end if;
  if v_count > 4 then raise exception 'A maximum of four tagged people is allowed per event'; end if;
  if coalesce(array_length(p_person_roles,1),0) <> v_count then raise exception 'Tagged people and roles must have matching lengths'; end if;

  if exists (
    select 1 from unnest(p_person_ids) pid
    where not exists (select 1 from public.people p where p.id = pid and p.status = 'approved')
  ) then
    raise exception 'All tagged people must be approved records';
  end if;

  if exists (
    select 1 from unnest(p_person_roles) r
    where r not in ('primary','partner','deceased','graduate','newborn','honoree')
  ) then raise exception 'Invalid event person role'; end if;

  v_direct := coalesce(v_role,'') in ('admin','super_admin');

  insert into public.events(event_type,title,family_id,event_date,location_name,description,created_by,status,approved_by,approved_at)
  values (
    p_event_type, trim(p_title), p_family_id, p_event_date, nullif(trim(coalesce(p_location_name,'')),''),
    nullif(trim(coalesce(p_description,'')),''), v_user_id,
    case when v_direct then 'approved' else 'pending' end,
    case when v_direct then v_user_id else null end,
    case when v_direct then now() else null end
  ) returning id into v_event_id;

  if v_count > 0 then
    for v_index in 1..v_count loop
      insert into public.event_people(event_id,person_id,role,sort_order)
      values (v_event_id,p_person_ids[v_index],p_person_roles[v_index],v_index-1);
    end loop;
  end if;

  return v_event_id;
end;
$$;

revoke all on function public.create_event_with_people(text,text,uuid,date,text,text,uuid[],text[]) from public, anon;
grant execute on function public.create_event_with_people(text,text,uuid,date,text,text,uuid[],text[]) to authenticated;

-- 4) Arabic normalization: ignore hamza variants and treat taa marbuta like haa for matching.
create or replace function public.normalize_arabic_name(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        translate(
          regexp_replace(coalesce(p_value, ''), '[\u064B-\u065F\u0670\u06D6-\u06ED]', '', 'g'),
          'أإآٱىئؤة',
          'ااااييوه'
        ),
        'ء', '', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

create index if not exists people_approved_normalized_name_trgm_idx
  on public.people using gin ((public.normalize_arabic_name(full_name)) extensions.gin_trgm_ops)
  where status = 'approved';
create index if not exists families_approved_normalized_name_trgm_idx
  on public.families using gin ((public.normalize_arabic_name(name)) extensions.gin_trgm_ops)
  where status = 'approved';

create or replace function public.search_public_people(
  p_query text,
  p_limit integer default 9,
  p_offset integer default 0
)
returns table (
  id uuid,
  full_name text,
  gender text,
  birth_year integer,
  is_deceased boolean,
  is_verified boolean,
  description text,
  family_id uuid,
  family_name text,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_query text := public.normalize_arabic_name(p_query);
  v_limit integer := greatest(1, least(coalesce(p_limit,9),30));
  v_offset integer := greatest(0,coalesce(p_offset,0));
begin
  if char_length(v_query) < 2 then return; end if;
  return query
  select p.id,p.full_name,p.gender,p.birth_year,p.is_deceased,p.is_verified,p.description,p.family_id,f.name,p.created_by,p.created_at
  from public.people p
  left join public.families f on f.id=p.family_id
  where p.status='approved'
    and (
      public.normalize_arabic_name(p.full_name) ilike '%'||v_query||'%'
      or public.normalize_arabic_name(p.full_name) % v_query
    )
  order by
    (public.normalize_arabic_name(p.full_name)=v_query) desc,
    similarity(public.normalize_arabic_name(p.full_name),v_query) desc,
    p.full_name
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.search_public_people(text,integer,integer) from public;
grant execute on function public.search_public_people(text,integer,integer) to anon,authenticated;

create or replace function public.search_public_families(
  p_query text,
  p_limit integer default 9,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  description text,
  origin_place text,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_query text := public.normalize_arabic_name(p_query);
  v_limit integer := greatest(1, least(coalesce(p_limit,9),30));
  v_offset integer := greatest(0,coalesce(p_offset,0));
begin
  if char_length(v_query) < 2 then return; end if;
  return query
  select f.id,f.name,f.description,f.origin_place,f.created_by,f.created_at
  from public.families f
  where f.status='approved'
    and (
      public.normalize_arabic_name(f.name) ilike '%'||v_query||'%'
      or public.normalize_arabic_name(f.name) % v_query
    )
  order by
    (public.normalize_arabic_name(f.name)=v_query) desc,
    similarity(public.normalize_arabic_name(f.name),v_query) desc,
    f.name
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.search_public_families(text,integer,integer) from public;
grant execute on function public.search_public_families(text,integer,integer) to anon,authenticated;

notify pgrst, 'reload schema';

commit;
