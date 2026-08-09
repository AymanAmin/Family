alter function public.approve_lineage_structure_candidate(uuid, text) security definer;
alter function public.approve_lineage_structure_candidate(uuid, text) set search_path = '';
revoke all on function public.approve_lineage_structure_candidate(uuid, text) from public;
revoke all on function public.approve_lineage_structure_candidate(uuid, text) from anon;
grant execute on function public.approve_lineage_structure_candidate(uuid, text) to authenticated;

comment on function public.approve_lineage_structure_candidate(uuid, text) is 'Admin-only lineage candidate approval. SECURITY DEFINER is required so the protected refresh_lineage_structure routine can run without granting authenticated users access to the private schema.';
