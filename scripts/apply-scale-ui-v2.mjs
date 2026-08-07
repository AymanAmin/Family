import fs from 'node:fs'

const appPath = 'src/App.tsx'
const mainPath = 'src/main.tsx'
let app = fs.readFileSync(appPath, 'utf8')
let main = fs.readFileSync(mainPath, 'utf8')

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    if (source.includes(after)) return source
    throw new Error(`Marker not found: ${label}`)
  }
  return source.replace(before, after)
}

app = replaceOnce(
  app,
  "const AdminUserRoles = lazy(() => import('./components/AdminUserRoles'))",
  "const AdminUserRoles = lazy(() => import('./components/AdminUserRoles'))\nconst FamilyPicker = lazy(() => import('./components/FamilyPicker'))",
  'lazy FamilyPicker',
)

app = replaceOnce(
  app,
  "type AddMode = 'family' | 'person' | 'event' | 'relationship'",
  "type AddMode = 'family' | 'person' | 'event' | 'relationship'\ntype AdminTab = 'requests' | 'edits' | 'users'",
  'AdminTab type',
)

app = replaceOnce(
  app,
  "  const [addMode, setAddMode] = useState<AddMode>('family')",
  "  const [addMode, setAddMode] = useState<AddMode>('family')\n  const [adminTab, setAdminTab] = useState<AdminTab>('requests')",
  'admin tab state',
)

app = replaceOnce(
  app,
  '<RecordEditButton entityType="events" recordId={item.id} createdBy={item.created_by} sessionUserId={session?.user.id} isAdmin={isAdmin} familyOptions={approvedFamilies} initialData={{ event_type: item.event_type, title: item.title, family_id: item.family_id, event_date: item.event_date, location_name: item.location_name, description: item.description }} onSaved={loadCommunityData} />',
  '<RecordEditButton entityType="events" recordId={item.id} createdBy={item.created_by} sessionUserId={session?.user.id} isAdmin={isAdmin} initialData={{ event_type: item.event_type, title: item.title, family_id: item.family_id, event_date: item.event_date, location_name: item.location_name, description: item.description }} onSaved={loadCommunityData} />',
  'event edit family options',
)

app = replaceOnce(
  app,
  '<PersonFamilyMemberships personId={selectedPerson.id} families={approvedFamilies} sessionUserId={session?.user.id} isAdmin={isAdmin} onChanged={loadCommunityData} />',
  '<PersonFamilyMemberships personId={selectedPerson.id} sessionUserId={session?.user.id} isAdmin={isAdmin} onChanged={loadCommunityData} />',
  'membership props',
)

app = replaceOnce(
  app,
  '<label><span>العائلة</span><select value={personForm.family_id} onChange={(e) => setPersonForm({ ...personForm, family_id: e.target.value })}><option value="">غير محددة</option>{visibleFamilies.map((item) => <option key={item.id} value={item.id}>{item.name}{item.status === \'pending\' ? \' (معلقة)\' : \'\'}</option>)}</select></label>',
  `<Suspense fallback={<div className="picker-skeleton">جارٍ تجهيز بحث العائلات…</div>}>
                <FamilyPicker
                  label="العائلة"
                  value={personForm.family_id}
                  onChange={(familyId) => setPersonForm((current) => ({ ...current, family_id: familyId }))}
                  emptyLabel="بدون عائلة محددة"
                />
              </Suspense>`,
  'person family picker',
)

app = replaceOnce(
  app,
  '<label><span>العائلة المرتبطة</span><select value={eventForm.family_id} onChange={(e) => setEventForm({ ...eventForm, family_id: e.target.value })}><option value="">مناسبة عامة</option>{visibleFamilies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>',
  `<Suspense fallback={<div className="picker-skeleton">جارٍ تجهيز بحث العائلات…</div>}>
                <FamilyPicker
                  label="العائلة المرتبطة"
                  value={eventForm.family_id}
                  onChange={(familyId) => setEventForm((current) => ({ ...current, family_id: familyId }))}
                  emptyLabel="مناسبة عامة"
                />
              </Suspense>`,
  'event family picker',
)

const oldAdmin = `        {schemaReady && view === 'admin' && isAdmin && (
          <section className="page-section">
            <div className="page-heading"><span className="eyebrow">لوحة الإدارة</span><h1>طلبات بانتظار المراجعة</h1><p>اعتماد السجل يجعله ظاهرًا للعامة فورًا.</p></div>
            {pending.length ? <div className="review-list">{pending.map((record) => <article className="review-row" key={\`${'${record.table}'}-${'${record.id}'}\`}><div><span className="status pending">معلق</span><h3>{record.title}</h3><p>{record.subtitle} · {formatDate(record.created_at)}</p></div><div className="review-actions"><button className="approve" onClick={() => moderate(record, 'approved')} disabled={busy}>اعتماد</button><button className="reject" onClick={() => moderate(record, 'rejected')} disabled={busy}>رفض</button></div></article>)}</div> : <div className="empty-state"><strong>لا توجد طلبات معلقة</strong><span>جميع الطلبات تمت مراجعتها.</span></div>}
          </section>
        )}

        {schemaReady && view === 'admin' && isAdmin && <Suspense fallback={<LazyPanelFallback />}><Phase3AdminQueue active={isAdmin} onChanged={loadCommunityData} /></Suspense>}
        {schemaReady && view === 'admin' && profile?.is_primary_admin && <Suspense fallback={<LazyPanelFallback />}><AdminUserRoles active={Boolean(profile?.is_primary_admin)} currentUserId={session?.user.id} /></Suspense>}`

const newAdmin = `        {schemaReady && view === 'admin' && isAdmin && (
          <section className="page-section admin-console">
            <div className="admin-console-hero">
              <div><span className="eyebrow">لوحة الإدارة</span><h1>إدارة المحتوى والمستخدمين</h1><p>كل قسم يُحمّل بياناته عند فتحه فقط لتبقى اللوحة سريعة على الجوال.</p></div>
              <span className="admin-console-count"><b>{pending.length}</b><small>طلب أساسي</small></span>
            </div>

            <div className="admin-console-tabs" role="tablist" aria-label="أقسام لوحة الإدارة">
              <button type="button" role="tab" aria-selected={adminTab === 'requests'} className={adminTab === 'requests' ? 'active' : ''} onClick={() => setAdminTab('requests')}>الطلبات <span>{pending.length}</span></button>
              <button type="button" role="tab" aria-selected={adminTab === 'edits'} className={adminTab === 'edits' ? 'active' : ''} onClick={() => setAdminTab('edits')}>التعديلات والانتماءات</button>
              {profile?.is_primary_admin && <button type="button" role="tab" aria-selected={adminTab === 'users'} className={adminTab === 'users' ? 'active' : ''} onClick={() => setAdminTab('users')}>المستخدمون</button>}
            </div>

            <div className="admin-console-panel">
              {adminTab === 'requests' && (pending.length ? <div className="review-list">{pending.map((record) => <article className="review-row" key={\`${'${record.table}'}-${'${record.id}'}\`}><div><span className="status pending">معلق</span><h3>{record.title}</h3><p>{record.subtitle} · {formatDate(record.created_at)}</p></div><div className="review-actions"><button className="approve" onClick={() => moderate(record, 'approved')} disabled={busy}>اعتماد</button><button className="reject" onClick={() => moderate(record, 'rejected')} disabled={busy}>رفض</button></div></article>)}</div> : <div className="empty-state"><strong>لا توجد طلبات معلقة</strong><span>جميع الطلبات الأساسية تمت مراجعتها.</span></div>)}
              {adminTab === 'edits' && <Suspense fallback={<LazyPanelFallback />}><Phase3AdminQueue active={adminTab === 'edits'} onChanged={loadCommunityData} /></Suspense>}
              {adminTab === 'users' && profile?.is_primary_admin && <Suspense fallback={<LazyPanelFallback />}><AdminUserRoles active={adminTab === 'users'} currentUserId={session?.user.id} /></Suspense>}
            </div>
          </section>
        )}`

app = replaceOnce(app, oldAdmin, newAdmin, 'admin console')

if (!main.includes("import './scale-ui-v2.css'")) {
  main = main.replace("import './tree-pan-fix.css'", "import './tree-pan-fix.css'\nimport './scale-ui-v2.css'")
}

fs.writeFileSync(appPath, app)
fs.writeFileSync(mainPath, main)
console.log('Applied scalable family pickers and tabbed admin console.')
