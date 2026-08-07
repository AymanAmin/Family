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
  'supabase/migrations/202608070021_relationship_edit_delete_requests.sql',
  'supabase/migrations/202608070022_social_feature_hardening.sql',
  'supabase/migrations/202608070022_admin_contributor_stats_and_link_integrity.sql',
  'supabase/migrations/202608070023_relationship_edit_delete_requests.sql',
  'supabase/migrations/202608070023_relationship_changes_in_my_activity.sql',
  'supabase/migrations/202608070025_link_integrity_repair_and_unique_guard.sql',
]

let setup = fs.readFileSync(setupPath, 'utf8').trimEnd()
let changed = false

for (const migration of migrations) {
  if (!fs.existsSync(migration)) continue
  const fileName = migration.split('/').pop()
  const marker = `-- INCLUDED MIGRATION: ${fileName}`
  const sql = fs.readFileSync(migration, 'utf8').trim()
  const block = `${marker}\n${sql}`
  const start = setup.indexOf(marker)

  if (start === -1) {
    setup += `\n\n${block}`
    changed = true
    continue
  }

  const nextMarker = setup.indexOf('\n-- INCLUDED MIGRATION:', start + marker.length)
  const end = nextMarker === -1 ? setup.length : nextMarker
  const currentBlock = setup.slice(start, end).trimEnd()

  if (currentBlock !== block) {
    const suffix = nextMarker === -1 ? '' : setup.slice(nextMarker)
    setup = `${setup.slice(0, start).trimEnd()}\n\n${block}${suffix}`
    changed = true
  }
}

if (changed) {
  fs.writeFileSync(setupPath, `${setup.trimEnd()}\n`)
  console.log('SETUP.sql refreshed with current migration contents')
} else {
  console.log('SETUP.sql already current')
}
