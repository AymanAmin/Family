-- Keep PostgreSQL planner estimates fresh for the small public directory tables.
-- Directory pagination uses planned counts, and stale statistics can otherwise
-- make PostgREST return HTTP 416 for a valid second page.

alter table public.families set (
  autovacuum_analyze_threshold = 1,
  autovacuum_analyze_scale_factor = 0.02
);

alter table public.people set (
  autovacuum_analyze_threshold = 1,
  autovacuum_analyze_scale_factor = 0.02
);

analyze public.families;
analyze public.people;
