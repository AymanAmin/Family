alter table public.lineages
  add column if not exists anchor_person_id uuid references public.people(id) on delete restrict,
  add column if not exists auto_sync_enabled boolean not null default true,
  add column if not exists root_source text not null default 'approved',
  add column if not exists sync_state text not null default 'synced',
  add column if not exists sync_note text,
  add column if not exists last_synced_at timestamptz;

update public.lineages
set anchor_person_id = root_person_id
where anchor_person_id is null;

alter table public.lineages
  alter column anchor_person_id set not null;

do $$ begin
  alter table public.lineages add constraint lineages_root_source_check check (root_source in ('approved','auto_sync'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.lineages add constraint lineages_sync_state_check check (sync_state in ('synced','needs_review'));
exception when duplicate_object then null; end $$;
create index if not exists lineages_anchor_person_idx on public.lineages(anchor_person_id);

alter table public.lineage_branches
  add column if not exists is_current boolean not null default true,
  add column if not exists sync_source text not null default 'auto';
do $$ begin
  alter table public.lineage_branches add constraint lineage_branches_sync_source_check check (sync_source in ('auto','manual'));
exception when duplicate_object then null; end $$;
create index if not exists lineage_branches_current_idx on public.lineage_branches(lineage_id,status,is_current);

create or replace function private.refresh_lineage_structure(
  p_lineage_id uuid,
  p_reason text default 'relationship_change'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lineage public.lineages%rowtype;
  v_anchor public.people%rowtype;
  v_candidate uuid;
  v_candidate_name text;
  v_next_father uuid;
  v_next_father_name text;
  v_male_parent_count integer;
  v_overlap_count integer;
  v_path uuid[];
  v_old_root uuid;
  v_old_root_name text;
  v_new_display_name text;
  v_note text := 'متزامن مع بيانات النسب الحالية.';
  v_steps integer := 0;
begin
  select * into v_lineage
  from public.lineages l
  where l.id = p_lineage_id
    and l.status = 'approved'
  for update;

  if not found or not v_lineage.auto_sync_enabled then
    return;
  end if;

  select * into v_anchor
  from public.people p
  where p.id = v_lineage.anchor_person_id
    and p.status = 'approved'
    and p.archived_at is null;

  if not found then
    update public.lineages
    set sync_state = 'needs_review',
        sync_note = 'الشخص المرجعي للأصل غير نشط أو مؤرشف.',
        last_synced_at = now()
    where id = p_lineage_id;
    return;
  end if;

  v_candidate := v_anchor.id;
  v_path := array[v_anchor.id]::uuid[];

  loop
    exit when v_steps >= 20;

    select count(*)::integer,
           min(p.id::text)::uuid,
           min(p.full_name)
      into v_male_parent_count, v_next_father, v_next_father_name
    from public.canonical_parent_edges e
    join public.people p on p.id = e.parent_id
    where e.child_id = v_candidate
      and p.status = 'approved'
      and p.archived_at is null
      and p.gender = 'male';

    if v_male_parent_count = 0 then
      exit;
    end if;

    if v_male_parent_count > 1 then
      update public.lineages
      set sync_state = 'needs_review',
          sync_note = 'يوجد أكثر من أب مسجل في مسار الأصل؛ لم يتم تغيير الجد الأعلى تلقائيًا.',
          last_synced_at = now()
      where id = p_lineage_id;
      return;
    end if;

    if v_next_father = any(v_path) then
      update public.lineages
      set sync_state = 'needs_review',
          sync_note = 'تم اكتشاف دورة في سلسلة الآباء؛ أوقف التحديث التلقائي لهذا الأصل مؤقتًا.',
          last_synced_at = now()
      where id = p_lineage_id;
      return;
    end if;

    with recursive
    other_covered(person_id,path) as (
      select l.root_person_id, array[l.root_person_id]::uuid[]
      from public.lineages l
      where l.status = 'approved'
        and l.id <> p_lineage_id
      union all
      select e.child_id, c.path || e.child_id
      from other_covered c
      join public.canonical_parent_edges e on e.parent_id = c.person_id
      where cardinality(c.path) < 21
        and not (e.child_id = any(c.path))
    ),
    proposed(person_id,path) as (
      select v_next_father, array[v_next_father]::uuid[]
      union all
      select e.child_id, p.path || e.child_id
      from proposed p
      join public.canonical_parent_edges e on e.parent_id = p.person_id
      where cardinality(p.path) < 21
        and not (e.child_id = any(p.path))
    )
    select count(distinct p.person_id)::integer
      into v_overlap_count
    from proposed p
    join other_covered o on o.person_id = p.person_id;

    if coalesce(v_overlap_count,0) > 0 then
      update public.lineages
      set sync_state = 'needs_review',
          sync_note = 'الأب الأعلى المقترح يتقاطع مع أصل معتمد آخر؛ لم يتم الدمج أو النقل تلقائيًا.',
          last_synced_at = now()
      where id = p_lineage_id;
      return;
    end if;

    v_candidate := v_next_father;
    v_candidate_name := v_next_father_name;
    v_path := array_append(v_path, v_candidate);
    v_steps := v_steps + 1;
  end loop;

  select p.full_name into v_candidate_name
  from public.people p where p.id = v_candidate;

  v_old_root := v_lineage.root_person_id;
  select p.full_name into v_old_root_name from public.people p where p.id = v_old_root;

  v_new_display_name := v_lineage.display_name;
  if v_lineage.display_name = 'عائلة ' || coalesce(v_old_root_name,'') then
    v_new_display_name := 'عائلة ' || v_candidate_name;
  end if;

  update public.lineages
  set root_person_id = v_candidate,
      display_name = v_new_display_name,
      root_source = case when v_candidate = anchor_person_id then 'approved' else 'auto_sync' end,
      sync_state = 'synced',
      sync_note = case
        when v_candidate = anchor_person_id then 'لا يوجد أب أعلى واضح فوق الأصل المعتمد حاليًا.'
        when v_candidate <> v_old_root then 'تم تحديث الجد الأعلى تلقائيًا إلى ' || v_candidate_name || '.'
        else 'متزامن مع أعلى أب معروف: ' || v_candidate_name || '.'
      end,
      last_synced_at = now()
  where id = p_lineage_id;

  update public.lineage_branches
  set is_current = false,
      updated_at = now()
  where lineage_id = p_lineage_id
    and is_current = true;

  insert into public.lineage_branches(
    lineage_id, branch_person_id, display_name, status,
    created_by, approved_by, approved_at, is_current, sync_source
  )
  select
    p_lineage_id,
    child.id,
    'فرع ' || child.full_name,
    'approved',
    v_lineage.created_by,
    coalesce(v_lineage.approved_by, v_lineage.created_by),
    coalesce(v_lineage.approved_at, now()),
    true,
    'auto'
  from public.canonical_parent_edges e
  join public.people child on child.id = e.child_id
  where e.parent_id = v_candidate
    and child.status = 'approved'
    and child.archived_at is null
  on conflict (lineage_id, branch_person_id) do update
  set display_name = case
        when public.lineage_branches.sync_source = 'manual' then public.lineage_branches.display_name
        else excluded.display_name
      end,
      status = 'approved',
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at,
      is_current = true,
      sync_source = case
        when public.lineage_branches.sync_source = 'manual' then 'manual'
        else 'auto'
      end,
      updated_at = now();
end;
$$;

revoke all on function private.refresh_lineage_structure(uuid,text) from public, anon, authenticated;

create or replace function private.sync_lineages_after_parent_relationship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_should_sync boolean := false;
  v_lineage_id uuid;
begin
  if tg_op = 'INSERT' then
    v_should_sync := new.status = 'approved' and new.relation_type in ('parent','child');
  elsif tg_op = 'DELETE' then
    v_should_sync := old.status = 'approved' and old.relation_type in ('parent','child');
  else
    v_should_sync :=
      (old.status = 'approved' and old.relation_type in ('parent','child'))
      or (new.status = 'approved' and new.relation_type in ('parent','child'));
  end if;

  if not v_should_sync then
    return coalesce(new,old);
  end if;

  for v_lineage_id in
    select l.id
    from public.lineages l
    where l.status = 'approved'
      and l.auto_sync_enabled
  loop
    perform private.refresh_lineage_structure(v_lineage_id, 'parent_relationship_change');
  end loop;

  return coalesce(new,old);
end;
$$;

revoke all on function private.sync_lineages_after_parent_relationship() from public, anon, authenticated;

drop trigger if exists person_relationships_sync_lineages on public.person_relationships;
create trigger person_relationships_sync_lineages
after insert or delete or update of source_person_id,target_person_id,relation_type,status
on public.person_relationships
for each row execute function private.sync_lineages_after_parent_relationship();

create or replace function public.get_person_lineage_context(p_person_id uuid)
returns table(
  lineage_id uuid,
  lineage_name text,
  root_person_id uuid,
  root_name text,
  generation integer,
  branch_person_id uuid,
  branch_name text,
  ancestry_path jsonb
)
language sql
stable
set search_path = ''
as $$
  with recursive ancestry(person_id,generation,path) as (
    select p_person_id,0,array[p_person_id]::uuid[]
    union all
    select e.parent_id,a.generation+1,a.path||e.parent_id
    from ancestry a
    join public.canonical_parent_edges e on e.child_id=a.person_id
    where a.generation<20 and not(e.parent_id=any(a.path))
  ), matches as (
    select l.id lineage_id,l.display_name lineage_name,l.root_person_id,a.generation,a.path
    from ancestry a
    join public.lineages l on l.root_person_id=a.person_id and l.status='approved'
  ), resolved as (
    select
      m.*,
      case when m.generation=0 then m.root_person_id else m.path[m.generation] end as resolved_branch_person_id
    from matches m
  )
  select
    m.lineage_id,
    m.lineage_name,
    m.root_person_id,
    rootp.full_name,
    m.generation,
    m.resolved_branch_person_id,
    case
      when m.generation=0 then rootp.full_name
      else coalesce(lb.display_name, branchp.full_name)
    end as branch_name,
    (
      select jsonb_agg(
        jsonb_build_object(
          'person_id',u.person_id,
          'full_name',pp.full_name,
          'generation',m.generation-(u.ord::integer-1)
        ) order by u.ord desc
      )
      from unnest(m.path) with ordinality as u(person_id,ord)
      join public.people pp on pp.id=u.person_id
    ) as ancestry_path
  from resolved m
  join public.people rootp on rootp.id=m.root_person_id and rootp.status='approved' and rootp.archived_at is null
  left join public.people branchp on branchp.id=m.resolved_branch_person_id
  left join public.lineage_branches lb
    on lb.lineage_id=m.lineage_id
   and lb.branch_person_id=m.resolved_branch_person_id
   and lb.status='approved'
   and lb.is_current=true
  order by m.generation desc,m.lineage_name;
$$;

create or replace function public.get_lineage_sync_health()
returns table(
  total_lineages integer,
  synced_lineages integer,
  needs_review integer,
  auto_sync_enabled integer,
  last_synced_at timestamptz,
  issues jsonb
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id=auth.uid()
      and p.account_status='active'
      and p.role in ('admin','super_admin')
  ) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  return query
  select
    count(*)::integer,
    count(*) filter (where l.sync_state='synced')::integer,
    count(*) filter (where l.sync_state='needs_review')::integer,
    count(*) filter (where l.auto_sync_enabled)::integer,
    max(l.last_synced_at),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'lineage_id',l.id,
        'lineage_name',l.display_name,
        'root_name',rootp.full_name,
        'anchor_name',anchorp.full_name,
        'note',l.sync_note
      ) order by l.display_name
    ) filter (where l.sync_state='needs_review'),'[]'::jsonb)
  from public.lineages l
  join public.people rootp on rootp.id=l.root_person_id
  join public.people anchorp on anchorp.id=l.anchor_person_id
  where l.status='approved';
end;
$$;

revoke all on function public.get_lineage_sync_health() from public;
grant execute on function public.get_lineage_sync_health() to authenticated;

create or replace function public.approve_lineage_structure_candidate(p_root_person_id uuid, p_display_name text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_root_name text;
  v_lineage_id uuid;
  v_display_name text;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p
    where p.id=v_actor and p.account_status='active' and p.role in ('admin','super_admin')
  ) then
    raise exception 'Not authorized to approve lineage structure';
  end if;

  select p.full_name into v_root_name
  from public.people p
  where p.id=p_root_person_id and p.status='approved' and p.archived_at is null;

  if v_root_name is null then raise exception 'Root person is not active'; end if;
  if exists (select 1 from public.canonical_parent_edges e where e.child_id=p_root_person_id) then
    raise exception 'Selected person is no longer a top ancestor';
  end if;
  if not exists (select 1 from public.canonical_parent_edges e where e.parent_id=p_root_person_id) then
    raise exception 'Selected person has no descendants';
  end if;

  if exists (
    with recursive covered(person_id,path) as (
      select l.root_person_id,array[l.root_person_id]::uuid[] from public.lineages l
      where l.status='approved' and l.root_person_id<>p_root_person_id
      union all
      select e.child_id,c.path||e.child_id from covered c
      join public.canonical_parent_edges e on e.parent_id=c.person_id
      where cardinality(c.path)<21 and not(e.child_id=any(c.path))
    ), proposed(person_id,path) as (
      select p_root_person_id,array[p_root_person_id]::uuid[]
      union all
      select e.child_id,p.path||e.child_id from proposed p
      join public.canonical_parent_edges e on e.parent_id=p.person_id
      where cardinality(p.path)<21 and not(e.child_id=any(p.path))
    )
    select 1 from proposed p join covered c on c.person_id=p.person_id limit 1
  ) then raise exception 'Candidate overlaps an existing approved lineage'; end if;

  v_display_name:=coalesce(nullif(trim(p_display_name),''),'عائلة '||v_root_name);

  insert into public.lineages(
    root_person_id,anchor_person_id,display_name,status,created_by,approved_by,approved_at,
    auto_sync_enabled,root_source,sync_state,sync_note,last_synced_at
  ) values (
    p_root_person_id,p_root_person_id,v_display_name,'approved',v_actor,v_actor,now(),
    true,'approved','synced','تم اعتماد الأصل وتفعيل المزامنة التلقائية.',now()
  )
  on conflict (root_person_id) do update
  set anchor_person_id=coalesce(public.lineages.anchor_person_id,excluded.anchor_person_id),
      display_name=excluded.display_name,
      status='approved',approved_by=v_actor,approved_at=now(),updated_at=now(),
      auto_sync_enabled=true,sync_state='synced',sync_note='تم اعتماد الأصل وتفعيل المزامنة التلقائية.',last_synced_at=now()
  returning id into v_lineage_id;

  perform private.refresh_lineage_structure(v_lineage_id,'candidate_approval');
  return v_lineage_id;
end;
$$;

do $$
declare v_id uuid;
begin
  for v_id in select id from public.lineages where status='approved' loop
    perform private.refresh_lineage_structure(v_id,'migration_bootstrap');
  end loop;
end $$;
