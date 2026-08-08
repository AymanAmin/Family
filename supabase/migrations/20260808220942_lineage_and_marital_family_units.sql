begin;

-- Additive lineage model. Existing public.families and people.family_id remain untouched.
create table if not exists public.lineages (
  id uuid primary key default gen_random_uuid(),
  root_person_id uuid not null references public.people(id) on delete restrict,
  display_name text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (root_person_id)
);

create table if not exists public.lineage_branches (
  id uuid primary key default gen_random_uuid(),
  lineage_id uuid not null references public.lineages(id) on delete cascade,
  branch_person_id uuid not null references public.people(id) on delete restrict,
  display_name text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lineage_id, branch_person_id)
);

-- Marital family unit: husband + wife. Children are derived from parent edges and are not duplicated here.
create table if not exists public.family_units (
  id uuid primary key default gen_random_uuid(),
  husband_person_id uuid not null references public.people(id) on delete restrict,
  wife_person_id uuid not null references public.people(id) on delete restrict,
  display_name text not null,
  legacy_family_id uuid references public.families(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (husband_person_id <> wife_person_id),
  unique (husband_person_id, wife_person_id)
);

create index if not exists lineages_status_idx on public.lineages(status);
create index if not exists lineage_branches_lineage_idx on public.lineage_branches(lineage_id, status);
create index if not exists lineage_branches_person_idx on public.lineage_branches(branch_person_id);
create index if not exists family_units_husband_idx on public.family_units(husband_person_id, status);
create index if not exists family_units_wife_idx on public.family_units(wife_person_id, status);
create index if not exists family_units_legacy_family_idx on public.family_units(legacy_family_id) where legacy_family_id is not null;

create or replace function private.touch_lineage_model_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.touch_lineage_model_updated_at() from public, anon, authenticated;

drop trigger if exists lineages_touch_updated_at on public.lineages;
create trigger lineages_touch_updated_at before update on public.lineages
for each row execute function private.touch_lineage_model_updated_at();

drop trigger if exists lineage_branches_touch_updated_at on public.lineage_branches;
create trigger lineage_branches_touch_updated_at before update on public.lineage_branches
for each row execute function private.touch_lineage_model_updated_at();

drop trigger if exists family_units_touch_updated_at on public.family_units;
create trigger family_units_touch_updated_at before update on public.family_units
for each row execute function private.touch_lineage_model_updated_at();

-- Canonical parent edges: one source of truth regardless of whether the stored direct row is parent or child.
create or replace view public.canonical_parent_edges
with (security_invoker = true)
as
select r.source_person_id as parent_id, r.target_person_id as child_id
from public.person_relationships r
where r.status = 'approved' and r.relation_type = 'parent'
union
select r.target_person_id as parent_id, r.source_person_id as child_id
from public.person_relationships r
where r.status = 'approved' and r.relation_type = 'child';

create or replace function private.validate_lineage_branch()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_root uuid;
  v_valid boolean := false;
begin
  select l.root_person_id into v_root from public.lineages l where l.id = new.lineage_id;
  if v_root is null then raise exception 'Lineage not found'; end if;
  if new.branch_person_id = v_root then raise exception 'Lineage root cannot also be a branch'; end if;

  with recursive descendants(person_id, path) as (
    select v_root, array[v_root]::uuid[]
    union all
    select e.child_id, d.path || e.child_id
    from descendants d
    join public.canonical_parent_edges e on e.parent_id = d.person_id
    where cardinality(d.path) < 21 and not (e.child_id = any(d.path))
  )
  select exists(select 1 from descendants d where d.person_id = new.branch_person_id) into v_valid;
  if not v_valid then raise exception 'Branch person must descend from lineage root'; end if;
  return new;
end;
$$;

revoke all on function private.validate_lineage_branch() from public, anon, authenticated;
drop trigger if exists lineage_branches_validate on public.lineage_branches;
create trigger lineage_branches_validate before insert or update of lineage_id, branch_person_id on public.lineage_branches
for each row execute function private.validate_lineage_branch();

create or replace function private.sync_family_unit_for_spouse_pair(p_person_a uuid, p_person_b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_husband uuid;
  v_wife uuid;
  v_husband_name text;
  v_relation public.person_relationships%rowtype;
  v_legacy_family uuid;
begin
  select
    case when a.gender = 'male' and b.gender = 'female' then a.id when b.gender = 'male' and a.gender = 'female' then b.id end,
    case when a.gender = 'female' and b.gender = 'male' then a.id when b.gender = 'female' and a.gender = 'male' then b.id end
  into v_husband, v_wife
  from public.people a join public.people b on b.id = p_person_b where a.id = p_person_a;

  if v_husband is null or v_wife is null then return; end if;

  select r.* into v_relation
  from public.person_relationships r
  where r.status = 'approved' and r.relation_type = 'spouse'
    and ((r.source_person_id = v_husband and r.target_person_id = v_wife)
      or (r.source_person_id = v_wife and r.target_person_id = v_husband))
  order by r.approved_at nulls last, r.created_at, r.id limit 1;

  if not found then
    update public.family_units set status = 'rejected', updated_at = now()
    where husband_person_id = v_husband and wife_person_id = v_wife and status <> 'rejected';
    return;
  end if;

  select p.full_name into v_husband_name from public.people p where p.id = v_husband;

  select m1.family_id into v_legacy_family
  from public.person_family_memberships m1
  join public.person_family_memberships m2
    on m2.family_id = m1.family_id and m2.person_id = v_wife and m2.status = 'approved'
  where m1.person_id = v_husband and m1.status = 'approved'
    and (m1.membership_type = 'marriage' or m2.membership_type = 'marriage')
  order by case when m1.membership_type = 'marriage' and m2.membership_type = 'marriage' then 0 else 1 end,
           m1.is_primary desc, m2.is_primary desc, m1.created_at
  limit 1;

  insert into public.family_units(
    husband_person_id, wife_person_id, display_name, legacy_family_id,
    status, created_by, approved_by, approved_at, created_at, updated_at
  ) values (
    v_husband, v_wife, 'أسرة ' || v_husband_name, v_legacy_family,
    'approved', v_relation.created_by, v_relation.approved_by,
    coalesce(v_relation.approved_at, v_relation.created_at), v_relation.created_at, now()
  )
  on conflict (husband_person_id, wife_person_id) do update
  set display_name = excluded.display_name,
      legacy_family_id = coalesce(excluded.legacy_family_id, public.family_units.legacy_family_id),
      status = 'approved',
      approved_by = coalesce(excluded.approved_by, public.family_units.approved_by),
      approved_at = coalesce(excluded.approved_at, public.family_units.approved_at),
      updated_at = now();
end;
$$;

revoke all on function private.sync_family_unit_for_spouse_pair(uuid, uuid) from public, anon, authenticated;

create or replace function private.sync_family_unit_from_relationship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.relation_type = 'spouse' then perform private.sync_family_unit_for_spouse_pair(old.source_person_id, old.target_person_id); end if;
    return old;
  end if;

  if new.relation_type = 'spouse' or (tg_op = 'UPDATE' and old.relation_type = 'spouse') then
    perform private.sync_family_unit_for_spouse_pair(new.source_person_id, new.target_person_id);
    if tg_op = 'UPDATE' and old.relation_type = 'spouse'
       and (old.source_person_id <> new.source_person_id or old.target_person_id <> new.target_person_id) then
      perform private.sync_family_unit_for_spouse_pair(old.source_person_id, old.target_person_id);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_family_unit_from_relationship() from public, anon, authenticated;
drop trigger if exists person_relationships_sync_family_unit on public.person_relationships;
create trigger person_relationships_sync_family_unit after insert or update or delete on public.person_relationships
for each row execute function private.sync_family_unit_from_relationship();

do $$
declare rec record;
begin
  for rec in
    select distinct least(r.source_person_id, r.target_person_id) as a, greatest(r.source_person_id, r.target_person_id) as b
    from public.person_relationships r where r.status = 'approved' and r.relation_type = 'spouse'
  loop
    perform private.sync_family_unit_for_spouse_pair(rec.a, rec.b);
  end loop;
end
$$;

create or replace view public.family_unit_members
with (security_invoker = true)
as
select fu.id as family_unit_id, fu.husband_person_id as person_id, 'husband'::text as member_role, 0::integer as generation
from public.family_units fu where fu.status = 'approved'
union all
select fu.id, fu.wife_person_id, 'wife'::text, 0::integer
from public.family_units fu where fu.status = 'approved'
union
select fu.id, h.child_id, 'child'::text, 1::integer
from public.family_units fu
join public.canonical_parent_edges h on h.parent_id = fu.husband_person_id
join public.canonical_parent_edges w on w.parent_id = fu.wife_person_id and w.child_id = h.child_id
where fu.status = 'approved';

-- Curated bootstrap: create Muhammad Ali Idris if needed, link Yas Khairy and only the children explicitly confirmed.
do $$
declare
  v_admin uuid;
  v_root uuid;
  v_yas uuid;
  v_child uuid;
  v_lineage uuid;
  v_name text;
  v_child_names text[] := array[
    'فاطمه يس خيري محمد علي ادريس',
    'سلوى يس خيري محمد علي ادريس',
    'نصر الدين يس خيري محمد علي ادريس',
    'عبد الحفيظ يس خيري محمد علي ادريس',
    'عيد يس خيري محمد علي ادريس'
  ];
begin
  select p.id into v_admin from public.profiles p
  where p.is_primary_admin = true and p.account_status = 'active'
  order by p.created_at limit 1;
  if v_admin is null then
    select p.id into v_admin from public.profiles p
    where p.role = 'super_admin' and p.account_status = 'active'
    order by p.created_at limit 1;
  end if;
  if v_admin is null then raise exception 'Active primary administrator is required'; end if;

  select p.id into v_root from public.people p
  where trim(regexp_replace(translate(p.full_name, 'إأآ', 'ااا'), '\s+', ' ', 'g')) = 'محمد علي ادريس'
  order by case when p.status = 'approved' then 0 else 1 end, p.created_at limit 1;

  if v_root is null then
    insert into public.people(full_name, gender, status, created_by, approved_by, approved_at)
    values ('محمد علي إدريس', 'male', 'approved', v_admin, v_admin, now()) returning id into v_root;
  else
    update public.people
    set status = 'approved', approved_by = coalesce(approved_by, v_admin), approved_at = coalesce(approved_at, now()), updated_at = now()
    where id = v_root and status <> 'approved';
  end if;

  select p.id into v_yas from public.people p
  where trim(regexp_replace(translate(p.full_name, 'إأآ', 'ااا'), '\s+', ' ', 'g')) = 'يس خيري محمد علي ادريس'
    and p.status = 'approved'
  order by p.created_at limit 1;
  if v_yas is null then raise exception 'Yas Khairy person record was not found'; end if;

  update public.person_relationships r
  set status='approved', approved_by=v_admin, approved_at=coalesce(r.approved_at,now()), updated_at=now()
  where r.status='pending' and (
    (r.source_person_id=v_root and r.target_person_id=v_yas and r.relation_type='parent') or
    (r.source_person_id=v_yas and r.target_person_id=v_root and r.relation_type='child')
  );
  if not exists (select 1 from public.canonical_parent_edges e where e.parent_id=v_root and e.child_id=v_yas) then
    insert into public.person_relationships(source_person_id,target_person_id,relation_type,status,created_by,approved_by,approved_at)
    values(v_root,v_yas,'parent','approved',v_admin,v_admin,now());
  end if;

  foreach v_name in array v_child_names loop
    select p.id into v_child from public.people p
    where trim(regexp_replace(translate(p.full_name, 'إأآ', 'ااا'), '\s+', ' ', 'g')) =
          trim(regexp_replace(translate(v_name, 'إأآ', 'ااا'), '\s+', ' ', 'g'))
      and p.status='approved'
    order by p.created_at limit 1;

    if v_child is not null then
      update public.person_relationships r
      set status='approved', approved_by=v_admin, approved_at=coalesce(r.approved_at,now()), updated_at=now()
      where r.status='pending' and (
        (r.source_person_id=v_yas and r.target_person_id=v_child and r.relation_type='parent') or
        (r.source_person_id=v_child and r.target_person_id=v_yas and r.relation_type='child')
      );
      if not exists (select 1 from public.canonical_parent_edges e where e.parent_id=v_yas and e.child_id=v_child) then
        insert into public.person_relationships(source_person_id,target_person_id,relation_type,status,created_by,approved_by,approved_at)
        values(v_yas,v_child,'parent','approved',v_admin,v_admin,now());
      end if;
    end if;
  end loop;

  insert into public.lineages(root_person_id,display_name,status,created_by,approved_by,approved_at)
  values(v_root,'عائلة محمد علي إدريس','approved',v_admin,v_admin,now())
  on conflict (root_person_id) do update
  set display_name=excluded.display_name,status='approved',approved_by=excluded.approved_by,
      approved_at=coalesce(public.lineages.approved_at,excluded.approved_at),updated_at=now()
  returning id into v_lineage;

  if v_lineage is null then select id into v_lineage from public.lineages where root_person_id=v_root; end if;

  insert into public.lineage_branches(lineage_id,branch_person_id,display_name,status,created_by,approved_by,approved_at)
  values(v_lineage,v_yas,'فرع يس خيري','approved',v_admin,v_admin,now())
  on conflict (lineage_id,branch_person_id) do update
  set display_name=excluded.display_name,status='approved',approved_by=excluded.approved_by,
      approved_at=coalesce(public.lineage_branches.approved_at,excluded.approved_at),updated_at=now();
end
$$;

create or replace function public.get_person_ancestors(p_person_id uuid, p_max_depth integer default 12)
returns table (ancestor_person_id uuid, full_name text, gender text, generation integer, path uuid[])
language sql stable security invoker set search_path = ''
as $$
  with recursive ancestry(person_id,generation,path) as (
    select p_person_id,0,array[p_person_id]::uuid[]
    union all
    select e.parent_id,a.generation+1,a.path||e.parent_id
    from ancestry a join public.canonical_parent_edges e on e.child_id=a.person_id
    where a.generation < greatest(1,least(coalesce(p_max_depth,12),20)) and not (e.parent_id=any(a.path))
  ), ranked as (
    select a.*,row_number() over(partition by a.person_id order by a.generation,a.path::text) rn
    from ancestry a where a.generation>0
  )
  select r.person_id,p.full_name,p.gender,r.generation,r.path
  from ranked r join public.people p on p.id=r.person_id and p.status='approved'
  where r.rn=1 order by r.generation,p.full_name;
$$;

create or replace function public.get_lineage_descendants(p_ancestor_person_id uuid, p_max_depth integer default 12)
returns table (person_id uuid, full_name text, gender text, generation integer, parent_person_id uuid, path uuid[])
language sql stable security invoker set search_path = ''
as $$
  with recursive descendants(person_id,generation,parent_person_id,path) as (
    select p_ancestor_person_id,0,null::uuid,array[p_ancestor_person_id]::uuid[]
    union all
    select e.child_id,d.generation+1,d.person_id,d.path||e.child_id
    from descendants d join public.canonical_parent_edges e on e.parent_id=d.person_id
    where d.generation < greatest(1,least(coalesce(p_max_depth,12),20)) and not (e.child_id=any(d.path))
  ), ranked as (
    select d.*,row_number() over(partition by d.person_id order by d.generation,d.path::text) rn from descendants d
  )
  select r.person_id,p.full_name,p.gender,r.generation,r.parent_person_id,r.path
  from ranked r join public.people p on p.id=r.person_id and p.status='approved'
  where r.rn=1 order by r.generation,p.full_name;
$$;

create or replace function public.get_person_lineage_context(p_person_id uuid)
returns table (
  lineage_id uuid, lineage_name text, root_person_id uuid, root_name text,
  generation integer, branch_person_id uuid, branch_name text, ancestry_path jsonb
)
language sql stable security invoker set search_path = ''
as $$
  with recursive ancestry(person_id,generation,path) as (
    select p_person_id,0,array[p_person_id]::uuid[]
    union all
    select e.parent_id,a.generation+1,a.path||e.parent_id
    from ancestry a join public.canonical_parent_edges e on e.child_id=a.person_id
    where a.generation<20 and not(e.parent_id=any(a.path))
  ), matches as (
    select l.id lineage_id,l.display_name lineage_name,l.root_person_id,a.generation,a.path
    from ancestry a join public.lineages l on l.root_person_id=a.person_id and l.status='approved'
  )
  select m.lineage_id,m.lineage_name,m.root_person_id,rootp.full_name,m.generation,
    case when m.generation=0 then m.root_person_id else m.path[m.generation] end as branch_person_id,
    branchp.full_name as branch_name,
    (
      select jsonb_agg(jsonb_build_object(
        'person_id',u.person_id,'full_name',pp.full_name,'generation',m.generation-(u.ord::integer-1)
      ) order by u.ord desc)
      from unnest(m.path) with ordinality as u(person_id,ord)
      join public.people pp on pp.id=u.person_id
    ) as ancestry_path
  from matches m
  join public.people rootp on rootp.id=m.root_person_id
  left join public.people branchp on branchp.id=case when m.generation=0 then m.root_person_id else m.path[m.generation] end
  order by m.generation desc,m.lineage_name;
$$;

create or replace view public.lineage_integrity_issues
with (security_invoker = true)
as
with parent_edges as (
  select e.parent_id,e.child_id,p.gender as parent_gender
  from public.canonical_parent_edges e join public.people p on p.id=e.parent_id
), counts as (
  select child_id,
         count(*) filter(where parent_gender='male') as father_count,
         count(*) filter(where parent_gender='female') as mother_count,
         count(*) as parent_count
  from parent_edges group by child_id
)
select c.child_id,p.full_name,c.father_count,c.mother_count,c.parent_count,
       case when c.father_count>1 then 'multiple_fathers'
            when c.mother_count>1 then 'multiple_mothers'
            when c.parent_count>2 then 'more_than_two_parents'
            else 'ok' end as issue_type
from counts c join public.people p on p.id=c.child_id
where c.father_count>1 or c.mother_count>1 or c.parent_count>2;

alter table public.lineages enable row level security;
alter table public.lineage_branches enable row level security;
alter table public.family_units enable row level security;

revoke all on table public.lineages from anon,authenticated;
revoke all on table public.lineage_branches from anon,authenticated;
revoke all on table public.family_units from anon,authenticated;
revoke all on table public.canonical_parent_edges from anon,authenticated;
revoke all on table public.family_unit_members from anon,authenticated;
revoke all on table public.lineage_integrity_issues from anon,authenticated;

grant select on table public.lineages,public.lineage_branches,public.family_units,public.canonical_parent_edges,public.family_unit_members to anon,authenticated;
grant insert,update,delete on table public.lineages,public.lineage_branches,public.family_units to authenticated;

drop policy if exists "Public can read approved lineages" on public.lineages;
create policy "Public can read approved lineages" on public.lineages for select to anon using(status='approved');
drop policy if exists "Members can read approved lineages" on public.lineages;
create policy "Members can read approved lineages" on public.lineages for select to authenticated
using(status='approved' or created_by=(select auth.uid()) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')));
drop policy if exists "Admins can manage lineages" on public.lineages;
create policy "Admins can manage lineages" on public.lineages for all to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')))
with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')));

drop policy if exists "Public can read approved lineage branches" on public.lineage_branches;
create policy "Public can read approved lineage branches" on public.lineage_branches for select to anon using(status='approved');
drop policy if exists "Members can read approved lineage branches" on public.lineage_branches;
create policy "Members can read approved lineage branches" on public.lineage_branches for select to authenticated
using(status='approved' or created_by=(select auth.uid()) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')));
drop policy if exists "Admins can manage lineage branches" on public.lineage_branches;
create policy "Admins can manage lineage branches" on public.lineage_branches for all to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')))
with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')));

drop policy if exists "Public can read approved family units" on public.family_units;
create policy "Public can read approved family units" on public.family_units for select to anon using(status='approved');
drop policy if exists "Members can read approved family units" on public.family_units;
create policy "Members can read approved family units" on public.family_units for select to authenticated
using(status='approved' or created_by=(select auth.uid()) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')));
drop policy if exists "Admins can manage family units" on public.family_units;
create policy "Admins can manage family units" on public.family_units for all to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')))
with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and p.role in('admin','super_admin')));

revoke all on function public.get_person_ancestors(uuid,integer) from public;
revoke all on function public.get_lineage_descendants(uuid,integer) from public;
revoke all on function public.get_person_lineage_context(uuid) from public;
grant execute on function public.get_person_ancestors(uuid,integer) to anon,authenticated;
grant execute on function public.get_lineage_descendants(uuid,integer) to anon,authenticated;
grant execute on function public.get_person_lineage_context(uuid) to anon,authenticated;

notify pgrst,'reload schema';
commit;
