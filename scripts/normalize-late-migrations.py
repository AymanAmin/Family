from pathlib import Path

renames = [
    ('supabase/migrations/202608070021_relationship_edit_delete_requests.sql', 'supabase/migrations/202608070023_relationship_edit_delete_requests.sql'),
    ('supabase/migrations/202608070023_relationship_changes_in_my_activity.sql', 'supabase/migrations/202608070024_relationship_changes_in_my_activity.sql'),
    ('supabase/migrations/202608070022_admin_contributor_stats_and_link_integrity.sql', 'supabase/migrations/202608070026_admin_contributor_stats_and_link_integrity.sql'),
]

for old_name, new_name in renames:
    old_path = Path(old_name)
    new_path = Path(new_name)
    if old_path.exists() and not new_path.exists():
        old_path.rename(new_path)
        print(f'Renamed {old_path.name} -> {new_path.name}')
    elif old_path.exists() and new_path.exists():
        old_path.unlink()
        print(f'Removed duplicate {old_path.name}')

component = Path('src/components/DirectRelationshipManager.tsx')
if component.exists():
    text = component.read_text(encoding='utf-8')
    text = text.replace('migration رقم 021 لتفعيل تعديل وحذف صلات القرابة', 'migration رقم 023 لتفعيل تعديل وحذف صلات القرابة')
    component.write_text(text, encoding='utf-8')

stats = Path('src/components/AdminContributorStats.tsx')
if stats.exists():
    text = stats.read_text(encoding='utf-8')
    text = text.replace('migration رقم 022 لتفعيل إحصائيات المساهمين', 'migration رقم 026 لتفعيل إحصائيات المساهمين')
    stats.write_text(text, encoding='utf-8')

sync = Path('scripts/sync-setup-latest.mjs')
if sync.exists():
    text = sync.read_text(encoding='utf-8')
    start = text.index('const migrations = [')
    end = text.index(']\n', start) + 2
    canonical = """const migrations = [
  'supabase/migrations/202608070009_extended_parent_sibling_kinship.sql',
  'supabase/migrations/202608070010_public_scale_performance.sql',
  'supabase/migrations/202608070011_smart_duplicate_person_search.sql',
  'supabase/migrations/202608070012_kinship_path_explorer.sql',
  'supabase/migrations/202608070013_admin_role_management_and_direct_approval.sql',
  'supabase/migrations/202608070014_person_death_date_integrity.sql',
  'supabase/migrations/202608070015_paginated_moderation_feed.sql',
  'supabase/migrations/202608070016_paginated_secondary_moderation.sql',
  'supabase/migrations/202608070017_full_role_scopes_and_moderation.sql',
  'supabase/migrations/202608070018_family_moderator_event_scope_guard.sql',
  'supabase/migrations/202608070019_my_submission_activity_feed.sql',
  'supabase/migrations/202608070020_verified_people_primary_family_relationship_edits_event_people_arabic_search.sql',
  'supabase/migrations/202608070021_edit_review_details.sql',
  'supabase/migrations/202608070022_social_feature_hardening.sql',
  'supabase/migrations/202608070023_relationship_edit_delete_requests.sql',
  'supabase/migrations/202608070024_relationship_changes_in_my_activity.sql',
  'supabase/migrations/202608070025_link_integrity_repair_and_unique_guard.sql',
  'supabase/migrations/202608070026_admin_contributor_stats_and_link_integrity.sql',
]
"""
    text = text[:start] + canonical + text[end:]
    sync.write_text(text, encoding='utf-8')
