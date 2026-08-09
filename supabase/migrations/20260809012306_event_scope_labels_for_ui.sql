create or replace function public.list_event_scope_labels_v1(p_limit integer default 100)
returns table(
  event_id uuid,
  title text,
  scope_type text,
  scope_id uuid,
  scope_name text
)
language sql
stable
security invoker
set search_path=''
as $$
  select
    e.id,
    e.title,
    e.scope_type,
    e.scope_id,
    case e.scope_type
      when 'household' then 'أسرة ' || (select p.full_name from public.people p where p.id=e.scope_id)
      when 'lineage' then regexp_replace((select l.display_name from public.lineages l where l.id=e.scope_id),'^عائلة\s+','نسب ')
      when 'branch' then (select b.display_name from public.lineage_branches b where b.id=e.scope_id)
      else 'عام'
    end
  from public.events e
  where e.status='approved'
  order by e.event_date desc nulls last,e.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),500));
$$;

revoke all on function public.list_event_scope_labels_v1(integer) from public;
grant execute on function public.list_event_scope_labels_v1(integer) to anon,authenticated;
