import fs from 'node:fs'
import path from 'node:path'

const migrationsDir = path.resolve('supabase/migrations')

if (!fs.existsSync(migrationsDir)) {
  console.error('Missing supabase/migrations directory.')
  process.exit(1)
}

const files = fs.readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()

const versions = new Map()
const invalid = []

for (const file of files) {
  const match = file.match(/^(\d+)_([a-z0-9_]+)\.sql$/i)
  if (!match) {
    invalid.push(file)
    continue
  }

  const version = match[1]
  const existing = versions.get(version) ?? []
  existing.push(file)
  versions.set(version, existing)
}

const duplicates = [...versions.entries()].filter(([, versionFiles]) => versionFiles.length > 1)

if (invalid.length || duplicates.length) {
  if (invalid.length) {
    console.error('Invalid migration filenames:')
    for (const file of invalid) console.error(`- ${file}`)
  }

  if (duplicates.length) {
    console.error('Duplicate migration versions:')
    for (const [version, versionFiles] of duplicates) {
      console.error(`- ${version}: ${versionFiles.join(', ')}`)
    }
  }

  process.exit(1)
}

console.log(`Migration versions are unique (${files.length} SQL files checked).`)
