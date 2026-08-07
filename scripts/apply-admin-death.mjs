import fs from 'node:fs'

const path = 'src/App.tsx'
let source = fs.readFileSync(path, 'utf8')

function replaceOnce(search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing marker: ${label}`)
  source = source.replace(search, replacement)
}

replaceOnce(
  "const FamilyTreeScreen = lazy(() => import('./components/FamilyTreeScreen'))\n",
  "const FamilyTreeScreen = lazy(() => import('./components/FamilyTreeScreen'))\nconst AdminUserRoles = lazy(() => import('./components/AdminUserRoles'))\n",
  'lazy admin roles import',
)

replaceOnce(
  "  is_deceased: boolean\n  description: string | null\n",
  "  is_deceased: boolean\n  death_date: string | null\n  description: string | null\n",
  'person death date type',
)

replaceOnce(
  "  const [personForm, setPersonForm] = useState({ full_name: '', family_id: '', gender: '', birth_year: '', description: '' })",
  "  const [personForm, setPersonForm] = useState({ full_name: '', family_id: '', gender: '', birth_year: '', is_deceased: false, death_date: '', description: '' })",
  'person form state',
)

source = source.replaceAll(
  "id,full_name,gender,birth_year,is_deceased,description,status,family_id,created_by,created_at,families(name)",
  "id,full_name,gender,birth_year,is_deceased,death_date,description,status,family_id,created_by,created_at,families(name)",
)

replaceOnce(
`    setBusy(true)
    const { error } = await supabase.from('families').insert({
      name: familyForm.name.trim(),
      origin_place: familyForm.origin_place.trim() || null,
      description: familyForm.description.trim() || null,
      created_by: session.user.id,
      status: 'pending',
    })`,
`    setBusy(true)
    const directApproval = isAdmin
    const approvedAt = directApproval ? new Date().toISOString() : null
    const { error } = await supabase.from('families').insert({
      name: familyForm.name.trim(),
      origin_place: familyForm.origin_place.trim() || null,
      description: familyForm.description.trim() || null,
      created_by: session.user.id,
      status: directApproval ? 'approved' : 'pending',
      approved_by: directApproval ? session.user.id : null,
      approved_at: approvedAt,
    })`,
  'submit family',
)

replaceOnce(
  "    showMessage('تم إرسال العائلة للمراجعة. لن تظهر للعامة قبل الاعتماد.', 'success')",
  "    showMessage(isAdmin ? 'تمت إضافة العائلة واعتمادها مباشرة.' : 'تم إرسال العائلة للمراجعة. لن تظهر للعامة قبل الاعتماد.', 'success')",
  'family success message',
)

replaceOnce(
`    if (personForm.full_name.trim().length < 3) return showMessage('اكتب الاسم الكامل.', 'error')
    setBusy(true)
    const { data: newPerson, error } = await supabase.from('people').insert({
      full_name: personForm.full_name.trim(),
      family_id: personForm.family_id || null,
      gender: personForm.gender || null,
      birth_year: personForm.birth_year ? Number(personForm.birth_year) : null,
      description: personForm.description.trim() || null,
      created_by: session.user.id,
      status: 'pending',
    }).select('id').single()`,
`    if (personForm.full_name.trim().length < 3) return showMessage('اكتب الاسم الكامل.', 'error')
    if (personForm.is_deceased && !personForm.death_date) return showMessage('حدد تاريخ الوفاة.', 'error')
    setBusy(true)
    const directApproval = isAdmin
    const approvedAt = directApproval ? new Date().toISOString() : null
    const { data: newPerson, error } = await supabase.from('people').insert({
      full_name: personForm.full_name.trim(),
      family_id: personForm.family_id || null,
      gender: personForm.gender || null,
      birth_year: personForm.birth_year ? Number(personForm.birth_year) : null,
      is_deceased: personForm.is_deceased,
      death_date: personForm.is_deceased ? personForm.death_date : null,
      description: personForm.description.trim() || null,
      created_by: session.user.id,
      status: directApproval ? 'approved' : 'pending',
      approved_by: directApproval ? session.user.id : null,
      approved_at: approvedAt,
    }).select('id').single()`,
  'submit person',
)

replaceOnce(
`        is_primary: true,
        status: 'pending',
        created_by: session.user.id,`,
`        is_primary: true,
        status: isAdmin ? 'approved' : 'pending',
        created_by: session.user.id,
        approved_by: isAdmin ? session.user.id : null,
        approved_at: isAdmin ? new Date().toISOString() : null,`,
  'initial membership direct approval',
)

replaceOnce(
  "    setPersonForm({ full_name: '', family_id: '', gender: '', birth_year: '', description: '' })\n    showMessage('تم إرسال الشخص وانتمائه العائلي للمراجعة.', 'success')",
  "    setPersonForm({ full_name: '', family_id: '', gender: '', birth_year: '', is_deceased: false, death_date: '', description: '' })\n    showMessage(isAdmin ? 'تمت إضافة الشخص واعتماده مباشرة.' : 'تم إرسال الشخص وانتمائه العائلي للمراجعة.', 'success')",
  'person reset and message',
)

replaceOnce(
`    setBusy(true)
    const { error } = await supabase.from('events').insert({
      event_type: eventForm.event_type,
      title: eventForm.title.trim(),
      family_id: eventForm.family_id || null,
      event_date: eventForm.event_date || null,
      location_name: eventForm.location_name.trim() || null,
      description: eventForm.description.trim() || null,
      created_by: session.user.id,
      status: 'pending',
    })`,
`    setBusy(true)
    const directApproval = isAdmin
    const { error } = await supabase.from('events').insert({
      event_type: eventForm.event_type,
      title: eventForm.title.trim(),
      family_id: eventForm.family_id || null,
      event_date: eventForm.event_date || null,
      location_name: eventForm.location_name.trim() || null,
      description: eventForm.description.trim() || null,
      created_by: session.user.id,
      status: directApproval ? 'approved' : 'pending',
      approved_by: directApproval ? session.user.id : null,
      approved_at: directApproval ? new Date().toISOString() : null,
    })`,
  'submit event',
)

replaceOnce(
  "    showMessage('تم إرسال المناسبة للمراجعة.', 'success')",
  "    showMessage(isAdmin ? 'تمت إضافة المناسبة واعتمادها مباشرة.' : 'تم إرسال المناسبة للمراجعة.', 'success')",
  'event success message',
)

replaceOnce(
`    const { error } = await supabase.from('person_relationships').insert({
      source_person_id: relationshipForm.source_person_id,
      target_person_id: relationshipForm.target_person_id,
      relation_type: relationshipForm.relation_type,
      notes: relationshipForm.notes.trim() || null,
      created_by: session.user.id,
      status: 'pending',
    })`,
`    const directApproval = isAdmin
    const { error } = await supabase.from('person_relationships').insert({
      source_person_id: relationshipForm.source_person_id,
      target_person_id: relationshipForm.target_person_id,
      relation_type: relationshipForm.relation_type,
      notes: relationshipForm.notes.trim() || null,
      created_by: session.user.id,
      status: directApproval ? 'approved' : 'pending',
      approved_by: directApproval ? session.user.id : null,
      approved_at: directApproval ? new Date().toISOString() : null,
    })`,
  'submit relationship',
)

replaceOnce(
  "    showMessage('تم إرسال صلة القرابة للمراجعة.', 'success')",
  "    showMessage(isAdmin ? 'تمت إضافة صلة القرابة واعتمادها مباشرة.' : 'تم إرسال صلة القرابة للمراجعة.', 'success')",
  'relationship success message',
)

replaceOnce(
  "initialData={{ full_name: selectedPerson.full_name, gender: selectedPerson.gender, birth_year: selectedPerson.birth_year, is_deceased: selectedPerson.is_deceased, description: selectedPerson.description }}",
  "initialData={{ full_name: selectedPerson.full_name, gender: selectedPerson.gender, birth_year: selectedPerson.birth_year, is_deceased: selectedPerson.is_deceased, death_date: selectedPerson.death_date, description: selectedPerson.description }}",
  'person edit initial death date',
)

replaceOnce(
  "<article><span>الحالة</span><strong>{selectedPerson.is_deceased ? 'متوفى' : 'على قيد الحياة'}</strong></article>",
  "<article className={selectedPerson.is_deceased ? 'deceased-fact' : 'alive-fact'}><span>الحالة</span><strong>{selectedPerson.is_deceased ? 'متوفى' : 'على قيد الحياة'}</strong>{selectedPerson.is_deceased && <small>تاريخ الوفاة: {formatDate(selectedPerson.death_date)}</small>}</article>",
  'person detail death display',
)

replaceOnce(
  "<PersonFamilyMemberships personId={selectedPerson.id} families={approvedFamilies} sessionUserId={session?.user.id} onChanged={loadCommunityData} />",
  "<PersonFamilyMemberships personId={selectedPerson.id} families={approvedFamilies} sessionUserId={session?.user.id} isAdmin={isAdmin} onChanged={loadCommunityData} />",
  'membership admin prop',
)

replaceOnce(
  "<div className=\"page-heading\"><span className=\"eyebrow\">مساهمة جديدة</span><h1>أضف معلومة للمنصة</h1><p>تُحفظ الإضافة بحالة «بانتظار الاعتماد» ولا تظهر للعامة مباشرة.</p></div>",
  "<div className=\"page-heading\"><span className=\"eyebrow\">مساهمة جديدة</span><h1>أضف معلومة للمنصة</h1><p>{isAdmin ? 'أنت مدير؛ ستُنشر إضافاتك مباشرة دون انتظار اعتماد إضافي.' : 'تُحفظ الإضافة بحالة «بانتظار الاعتماد» ولا تظهر للعامة مباشرة.'}</p></div>",
  'add page admin description',
)

replaceOnce(
  "<label><span>سنة الميلاد</span><input type=\"number\" min=\"1800\" max=\"2100\" value={personForm.birth_year} onChange={(e) => setPersonForm({ ...personForm, birth_year: e.target.value })} /></label>\n              <label className=\"full\"><span>وصف أو نبذة</span>",
  "<label><span>سنة الميلاد</span><input type=\"number\" min=\"1800\" max=\"2100\" value={personForm.birth_year} onChange={(e) => setPersonForm({ ...personForm, birth_year: e.target.value })} /></label>\n              <div className={`life-status-card full ${personForm.is_deceased ? 'deceased' : 'alive'}`}><div className=\"life-status-copy\"><span className=\"life-status-icon\">{personForm.is_deceased ? '✦' : '●'}</span><div><strong>{personForm.is_deceased ? 'متوفى' : 'على قيد الحياة'}</strong><small>{personForm.is_deceased ? 'حدد تاريخ الوفاة لإكمال السجل' : 'فعّل الخيار فقط إذا كان الشخص متوفى'}</small></div></div><label className=\"life-status-switch\"><input type=\"checkbox\" checked={personForm.is_deceased} onChange={(e) => setPersonForm({ ...personForm, is_deceased: e.target.checked, death_date: e.target.checked ? personForm.death_date : '' })} /><span /></label></div>\n              {personForm.is_deceased && <label className=\"full death-date-field\"><span>تاريخ الوفاة *</span><input type=\"date\" required value={personForm.death_date} onChange={(e) => setPersonForm({ ...personForm, death_date: e.target.value })} /></label>}\n              <label className=\"full\"><span>وصف أو نبذة</span>",
  'person create life status',
)

source = source.replace(
  '<button className="primary full" disabled={busy}>إرسال للمراجعة</button></form>}',
  '<button className="primary full" disabled={busy}>{isAdmin ? \'إضافة واعتماد\' : \'إرسال للمراجعة\'}</button></form>}',
)
source = source.replace(
  '<button className="primary full" disabled={busy}>إرسال للمراجعة</button>\n            </form>}',
  '<button className="primary full" disabled={busy}>{isAdmin ? \'إضافة واعتماد\' : \'إرسال للمراجعة\'}</button>\n            </form>}',
)
source = source.replace(
  '<button className="primary full" disabled={busy}>إرسال صلة القرابة للمراجعة</button>',
  '<button className="primary full" disabled={busy}>{isAdmin ? \'إضافة واعتماد صلة القرابة\' : \'إرسال صلة القرابة للمراجعة\'}</button>',
)

replaceOnce(
  "        {schemaReady && view === 'admin' && isAdmin && <Suspense fallback={<LazyPanelFallback />}><Phase3AdminQueue active={isAdmin} onChanged={loadCommunityData} /></Suspense>}\n",
  "        {schemaReady && view === 'admin' && isAdmin && <Suspense fallback={<LazyPanelFallback />}><Phase3AdminQueue active={isAdmin} onChanged={loadCommunityData} /></Suspense>}\n        {schemaReady && view === 'admin' && profile?.is_primary_admin && <Suspense fallback={<LazyPanelFallback />}><AdminUserRoles active={Boolean(profile?.is_primary_admin)} currentUserId={session?.user.id} /></Suspense>}\n",
  'admin user roles panel',
)

fs.writeFileSync(path, source)
console.log('Integrated direct admin publishing, user role panel, and death status/date')
