import fs from 'node:fs'

const setupPath = 'supabase/SETUP.sql'
const migrations = [
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

const current = fs.readFileSync(setupPath, 'utf8')
const marker = '\n-- INCLUDED MIGRATION:'
const firstMarker = current.indexOf(marker)
const base = (firstMarker === -1 ? current : current.slice(0, firstMarker)).trimEnd()

const blocks = migrations
  .filter((migration) => fs.existsSync(migration))
  .map((migration) => {
    const fileName = migration.split('/').pop()
    const sql = fs.readFileSync(migration, 'utf8').trim()
    return `-- INCLUDED MIGRATION: ${fileName}\n${sql}`
  })

const next = `${base}\n\n${blocks.join('\n\n')}\n`

if (next !== current) {
  fs.writeFileSync(setupPath, next)
  console.log('SETUP.sql rebuilt canonically from current migrations')
} else {
  console.log('SETUP.sql already canonical')
}
