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
]

let setup = fs.readFileSync(setupPath, 'utf8').trimEnd()
let changed = false

for (const migration of migrations) {
  const fileName = migration.split('/').pop()
  const marker = `-- INCLUDED MIGRATION: ${fileName}`
  if (setup.includes(marker)) continue
  const sql = fs.readFileSync(migration, 'utf8').trim()
  setup += `\n\n${marker}\n${sql}\n`
  changed = true
}

if (changed) {
  fs.writeFileSync(setupPath, `${setup.trimEnd()}\n`)
  console.log('SETUP.sql updated with latest migrations')
} else {
  console.log('SETUP.sql already current')
}
