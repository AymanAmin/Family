from pathlib import Path

APP_PATH = Path('src/App.tsx')
SETUP_PATH = Path('supabase/SETUP.sql')
MIGRATION_PATH = Path('supabase/migrations/202608070004_person_relationships_and_account_linking.sql')

app = APP_PATH.read_text()


def replace_once(old: str, new: str) -> None:
    global app
    if old not in app:
        raise RuntimeError(f'Missing patch anchor: {old[:120]!r}')
    app = app.replace(old, new, 1)


replace_once(
    "import { getApplicationUrl, supabase, supabaseConfiguration } from './lib/supabase'\n",
    "import { getApplicationUrl, supabase, supabaseConfiguration } from './lib/supabase'\nimport './details.css'\nimport './nasab-inspired.css'\n",
)

replace_once(
    "type View = 'home' | 'search' | 'add' | 'admin'\ntype AddMode = 'family' | 'person' | 'event'",
    "type View = 'home' | 'search' | 'add' | 'admin' | 'person' | 'family' | 'account'\ntype AddMode = 'family' | 'person' | 'event' | 'relationship'",
)

replace_once(
    "  is_primary_admin: boolean\n}",
    "  is_primary_admin: boolean\n  linked_person_id: string | null\n}",
)

replace_once(
    "type CommunityEvent = {",
    """type RelatedPerson =
  | { id?: string; full_name?: string }
  | { id?: string; full_name?: string }[]
  | null

type PersonRelationship = {
  id: string
  source_person_id: string
  target_person_id: string
  relation_type: string
  notes: string | null
  status: RecordStatus
  source?: RelatedPerson
  target?: RelatedPerson
  created_at: string
}

type AccountLinkRequest = {
  id: string
  person_id: string
  status: RecordStatus
  note: string | null
  people?: RelatedPerson
  created_at: string
}

type CommunityEvent = {""",
)

replace_once(
    "  table: 'families' | 'people' | 'events'",
    "  table: 'families' | 'people' | 'events' | 'person_relationships' | 'account_link_requests'",
)

replace_once(
    "const roleLabels: Record<string, string> = {",
    """const relationshipLabels: Record<string, string> = {
  parent: 'والد أو والدة',
  child: 'ابن أو ابنة',
  spouse: 'زوج أو زوجة',
  sibling: 'أخ أو أخت',
  guardian: 'ولي أو وصي',
  other: 'صلة أخرى',
}

const inverseRelationshipLabels: Record<string, string> = {
  parent: 'ابن أو ابنة',
  child: 'والد أو والدة',
  spouse: 'زوج أو زوجة',
  sibling: 'أخ أو أخت',
  guardian: 'تحت الوصاية',
  other: 'صلة أخرى',
}

const roleLabels: Record<string, string> = {""",
)

replace_once(
    "function formatDate(value: string | null | undefined): string {",
    """function personName(value: RelatedPerson): string {
  if (!value) return ''
  if (Array.isArray(value)) return value[0]?.full_name ?? ''
  return value.full_name ?? ''
}

function personId(value: RelatedPerson): string {
  if (!value) return ''
  if (Array.isArray(value)) return value[0]?.id ?? ''
  return value.id ?? ''
}

function formatDate(value: string | null | undefined): string {""",
)

replace_once(
    "  const [pending, setPending] = useState<PendingRecord[]>([])\n",
    """  const [pending, setPending] = useState<PendingRecord[]>([])
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [selectedFamily, setSelectedFamily] = useState<Family | null>(null)
  const [relationships, setRelationships] = useState<PersonRelationship[]>([])
  const [relationsLoading, setRelationsLoading] = useState(false)
  const [ownLinkRequest, setOwnLinkRequest] = useState<AccountLinkRequest | null>(null)
""",
)

replace_once(
    "  const [eventForm, setEventForm] = useState({ event_type: 'general', title: '', family_id: '', event_date: '', location_name: '', description: '' })\n",
    """  const [eventForm, setEventForm] = useState({ event_type: 'general', title: '', family_id: '', event_date: '', location_name: '', description: '' })
  const [relationshipForm, setRelationshipForm] = useState({ source_person_id: '', relation_type: 'parent', target_person_id: '', notes: '' })
""",
)

replace_once(
    ".select('id,email,display_name,avatar_url,role,is_primary_admin')",
    ".select('id,email,display_name,avatar_url,role,is_primary_admin,linked_person_id')",
)

old_pending = """    const [familyResult, peopleResult, eventResult] = await Promise.all([
      supabase.from('families').select('id,name,origin_place,created_at').eq('status', 'pending').order('created_at'),
      supabase.from('people').select('id,full_name,created_at,families(name)').eq('status', 'pending').order('created_at'),
      supabase.from('events').select('id,title,event_type,created_at').eq('status', 'pending').order('created_at'),
    ])

    const rows: PendingRecord[] = []
    for (const item of familyResult.data ?? []) {
      rows.push({ id: item.id, title: item.name, subtitle: item.origin_place || 'عائلة جديدة', table: 'families', created_at: item.created_at })
    }
    for (const item of peopleResult.data ?? []) {
      rows.push({ id: item.id, title: item.full_name, subtitle: familyName(item.families as RelatedFamily) || 'شخص جديد', table: 'people', created_at: item.created_at })
    }
    for (const item of eventResult.data ?? []) {
      rows.push({ id: item.id, title: item.title, subtitle: eventLabels[item.event_type] || item.event_type, table: 'events', created_at: item.created_at })
    }"""

new_pending = """    const [familyResult, peopleResult, eventResult, relationshipResult, linkResult] = await Promise.all([
      supabase.from('families').select('id,name,origin_place,created_at').eq('status', 'pending').order('created_at'),
      supabase.from('people').select('id,full_name,created_at,families(name)').eq('status', 'pending').order('created_at'),
      supabase.from('events').select('id,title,event_type,created_at').eq('status', 'pending').order('created_at'),
      supabase.from('person_relationships').select('id,relation_type,created_at,source:people!person_relationships_source_person_id_fkey(full_name),target:people!person_relationships_target_person_id_fkey(full_name)').eq('status', 'pending').order('created_at'),
      supabase.from('account_link_requests').select('id,created_at,people(full_name)').eq('status', 'pending').order('created_at'),
    ])

    const rows: PendingRecord[] = []
    for (const item of familyResult.data ?? []) {
      rows.push({ id: item.id, title: item.name, subtitle: item.origin_place || 'عائلة جديدة', table: 'families', created_at: item.created_at })
    }
    for (const item of peopleResult.data ?? []) {
      rows.push({ id: item.id, title: item.full_name, subtitle: familyName(item.families as RelatedFamily) || 'شخص جديد', table: 'people', created_at: item.created_at })
    }
    for (const item of eventResult.data ?? []) {
      rows.push({ id: item.id, title: item.title, subtitle: eventLabels[item.event_type] || item.event_type, table: 'events', created_at: item.created_at })
    }
    for (const item of relationshipResult.data ?? []) {
      const source = personName(item.source as RelatedPerson) || 'شخص أول'
      const target = personName(item.target as RelatedPerson) || 'شخص ثانٍ'
      rows.push({ id: item.id, title: `${source} — ${target}`, subtitle: relationshipLabels[item.relation_type] || item.relation_type, table: 'person_relationships', created_at: item.created_at })
    }
    for (const item of linkResult.data ?? []) {
      rows.push({ id: item.id, title: personName(item.people as RelatedPerson) || 'طلب ربط حساب', subtitle: 'طلب إثبات أن الحساب يعود لهذا الشخص', table: 'account_link_requests', created_at: item.created_at })
    }"""
replace_once(old_pending, new_pending)

replace_once(
    """  useEffect(() => {
    void loadPending()
  }, [loadPending, families, people, events])
""",
    """  useEffect(() => {
    void loadPending()
  }, [loadPending, families, people, events])

  useEffect(() => {
    if (!supabase || !session) {
      setOwnLinkRequest(null)
      return
    }

    void supabase
      .from('account_link_requests')
      .select('id,person_id,status,note,created_at,people(id,full_name)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setOwnLinkRequest((data as AccountLinkRequest | null) ?? null))
  }, [session, profile?.linked_person_id])
""",
)

old_moderate = """  async function moderate(record: PendingRecord, status: 'approved' | 'rejected') {
    if (!supabase || !session || !isAdmin) return
    setBusy(true)
    const { error } = await supabase
      .from(record.table)
      .update({ status, approved_by: session.user.id, approved_at: status === 'approved' ? new Date().toISOString() : null })
      .eq('id', record.id)
    setBusy(false)
    if (error) return showMessage(friendlyError(error.message), 'error')
    showMessage(status === 'approved' ? 'تم اعتماد السجل.' : 'تم رفض السجل.', 'success')
    await loadCommunityData()
    await loadPending()
  }

  const userName"""

new_functions = """  function openFamily(item: Family) {
    setSelectedFamily(item)
    setView('family')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function openPerson(item: Person) {
    setSelectedPerson(item)
    setView('person')
    setRelationsLoading(true)
    setRelationships([])
    window.scrollTo({ top: 0, behavior: 'smooth' })
    if (!supabase) {
      setRelationsLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('person_relationships')
      .select('id,source_person_id,target_person_id,relation_type,notes,status,created_at,source:people!person_relationships_source_person_id_fkey(id,full_name),target:people!person_relationships_target_person_id_fkey(id,full_name)')
      .or(`source_person_id.eq.${item.id},target_person_id.eq.${item.id}`)
      .order('created_at')

    setRelationsLoading(false)
    if (error) return showMessage(friendlyError(error.message), 'error')
    setRelationships((data ?? []) as PersonRelationship[])
  }

  async function submitRelationship(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session || !requireAccount()) return
    if (!relationshipForm.source_person_id || !relationshipForm.target_person_id) return showMessage('اختر الشخصين.', 'error')
    if (relationshipForm.source_person_id === relationshipForm.target_person_id) return showMessage('لا يمكن ربط الشخص بنفسه.', 'error')

    setBusy(true)
    const { error } = await supabase.from('person_relationships').insert({
      source_person_id: relationshipForm.source_person_id,
      target_person_id: relationshipForm.target_person_id,
      relation_type: relationshipForm.relation_type,
      notes: relationshipForm.notes.trim() || null,
      created_by: session.user.id,
      status: 'pending',
    })
    setBusy(false)
    if (error) return showMessage(friendlyError(error.message), 'error')

    setRelationshipForm({ source_person_id: '', relation_type: 'parent', target_person_id: '', notes: '' })
    showMessage('تم إرسال صلة القرابة للمراجعة.', 'success')
    await loadPending()
  }

  async function requestAccountLink(item: Person) {
    if (!supabase || !session || !requireAccount()) return
    if (profile?.linked_person_id) return showMessage('حسابك مرتبط بشخص بالفعل.', 'info')
    if (ownLinkRequest?.status === 'pending') return showMessage('لديك طلب ربط قيد المراجعة.', 'info')

    setBusy(true)
    const { data, error } = await supabase
      .from('account_link_requests')
      .insert({ user_id: session.user.id, person_id: item.id, status: 'pending' })
      .select('id,person_id,status,note,created_at,people(id,full_name)')
      .single()
    setBusy(false)
    if (error) return showMessage(friendlyError(error.message), 'error')

    setOwnLinkRequest(data as AccountLinkRequest)
    showMessage('تم إرسال طلب ربط الحساب للمراجعة.', 'success')
  }

  async function moderate(record: PendingRecord, status: 'approved' | 'rejected') {
    if (!supabase || !session || !isAdmin) return
    setBusy(true)

    const result = record.table === 'account_link_requests'
      ? await supabase.rpc('review_account_link_request', { p_request_id: record.id, p_status: status })
      : await supabase
          .from(record.table)
          .update({ status, approved_by: session.user.id, approved_at: status === 'approved' ? new Date().toISOString() : null })
          .eq('id', record.id)

    setBusy(false)
    if (result.error) return showMessage(friendlyError(result.error.message), 'error')
    showMessage(status === 'approved' ? 'تم اعتماد السجل.' : 'تم رفض السجل.', 'success')
    await loadCommunityData()
    await loadProfile(session)
    await loadPending()
  }

  const userName"""
replace_once(old_moderate, new_functions)

replace_once(
    """              <div className="account-copy"><strong>{userName}</strong><small>{roleLabels[profile?.role || 'member']}</small></div>
              <button className="ghost-button" onClick={signOut} disabled={busy}>خروج</button>""",
    """              <button className="account-profile-button" type="button" onClick={() => setView('account')} aria-label="فتح حسابي">{userName.slice(0, 1)}</button>
              <button className="account-copy account-link" type="button" onClick={() => setView('account')}><strong>{userName}</strong><small>{roleLabels[profile?.role || 'member']}</small></button>
              <button className="ghost-button" onClick={signOut} disabled={busy}>خروج</button>""",
)

replace_once(
    """                    <article className="data-card" key={family.id}>
                      <span className="card-symbol">{family.name.slice(0, 1)}</span>
                      <div><h3>{family.name}</h3><p>{family.description || family.origin_place || 'لا توجد نبذة مضافة.'}</p></div>
                    </article>""",
    """                    <button className="data-card interactive-card" type="button" key={family.id} onClick={() => openFamily(family)}>
                      <span className="card-symbol">{family.name.slice(0, 1)}</span>
                      <div><h3>{family.name}</h3><p>{family.description || family.origin_place || 'لا توجد نبذة مضافة.'}</p></div>
                      <span className="card-chevron">‹</span>
                    </button>""",
)

row_replacements = {
    "<article className=\"list-row\" key={item.id}><span className=\"avatar-letter\">{item.name[0]}</span><div><strong>{item.name}</strong><small>{item.origin_place || 'المنطقة'}</small></div></article>": "<button className=\"list-row interactive-row\" type=\"button\" key={item.id} onClick={() => openFamily(item)}><span className=\"avatar-letter\">{item.name[0]}</span><div><strong>{item.name}</strong><small>{item.origin_place || 'المنطقة'}</small></div><span>‹</span></button>",
    "<article className=\"list-row\" key={item.id}><span className=\"avatar-letter\">{item.full_name[0]}</span><div><strong>{item.full_name}</strong><small>{familyName(item.families) || 'دون عائلة محددة'}{item.is_deceased ? ' · متوفى' : ''}</small></div></article>": "<button className=\"list-row interactive-row\" type=\"button\" key={item.id} onClick={() => void openPerson(item)}><span className=\"avatar-letter\">{item.full_name[0]}</span><div><strong>{item.full_name}</strong><small>{familyName(item.families) || 'دون عائلة محددة'}{item.is_deceased ? ' · متوفى' : ''}</small></div><span>‹</span></button>",
    "<article className=\"list-row\" key={item.id}><span className=\"avatar-letter\">{item.name[0]}</span><div><strong>{item.name}</strong><small>{item.origin_place || 'المنطقة'} · {item.status === 'pending' ? 'بانتظار الاعتماد' : 'معتمدة'}</small></div></article>": "<button className=\"list-row interactive-row\" type=\"button\" key={item.id} onClick={() => openFamily(item)}><span className=\"avatar-letter\">{item.name[0]}</span><div><strong>{item.name}</strong><small>{item.origin_place || 'المنطقة'} · {item.status === 'pending' ? 'بانتظار الاعتماد' : 'معتمدة'}</small></div><span>‹</span></button>",
    "<article className=\"list-row\" key={item.id}><span className=\"avatar-letter\">{item.full_name[0]}</span><div><strong>{item.full_name}</strong><small>{familyName(item.families) || 'دون عائلة'} · {item.status === 'pending' ? 'بانتظار الاعتماد' : 'معتمد'}</small></div></article>": "<button className=\"list-row interactive-row\" type=\"button\" key={item.id} onClick={() => void openPerson(item)}><span className=\"avatar-letter\">{item.full_name[0]}</span><div><strong>{item.full_name}</strong><small>{familyName(item.families) || 'دون عائلة'} · {item.status === 'pending' ? 'بانتظار الاعتماد' : 'معتمد'}</small></div><span>‹</span></button>",
}
for old, new in row_replacements.items():
    if old not in app:
        raise RuntimeError(f'Missing row anchor: {old[:100]!r}')
    app = app.replace(old, new)

home_dashboard = """
            <section className="nasab-dashboard">
              <article className="family-welcome-card">
                <span className="eyebrow">صلة — البيت الرقمي للعائلة</span>
                <h2>{session ? `مرحبًا ${userName}، أهلك أقرب إليك.` : 'عائلتك، تاريخها، وأخبارها في مكان واحد.'}</h2>
                <p>استعرض الأسر والأفراد، وثّق صلات القرابة، وتابع المناسبات من واجهة واحدة مصممة لكل الأجيال.</p>
                <div className="family-welcome-actions">
                  <button className="light-action" type="button" onClick={() => setView('search')}>فتح دليل العائلة</button>
                  <button className="outline-action" type="button" onClick={() => requireAccount() && setView('add')}>إضافة معلومة</button>
                </div>
              </article>

              <div className="app-services">
                <button className="service-tile" type="button" onClick={() => requireAccount() && (setAddMode('relationship'), setView('add'))}><span className="service-icon">ش</span><span><strong>شجرة العائلة</strong><small>أضف صلات القرابة وابنِ النسب</small></span></button>
                <button className="service-tile" type="button" onClick={() => setView('search')}><span className="service-icon">{approvedFamilies.length}</span><span><strong>العائلات</strong><small>الأسر المعتمدة في الدليل</small></span></button>
                <button className="service-tile" type="button" onClick={() => setView('search')}><span className="service-icon">{approvedPeople.length}</span><span><strong>الأفراد</strong><small>ملفات الأشخاص الموثقة</small></span></button>
                <button className="service-tile" type="button" onClick={() => session ? setView('account') : document.getElementById('auth-panel')?.scrollIntoView({ behavior: 'smooth' })}><span className="service-icon">{session ? userName[0] : 'د'}</span><span><strong>{session ? 'حسابي' : 'الدخول'}</strong><small>{session ? 'الربط والملف الشخصي' : 'ساهم في توثيق العائلة'}</small></span></button>
              </div>
            </section>

            <section className="home-content-grid">
              <article className="home-feed">
                <div className="home-section-heading"><h2>آخر أخبار العائلة</h2><button type="button" onClick={() => setView('add')}>إضافة مناسبة</button></div>
                {approvedEvents.length ? <div className="nasab-event-list">{approvedEvents.slice(0, 4).map((item) => <div className="nasab-event-item" key={item.id}><span className="nasab-event-date">{formatDate(item.event_date)}</span><div><h3>{item.title}</h3><p>{eventLabels[item.event_type] || item.event_type} · {item.location_name || familyName(item.families) || 'المكان غير محدد'}</p></div></div>)}</div> : <div className="empty-state compact">لا توجد أخبار أو مناسبات معتمدة بعد.</div>}
              </article>

              <article className="family-tree-preview">
                <div className="home-section-heading"><h2>شجرة العائلة</h2><button type="button" onClick={() => requireAccount() && (setAddMode('relationship'), setView('add'))}>إضافة صلة</button></div>
                <div className="tree-orbit" aria-label="معاينة رمزية لشجرة العائلة"><span className="tree-root">صلة</span><span className="tree-node n1">جد</span><span className="tree-node n2">أب</span><span className="tree-node n3">أم</span><span className="tree-node n4">ابن</span><span className="tree-node n5">ابنة</span></div>
              </article>
            </section>
"""

home_anchor = """        {schemaReady && view === 'home' && (
          <>
            <section className="hero-panel">"""
replace_once(home_anchor, """        {schemaReady && view === 'home' && (
          <>
""" + home_dashboard + """            <section className="hero-panel">""")

details_views = """
        {schemaReady && view === 'family' && selectedFamily && (
          <section className="page-section detail-page">
            <button className="back-button" type="button" onClick={() => setView('search')}>→ العودة للدليل</button>
            <div className="detail-hero">
              <span className="detail-avatar family-avatar">{selectedFamily.name[0]}</span>
              <div><span className="eyebrow">ملف العائلة</span><h1>{selectedFamily.name}</h1><p>{selectedFamily.description || 'لا توجد نبذة مضافة لهذه العائلة حتى الآن.'}</p></div>
            </div>
            <div className="detail-facts">
              <article><span>مكان الأصل</span><strong>{selectedFamily.origin_place || 'غير محدد'}</strong></article>
              <article><span>عدد الأشخاص المعتمدين</span><strong>{approvedPeople.filter((item) => item.family_id === selectedFamily.id).length}</strong></article>
              <article><span>حالة السجل</span><strong>{selectedFamily.status === 'approved' ? 'معتمد' : 'بانتظار الاعتماد'}</strong></article>
            </div>
            <div className="detail-section">
              <div className="section-title"><div><span className="eyebrow">أفراد العائلة</span><h2>الأشخاص المسجلون</h2></div></div>
              <div className="detail-list">
                {approvedPeople.filter((item) => item.family_id === selectedFamily.id).length ? approvedPeople.filter((item) => item.family_id === selectedFamily.id).map((item) => (
                  <button className="list-row interactive-row" type="button" key={item.id} onClick={() => void openPerson(item)}><span className="avatar-letter">{item.full_name[0]}</span><div><strong>{item.full_name}</strong><small>{item.birth_year ? `مواليد ${item.birth_year}` : 'سنة الميلاد غير محددة'}{item.is_deceased ? ' · متوفى' : ''}</small></div><span>‹</span></button>
                )) : <div className="empty-state compact">لا يوجد أشخاص معتمدون ضمن هذه العائلة.</div>}
              </div>
            </div>
          </section>
        )}

        {schemaReady && view === 'person' && selectedPerson && (
          <section className="page-section detail-page">
            <button className="back-button" type="button" onClick={() => setView('search')}>→ العودة للدليل</button>
            <div className="detail-hero">
              <span className="detail-avatar">{selectedPerson.full_name[0]}</span>
              <div><span className="eyebrow">ملف شخص</span><h1>{selectedPerson.full_name}</h1><p>{selectedPerson.description || 'لا توجد نبذة مضافة لهذا الشخص.'}</p></div>
            </div>
            <div className="detail-facts">
              <article><span>العائلة</span><strong>{familyName(selectedPerson.families) || 'غير محددة'}</strong></article>
              <article><span>سنة الميلاد</span><strong>{selectedPerson.birth_year || 'غير محددة'}</strong></article>
              <article><span>الحالة</span><strong>{selectedPerson.is_deceased ? 'متوفى' : 'على قيد الحياة'}</strong></article>
            </div>
            {session && !profile?.linked_person_id && (
              <div className="link-account-card">
                <div><strong>هل هذا سجلك؟</strong><p>قدّم طلب ربط حسابك بهذا الشخص للوصول إلى ميزات الملف الشخصي لاحقًا.</p></div>
                <button className="primary" type="button" disabled={busy || ownLinkRequest?.status === 'pending'} onClick={() => void requestAccountLink(selectedPerson)}>{ownLinkRequest?.status === 'pending' ? 'الطلب قيد المراجعة' : 'هذا أنا — ربط الحساب'}</button>
              </div>
            )}
            <div className="detail-section">
              <div className="section-title"><div><span className="eyebrow">صلة الرحم</span><h2>العلاقات المعتمدة</h2></div></div>
              {relationsLoading ? <div className="empty-state compact">جارٍ تحميل العلاقات…</div> : relationships.length ? (
                <div className="relationship-grid">{relationships.map((relation) => {
                  const selectedIsSource = relation.source_person_id === selectedPerson.id
                  const other = selectedIsSource ? relation.target : relation.source
                  const otherRecord = people.find((item) => item.id === personId(other))
                  const relationLabel = selectedIsSource ? relationshipLabels[relation.relation_type] : inverseRelationshipLabels[relation.relation_type]
                  return <button className="relationship-card" type="button" key={relation.id} onClick={() => otherRecord && void openPerson(otherRecord)}><span>{relationLabel || 'صلة قرابة'}</span><strong>{personName(other) || 'شخص غير محدد'}</strong>{relation.notes && <small>{relation.notes}</small>}</button>
                })}</div>
              ) : <div className="empty-state compact">لا توجد صلات قرابة معتمدة لهذا الشخص.</div>}
            </div>
          </section>
        )}

        {schemaReady && view === 'account' && session && (
          <section className="page-section narrow account-page">
            <button className="back-button" type="button" onClick={() => setView('home')}>→ العودة للرئيسية</button>
            <div className="detail-hero account-hero"><span className="detail-avatar">{userName[0]}</span><div><span className="eyebrow">حسابي</span><h1>{userName}</h1><p>{session.user.email}</p></div></div>
            <div className="account-status-card">
              <span className={`status ${profile?.linked_person_id ? 'approved' : ownLinkRequest?.status === 'pending' ? 'pending' : ''}`}>{profile?.linked_person_id ? 'مرتبط' : ownLinkRequest?.status === 'pending' ? 'قيد المراجعة' : 'غير مرتبط'}</span>
              <h2>{profile?.linked_person_id ? 'الحساب مرتبط بسجل شخص' : ownLinkRequest?.status === 'pending' ? 'طلب الربط قيد المراجعة' : 'اربط حسابك بسجلك داخل الدليل'}</h2>
              <p>{profile?.linked_person_id ? people.find((item) => item.id === profile.linked_person_id)?.full_name || 'تم اعتماد الربط.' : ownLinkRequest?.status === 'pending' ? `السجل المطلوب: ${personName(ownLinkRequest.people)}` : 'ابحث عن اسمك في الدليل وافتح ملف الشخص ثم اضغط «هذا أنا».'}</p>
              {!profile?.linked_person_id && ownLinkRequest?.status !== 'pending' && <button className="primary" type="button" onClick={() => setView('search')}>البحث عن سجلي</button>}
            </div>
          </section>
        )}

"""
replace_once(
    "        {schemaReady && view === 'add' && session && (",
    details_views + "        {schemaReady && view === 'add' && session && (",
)

replace_once(
    """              <button className={addMode === 'event' ? 'active' : ''} onClick={() => setAddMode('event')}>مناسبة</button>
            </div>""",
    """              <button className={addMode === 'event' ? 'active' : ''} onClick={() => setAddMode('event')}>مناسبة</button>
              <button className={addMode === 'relationship' ? 'active' : ''} onClick={() => setAddMode('relationship')}>صلة قرابة</button>
            </div>""",
)

relationship_form = """

            {addMode === 'relationship' && <form className="data-form" onSubmit={submitRelationship}><label><span>الشخص الأول *</span><select value={relationshipForm.source_person_id} onChange={(e) => setRelationshipForm({ ...relationshipForm, source_person_id: e.target.value })} required><option value="">اختر الشخص</option>{approvedPeople.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label><label><span>صلته بالشخص الثاني *</span><select value={relationshipForm.relation_type} onChange={(e) => setRelationshipForm({ ...relationshipForm, relation_type: e.target.value })}>{Object.entries(relationshipLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>الشخص الثاني *</span><select value={relationshipForm.target_person_id} onChange={(e) => setRelationshipForm({ ...relationshipForm, target_person_id: e.target.value })} required><option value="">اختر الشخص</option>{approvedPeople.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label><label className="full"><span>ملاحظة أو مصدر المعلومة</span><textarea value={relationshipForm.notes} onChange={(e) => setRelationshipForm({ ...relationshipForm, notes: e.target.value })} rows={4} /></label><button className="primary full" disabled={busy}>إرسال صلة القرابة للمراجعة</button></form>}
"""
replace_once(
    "          </section>\n        )}\n\n        {schemaReady && view === 'admin'",
    relationship_form + "          </section>\n        )}\n\n        {schemaReady && view === 'admin'",
)

APP_PATH.write_text(app)

setup = SETUP_PATH.read_text()
migration = MIGRATION_PATH.read_text()
marker = '-- PHASE 2: PERSON RELATIONSHIPS AND ACCOUNT LINKING'
if marker not in setup:
    setup_anchor = "\ncommit;\nnotify pgrst, 'reload schema';"
    if setup_anchor not in setup:
        raise RuntimeError('Missing SETUP.sql commit anchor')
    setup = setup.replace(setup_anchor, "\n\n" + migration + setup_anchor, 1)
    SETUP_PATH.write_text(setup)

print('Phase two patch applied successfully.')
