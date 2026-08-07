import fs from 'node:fs'

const appPath = 'src/App.tsx'
let app = fs.readFileSync(appPath, 'utf8')

if (!app.includes("import KinshipNetwork from './components/KinshipNetwork'")) {
  const importMarker = "import Phase3AdminQueue from './components/Phase3AdminQueue'\n"
  if (!app.includes(importMarker)) throw new Error('Phase3AdminQueue import marker not found')
  app = app.replace(importMarker, `${importMarker}import KinshipNetwork from './components/KinshipNetwork'\n`)
}

if (!app.includes('<KinshipNetwork')) {
  const relationshipStart = `            <div className="detail-section">\n              <div className="section-title"><div><span className="eyebrow">صلة الرحم</span><h2>العلاقات المعتمدة</h2></div></div>`
  const startIndex = app.indexOf(relationshipStart)
  if (startIndex < 0) throw new Error('Relationship section start not found')

  const accountBoundary = `\n          </section>\n        )}\n\n        {schemaReady && view === 'account'`
  const endIndex = app.indexOf(accountBoundary, startIndex)
  if (endIndex < 0) throw new Error('Person section boundary not found')

  const replacement = `            <KinshipNetwork\n              personId={selectedPerson.id}\n              personName={selectedPerson.full_name}\n              onOpenPerson={(id) => {\n                const person = people.find((item) => item.id === id)\n                if (person) void openPerson(person)\n              }}\n              onAddRelation={() => {\n                if (!requireAccount()) return\n                setRelationshipForm((current) => ({ ...current, source_person_id: selectedPerson.id }))\n                setAddMode('relationship')\n                setView('add')\n              }}\n            />`

  app = app.slice(0, startIndex) + replacement + app.slice(endIndex)
}

fs.writeFileSync(appPath, app)

const setupPath = 'supabase/SETUP.sql'
let setup = fs.readFileSync(setupPath, 'utf8')
const migration = fs.readFileSync('supabase/migrations/202608070007_smart_kinship_inference.sql', 'utf8').trim()
if (!setup.includes('-- PHASE 4: SMART KINSHIP INFERENCE')) {
  setup = `${setup.trim()}\n\n${migration}\n`
  fs.writeFileSync(setupPath, setup)
}
