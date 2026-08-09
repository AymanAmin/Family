revoke execute on function public.get_lineage_sync_health() from anon;
revoke execute on function public.get_lineage_sync_health() from public;
grant execute on function public.get_lineage_sync_health() to authenticated;
