import fs from 'node:fs'

const appPath = 'src/App.tsx'
let app = fs.readFileSync(appPath, 'utf8')

function mustReplace(find, replacement, label) {
  if (app.includes(replacement)) return
  if (!app.includes(find)) throw new Error(`Missing ${label}`)
  app = app.replace(find, replacement)
}

mustReplace(
  `import { getApplicationUrl, supabase, supabaseConfiguration } from './lib/supabase'\n`,
  `import { getApplicationUrl, supabase, supabaseConfiguration } from './lib/supabase'\nimport RecordEditButton from './components/RecordEditButton'\nimport PersonFamilyMemberships from './components/PersonFamilyMemberships'\nimport FamilyMembersPanel from './components/FamilyMembersPanel'\nimport Phase3AdminQueue from './components/Phase3AdminQueue'\n`,
  'phase3 imports',
)

mustReplace(
  `  status: RecordStatus\n  created_at: string\n}\n\ntype RelatedFamily`,
  `  status: RecordStatus\n  created_by: string\n  created_at: string\n}\n\ntype RelatedFamily`,
  'family creator field',
)
mustReplace(
  `  family_id: string | null\n  families?: RelatedFamily\n  created_at: string\n}\n\ntype RelatedPerson`,
  `  family_id: string | null\n  families?: RelatedFamily\n  created_by: string\n  created_at: string\n}\n\ntype RelatedPerson`,
  'person creator field',
)
mustReplace(
  `  family_id: string | null\n  families?: RelatedFamily\n  created_at: string\n}\n\ntype PendingRecord`,
  `  family_id: string | null\n  families?: RelatedFamily\n  created_by: string\n  created_at: string\n}\n\ntype PendingRecord`,
  'event creator field',
)

app = app.replaceAll(`.select('id,name,description,origin_place,status,created_at')`, `.select('id,name,description,origin_place,status,created_by,created_at')`)
app = app.replaceAll(`.select('id,full_name,gender,birth_year,is_deceased,description,status,family_id,created_at,families(name)')`, `.select('id,full_name,gender,birth_year,is_deceased,description,status,family_id,created_by,created_at,families(name)')`)
app = app.replaceAll(`.select('id,event_type,title,description,event_date,location_name,status,family_id,created_at,families(name)')`, `.select('id,event_type,title,description,event_date,location_name,status,family_id,created_by,created_at,families(name)')`)

if (!app.includes(`membership_type: 'birth'`)) {
  const start = app.indexOf(`  async function submitPerson(event: FormEvent<HTMLFormElement>) {`)
  const end = app.indexOf(`  async function submitEvent`, start)
  if (start < 0 || end < 0) throw new Error('Missing submitPerson boundaries')
  const replacement = `  async function submitPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session || !requireAccount()) return
    if (personForm.full_name.trim().length < 3) return showMessage('اكتب الاسم الكامل.', 'error')
    setBusy(true)
    const { data: newPerson, error } = await supabase.from('people').insert({
      full_name: personForm.full_name.trim(),
      family_id: personForm.family_id || null,
      gender: personForm.gender || null,
      birth_year: personForm.birth_year ? Number(personForm.birth_year) : null,
      description: personForm.description.trim() || null,
      created_by: session.user.id,
      status: 'pending',
    }).select('id').single()

    if (error) {
      setBusy(false)
      return showMessage(friendlyError(error.message), 'error')
    }

    if (newPerson?.id && personForm.family_id) {
      const { error: membershipError } = await supabase.from('person_family_memberships').insert({
        person_id: newPerson.id,
        family_id: personForm.family_id,
        membership_type: 'birth',
        is_primary: true,
        status: 'pending',
        created_by: session.user.id,
      })
      if (membershipError && !membershipError.message.toLowerCase().includes('does not exist')) {
        setBusy(false)
        return showMessage(friendlyError(membershipError.message), 'error')
      }
    }

    setBusy(false)
    setPersonForm({ full_name: '', family_id: '', gender: '', birth_year: '', description: '' })
    showMessage('تم إرسال الشخص وانتمائه العائلي للمراجعة.', 'success')
    void loadCommunityData()
  }

`
  app = app.slice(0, start) + replacement + app.slice(end)
}

if (!app.includes(`<FamilyMembersPanel`)) {
  const start = app.indexOf(`        {schemaReady && view === 'family' && selectedFamily && (`)
  const end = app.indexOf(`        {schemaReady && view === 'person' && selectedPerson && (`, start)
  if (start < 0 || end < 0) throw new Error('Missing family detail boundaries')
  const block = `        {schemaReady && view === 'family' && selectedFamily && (
          <section className="page-section detail-page">
            <button className="back-button" type="button" onClick={() => setView('search')}>→ العودة للدليل</button>
            <div className="detail-hero">
              <span className="detail-avatar family-avatar">{selectedFamily.name[0]}</span>
              <div><span className="eyebrow">ملف العائلة</span><h1>{selectedFamily.name}</h1><p>{selectedFamily.description || 'لا توجد نبذة مضافة لهذه العائلة حتى الآن.'}</p></div>
              <RecordEditButton entityType="families" recordId={selectedFamily.id} createdBy={selectedFamily.created_by} sessionUserId={session?.user.id} isAdmin={isAdmin} initialData={{ name: selectedFamily.name, origin_place: selectedFamily.origin_place, description: selectedFamily.description }} onSaved={loadCommunityData} />
            </div>
            <div className="detail-facts">
              <article><span>مكان الأصل</span><strong>{selectedFamily.origin_place || 'غير محدد'}</strong></article>
              <article><span>الأفراد الأساسيون</span><strong>{approvedPeople.filter((item) => item.family_id === selectedFamily.id).length}</strong></article>
              <article><span>حالة السجل</span><strong>{selectedFamily.status === 'approved' ? 'معتمد' : 'بانتظار الاعتماد'}</strong></article>
            </div>
            <FamilyMembersPanel familyId={selectedFamily.id} people={approvedPeople} onOpenPerson={(id) => { const person = people.find((item) => item.id === id); if (person) void openPerson(person) }} />
          </section>
        )}

`
  app = app.slice(0, start) + block + app.slice(end)
}

mustReplace(
  `            <div className="detail-hero">\n              <span className="detail-avatar">{selectedPerson.full_name[0]}</span>\n              <div><span className="eyebrow">ملف شخص</span><h1>{selectedPerson.full_name}</h1><p>{selectedPerson.description || 'لا توجد نبذة مضافة لهذا الشخص.'}</p></div>\n            </div>`,
  `            <div className="detail-hero">\n              <span className="detail-avatar">{selectedPerson.full_name[0]}</span>\n              <div><span className="eyebrow">ملف شخص</span><h1>{selectedPerson.full_name}</h1><p>{selectedPerson.description || 'لا توجد نبذة مضافة لهذا الشخص.'}</p></div>\n              <RecordEditButton entityType="people" recordId={selectedPerson.id} createdBy={selectedPerson.created_by} sessionUserId={session?.user.id} isAdmin={isAdmin} initialData={{ full_name: selectedPerson.full_name, gender: selectedPerson.gender, birth_year: selectedPerson.birth_year, is_deceased: selectedPerson.is_deceased, description: selectedPerson.description }} onSaved={loadCommunityData} />\n            </div>`,
  'person editor',
)

mustReplace(
  `            <div className="detail-facts">\n              <article><span>العائلة</span><strong>{familyName(selectedPerson.families) || 'غير محددة'}</strong></article>\n              <article><span>سنة الميلاد</span><strong>{selectedPerson.birth_year || 'غير محددة'}</strong></article>\n              <article><span>الحالة</span><strong>{selectedPerson.is_deceased ? 'متوفى' : 'على قيد الحياة'}</strong></article>\n            </div>\n            {session && !profile?.linked_person_id && (`,
  `            <div className="detail-facts">\n              <article><span>العائلة الأساسية</span><strong>{familyName(selectedPerson.families) || 'غير محددة'}</strong></article>\n              <article><span>سنة الميلاد</span><strong>{selectedPerson.birth_year || 'غير محددة'}</strong></article>\n              <article><span>الحالة</span><strong>{selectedPerson.is_deceased ? 'متوفى' : 'على قيد الحياة'}</strong></article>\n            </div>\n            <PersonFamilyMemberships personId={selectedPerson.id} families={approvedFamilies} sessionUserId={session?.user.id} onChanged={loadCommunityData} />\n            {session && !profile?.linked_person_id && (`,
  'person memberships',
)

mustReplace(
  `                      <small>{item.location_name || familyName(item.families) || 'المكان غير محدد'}</small>\n                    </article>`,
  `                      <small>{item.location_name || familyName(item.families) || 'المكان غير محدد'}</small>\n                      <RecordEditButton entityType="events" recordId={item.id} createdBy={item.created_by} sessionUserId={session?.user.id} isAdmin={isAdmin} familyOptions={approvedFamilies} initialData={{ event_type: item.event_type, title: item.title, family_id: item.family_id, event_date: item.event_date, location_name: item.location_name, description: item.description }} onSaved={loadCommunityData} />\n                    </article>`,
  'event editor',
)

mustReplace(
  `        {!session && view === 'home' && (`,
  `        {schemaReady && view === 'admin' && isAdmin && <Phase3AdminQueue active={isAdmin} onChanged={loadCommunityData} />}\n\n        {!session && view === 'home' && (`,
  'phase3 admin queue',
)

fs.writeFileSync(appPath, app)

const mainPath = 'src/main.tsx'
let main = fs.readFileSync(mainPath, 'utf8')
if (!main.includes(`import './phase3.css'`)) {
  const marker = `import './mobile-shell.css'\n`
  if (!main.includes(marker)) throw new Error('Missing main CSS marker')
  main = main.replace(marker, `${marker}import './phase3.css'\n`)
  fs.writeFileSync(mainPath, main)
}

const setupPath = 'supabase/SETUP.sql'
let setup = fs.readFileSync(setupPath, 'utf8')
if (!setup.includes('-- PHASE 3: MODERATED OWNER EDITS + MULTI-FAMILY MEMBERSHIPS')) {
  const migration = fs.readFileSync('supabase/migrations/202608070005_edit_requests_and_family_memberships.sql', 'utf8')
  setup = `${setup.trim()}\n\n${migration.trim()}\n`
  fs.writeFileSync(setupPath, setup)
}
