import fs from 'node:fs'

const setupPath = 'supabase/SETUP.sql'
const migrationPath = 'supabase/migrations/202608070006_harden_edit_requests.sql'
let setup = fs.readFileSync(setupPath, 'utf8')
const migration = fs.readFileSync(migrationPath, 'utf8')

if (!setup.includes('-- SECURITY HARDENING: edit requests must only be created through request_content_edit().')) {
  setup = `${setup.trim()}\n\n${migration.trim()}\n`
  fs.writeFileSync(setupPath, setup)
}
