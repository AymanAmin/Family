import fs from 'node:fs'

function replaceOnce(source, find, replacement, label) {
  if (source.includes(replacement)) return source
  if (!source.includes(find)) throw new Error(`Missing marker: ${label}`)
  return source.replace(find, replacement)
}

const appPath = 'src/App.tsx'
let app = fs.readFileSync(appPath, 'utf8')

app = replaceOnce(
  app,
  `import { getApplicationUrl, supabase, supabaseConfiguration } from './lib/supabase'\n`,
  `import { getApplicationUrl, supabase, supabaseConfiguration } from './lib/supabase'\nimport RecordEditButton from './components/RecordEditButton'\nimport PersonFamilyMemberships from './components/PersonFamilyMemberships'\nimport FamilyMembersPanel from './components/FamilyMembersPanel'\nimport Phase3AdminQueue from './components/Phase3AdminQueue'\n`,
  'phase3 imports',
)

app = replaceOnce(
  app,
  `  status: RecordStatus\n  created_at: string\n}\n\ntype RelatedFamily`,
  `  status: RecordStatus\n  created_by: string\n  created_at: string\n}\n\ntype RelatedFamily`,
  'Family created_by',
)

app = replaceOnce(
  app,
  `  family_id: string | null\n  families?: RelatedFamily\n  created_at: string\n}\n\ntype RelatedPerson`,
  `  family_id: string | null\n  families?: RelatedFamily\n  created_by: string\n  created_at: string\n}\n\ntype RelatedPerson`,
  'Person created_by',
)

app = replaceOnce(
  app,
  `  family_id: string | null\n  families?: RelatedFamily\n  created_at: string\n}\n\ntype PendingRecord`,
  `  family_id: string | null\n  families?: RelatedFamily\n  created_by: string\n  created_at: string\n}\n\ntype PendingRecord`,
  'Event created_by',
)

// Always select creator ownership wherever records can be opened for editing.
app = app.replaceAll(
  `.select('id,name,description,origin_place,status,created_at')`,
  `.select('id,name,description,origin_place,status,created_by,created_at')`,
)
app = app.replaceAll(
  `.select('id,full_name,gender,birth_year,is_deceased,description,status,family_id,created_at,families(name)')`,
  `.select('id,full_name,gender,birth_year,is_deceased,description,status,family_id,created_by,created_at,families(name)')`,
)
app = app.replaceAll(
  `.select('id,event_type,title,description,event_date,location_name,status,family_id,created_at,families(name)')`,
  `.select('id,event_type,title,description,event_date,location_name,status,family_id,created_by,created_at,families(name)')`,
)

// Creating a person with an initial family also creates the first pending membership.
const submitPersonPattern = /  async function submitPerson\(event: FormEvent<HTMLFormElement>\) \{[\s\S]*?\n  \}\n\n  async function submitEvent/
if (!app.includes(`membership_type: 'birth'`)) {
  if (!submitPersonPattern.test(app)) throw new Error('Missing submitPerson function')
  app = app.replace(submitPersonPattern, `  async function submitPerson(event: FormEvent<HTMLFormElement>) {
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

  async function submitEvent`)
}

// Family details: edit control + membership-aware member list.
const familyBlockPattern = /        \{schemaReady && view === 'family' && selectedFamily && \([\s\S]*?\n        \)\}\n\n\n        \{schemaReady && view === 'person'/
if (!app.includes(`<FamilyMembersPanel familyId={selectedFamily.id}`)) {
  if (!familyBlockPattern.test(app)) throw new Error('Missing family detail block')
  app = app.replace(familyBlockPattern, `        {schemaReady && view === 'family' && selectedFamily && (
          <section className="page-section detail-page">
            <button className="back-button" type="button" onClick={() => setView('search')}>→ العودة للدليل</button>
            <div className="detail-hero">
              <span className="detail-avatar family-avatar">{selectedFamily.name[0]}</span>
              <div><span className="eyebrow">ملف العائلة</span><h1>{selectedFamily.name}</h1><p>{selectedFamily.description || 'لا توجد نبذة مضافة لهذه العائلة حتى الآن.'}</p></div>
              <RecordEditButton
                entityType="families"
                recordId={selectedFamily.id}
                createdBy={selectedFamily.created_by}
                sessionUserId={session?.user.id}
                isAdmin={isAdmin}
                initialData={{ name: selectedFamily.name, origin_place: selectedFamily.origin_place, description: selectedFamily.description }}
                onSaved={loadCommunityData}
              />
            </div>
            <div className="detail-facts">
              <article><span>مكان الأصل</span><strong>{selectedFamily.origin_place || 'غير محدد'}</strong></article>
              <article><span>الأفراد الأساسيون</span><strong>{approvedPeople.filter((item) => item.family_id === selectedFamily.id).length}</strong></article>
              <article><span>حالة السجل</span><strong>{selectedFamily.status === 'approved' ? 'معتمد' : 'بانتظار الاعتماد'}</strong></article>
            </div>
            <FamilyMembersPanel
              familyId={selectedFamily.id}
              people={approvedPeople}
              onOpenPerson={(id) => {
                const person = people.find((item) => item.id === id)
                if (person) void openPerson(person)
              }}
            />
          </section>
        )}


        {schemaReady && view === 'person'`)
}

// Person details: owner/admin editor and multi-family memberships.
const personHeroOld = `            <div className="detail-hero">\n              <span className="detail-avatar">{selectedPerson.full_name[0]}</span>\n              <div><span className="eyebrow">ملف شخص</span><h1>{selectedPerson.full_name}</h1><p>{selectedPerson.description || 'لا توجد نبذة مضافة لهذا الشخص.'}</p></div>\n            </div>`
const personHeroNew = `            <div className="detail-hero">\n              <span className="detail-avatar">{selectedPerson.full_name[0]}</span>\n              <div><span className="eyebrow">ملف شخص</span><h1>{selectedPerson.full_name}</h1><p>{selectedPerson.description || 'لا توجد نبذة مضافة لهذا الشخص.'}</p></div>\n              <RecordEditButton\n                entityType="people"\n                recordId={selectedPerson.id}\n                createdBy={selectedPerson.created_by}\n                sessionUserId={session?.user.id}\n                isAdmin={isAdmin}\n                initialData={{ full_name: selectedPerson.full_name, gender: selectedPerson.gender, birth_year: selectedPerson.birth_year, is_deceased: selectedPerson.is_deceased, description: selectedPerson.description }}\n                onSaved={loadCommunityData}\n              />\n            </div>`
app = replaceOnce(app, personHeroOld, personHeroNew, 'person edit control')

const personFactsOld = `            <div className="detail-facts">\n              <article><span>العائلة</span><strong>{familyName(selectedPerson.families) || 'غير محددة'}</strong></article>\n              <article><span>سنة الميلاد</span><strong>{selectedPerson.birth_year || 'غير محددة'}</strong></article>\n              <article><span>الحالة</span><strong>{selectedPerson.is_deceased ? 'متوفى' : 'على قيد الحياة'}</strong></article>\n            </div>\n            {session && !profile?.linked_person_id && (`
const personFactsNew = `            <div className="detail-facts">\n              <article><span>العائلة الأساسية</span><strong>{familyName(selectedPerson.families) || 'غير محددة'}</strong></article>\n              <article><span>سنة الميلاد</span><strong>{selectedPerson.birth_year || 'غير محددة'}</strong></article>\n              <article><span>الحالة</span><strong>{selectedPerson.is_deceased ? 'متوفى' : 'على قيد الحياة'}</strong></article>\n            </div>\n            <PersonFamilyMemberships personId={selectedPerson.id} families={approvedFamilies} sessionUserId={session?.user.id} onChanged={loadCommunityData} />\n            {session && !profile?.linked_person_id && (`
app = replaceOnce(app, personFactsOld, personFactsNew, 'person family memberships')

// Event cards can be edited by their creator or an administrator.
const eventCardOld = `                      <small>{item.location_name || familyName(item.families) || 'المكان غير محدد'}</small>\n                    </article>`
const eventCardNew = `                      <small>{item.location_name || familyName(item.families) || 'المكان غير محدد'}</small>\n                      <RecordEditButton\n                        entityType="events"\n                        recordId={item.id}\n                        createdBy={item.created_by}\n                        sessionUserId={session?.user.id}\n                        isAdmin={isAdmin}\n                        familyOptions={approvedFamilies}\n                        initialData={{ event_type: item.event_type, title: item.title, family_id: item.family_id, event_date: item.event_date, location_name: item.location_name, description: item.description }}\n                        onSaved={loadCommunityData}\n                      />\n                    </article>`
app = replaceOnce(app, eventCardOld, eventCardNew, 'event edit control')

// Admin gets a second queue dedicated to edit requests and family memberships.
const adminOld = `            {pending.length ? <div className="review-list">{pending.map((record) => <article className="review-row" key={\`${record.table}-${record.id}\`}><div><span className="status pending">معلق</span><h3>{record.title}</h3><p>{record.subtitle} · {formatDate(record.created_at)}</p></div><div className="review-actions"><button className="approve" onClick={() => moderate(record, 'approved')} disabled={busy}>اعتماد</button><button className="reject" onClick={() => moderate(record, 'rejected')} disabled={busy}>رفض</button></div></article>)}</div> : <div className="empty-state"><strong>لا توجد طلبات معلقة</strong><span>جميع الطلبات تمت مراجعتها.</span></div>}\n          </section>`
const adminNew = `            {pending.length ? <div className="review-list">{pending.map((record) => <article className="review-row" key={\`${record.table}-${record.id}\`}><div><span className="status pending">معلق</span><h3>{record.title}</h3><p>{record.subtitle} · {formatDate(record.created_at)}</p></div><div className="review-actions"><button className="approve" onClick={() => moderate(record, 'approved')} disabled={busy}>اعتماد</button><button className="reject" onClick={() => moderate(record, 'rejected')} disabled={busy}>رفض</button></div></article>)}</div> : <div className="empty-state"><strong>لا توجد طلبات معلقة</strong><span>جميع الطلبات الأساسية تمت مراجعتها.</span></div>}\n            <Phase3AdminQueue active={isAdmin} onChanged={loadCommunityData} />\n          </section>`
app = replaceOnce(app, adminOld, adminNew, 'phase3 admin queue')

fs.writeFileSync(appPath, app)

const mainPath = 'src/main.tsx'
let main = fs.readFileSync(mainPath, 'utf8')
if (!main.includes(`import './phase3.css'`)) {
  main = main.replace(`import './mobile-shell.css'\n`, `import './mobile-shell.css'\nimport './phase3.css'\n`)
  fs.writeFileSync(mainPath, main)
}

const setupPath = 'supabase/SETUP.sql'
let setup = fs.readFileSync(setupPath, 'utf8')
const migration = fs.readFileSync('supabase/migrations/202608070005_edit_requests_and_family_memberships.sql', 'utf8')
if (!setup.includes('-- PHASE 3: MODERATED OWNER EDITS + MULTI-FAMILY MEMBERSHIPS')) {
  setup = `${setup.trim()}\n\n${migration.trim()}\n`
  fs.writeFileSync(setupPath, setup)
}
