do $$
declare
  r record;
begin
  for r in select id from public.events loop
    perform private.infer_event_scope(r.id);
  end loop;
end $$;
