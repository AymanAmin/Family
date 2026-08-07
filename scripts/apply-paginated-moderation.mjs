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
  `type PendingRecord = {
  id: string
  title: string
  subtitle: string
  table: 'families' | 'people' | 'events' | 'person_relationships' | 'account_link_requests'
  created_at: string
}`,
  `type PendingRecord = {
  id: string
  title: string
  subtitle: string
  table: 'families' | 'people' | 'events' | 'person_relationships' | 'account_link_requests'
  created_at: string
}

type PendingFeedRow = {
  id: string
  table_name: PendingRecord['table']
  title: string
  subtitle: string
  created_at: string
}

const PENDING_PAGE_SIZE = 15`,
  'pending feed type',
)

app = replaceOnce(
  app,
  `  const [pending, setPending] = useState<PendingRecord[]>([])`,
  `  const [pending, setPending] = useState<PendingRecord[]>([])
  const [pendingHasMore, setPendingHasMore] = useState(false)
  const [pendingLoadingMore, setPendingLoadingMore] = useState(false)`,
  'pending pagination state',
)

const oldLoader = `  const loadPending = useCallback(async () => {
    if (!supabase || !isAdmin) {
      setPending([])
      return
    }

    const [familyResult, peopleResult, eventResult, relationshipResult, linkResult] = await Promise.all([
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
      rows.push({ id: item.id, title: \`${'${source}'} — ${'${target}'}\`, subtitle: relationshipLabels[item.relation_type] || item.relation_type, table: 'person_relationships', created_at: item.created_at })
    }
    for (const item of linkResult.data ?? []) {
      rows.push({ id: item.id, title: personName(item.people as RelatedPerson) || 'طلب ربط حساب', subtitle: 'طلب إثبات أن الحساب يعود لهذا الشخص', table: 'account_link_requests', created_at: item.created_at })
    }
    setPending(rows.sort((a, b) => a.created_at.localeCompare(b.created_at)))
  }, [isAdmin])`

const newLoader = `  const loadPending = useCallback(async (offset = 0, append = false) => {
    if (!supabase || !isAdmin) {
      setPending([])
      setPendingHasMore(false)
      setPendingLoadingMore(false)
      return
    }

    if (append) setPendingLoadingMore(true)

    const feedResult = await supabase.rpc('list_pending_moderation_feed', {
      p_limit: PENDING_PAGE_SIZE + 1,
      p_offset: offset,
    })

    if (!feedResult.error) {
      const received = (feedResult.data ?? []) as PendingFeedRow[]
      const page = received.slice(0, PENDING_PAGE_SIZE).map((item): PendingRecord => ({
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        table: item.table_name,
        created_at: item.created_at,
      }))
      setPendingHasMore(received.length > PENDING_PAGE_SIZE)
      setPending((current) => append ? [...current, ...page] : page)
      setPendingLoadingMore(false)
      return
    }

    // Compatibility fallback until migration 015 is applied. It is deliberately capped.
    if (offset > 0) {
      setPendingHasMore(false)
      setPendingLoadingMore(false)
      return
    }

    const [familyResult, peopleResult, eventResult, relationshipResult, linkResult] = await Promise.all([
      supabase.from('families').select('id,name,origin_place,created_at').eq('status', 'pending').order('created_at').limit(4),
      supabase.from('people').select('id,full_name,created_at,families(name)').eq('status', 'pending').order('created_at').limit(4),
      supabase.from('events').select('id,title,event_type,created_at').eq('status', 'pending').order('created_at').limit(4),
      supabase.from('person_relationships').select('id,relation_type,created_at,source:people!person_relationships_source_person_id_fkey(full_name),target:people!person_relationships_target_person_id_fkey(full_name)').eq('status', 'pending').order('created_at').limit(4),
      supabase.from('account_link_requests').select('id,created_at,people(full_name)').eq('status', 'pending').order('created_at').limit(4),
    ])

    const rows: PendingRecord[] = []
    for (const item of familyResult.data ?? []) rows.push({ id: item.id, title: item.name, subtitle: item.origin_place || 'عائلة جديدة', table: 'families', created_at: item.created_at })
    for (const item of peopleResult.data ?? []) rows.push({ id: item.id, title: item.full_name, subtitle: familyName(item.families as RelatedFamily) || 'شخص جديد', table: 'people', created_at: item.created_at })
    for (const item of eventResult.data ?? []) rows.push({ id: item.id, title: item.title, subtitle: eventLabels[item.event_type] || item.event_type, table: 'events', created_at: item.created_at })
    for (const item of relationshipResult.data ?? []) {
      const source = personName(item.source as RelatedPerson) || 'شخص أول'
      const target = personName(item.target as RelatedPerson) || 'شخص ثانٍ'
      rows.push({ id: item.id, title: \`${'${source}'} — ${'${target}'}\`, subtitle: relationshipLabels[item.relation_type] || item.relation_type, table: 'person_relationships', created_at: item.created_at })
    }
    for (const item of linkResult.data ?? []) rows.push({ id: item.id, title: personName(item.people as RelatedPerson) || 'طلب ربط حساب', subtitle: 'طلب إثبات أن الحساب يعود لهذا الشخص', table: 'account_link_requests', created_at: item.created_at })

    setPending(rows.sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, PENDING_PAGE_SIZE))
    setPendingHasMore(false)
    setPendingLoadingMore(false)
  }, [isAdmin])`

app = replaceOnce(app, oldLoader, newLoader, 'paginated pending loader')

app = replaceOnce(
  app,
  `  useEffect(() => {
    void loadPending()
  }, [loadPending, families, people, events])`,
  `  useEffect(() => {
    void loadPending()
  }, [loadPending])`,
  'pending effect',
)

app = replaceOnce(
  app,
  `<span className="admin-console-count"><b>{pending.length}</b><small>طلب أساسي</small></span>`,
  `<span className="admin-console-count"><b>{pending.length}</b><small>طلب محمّل</small></span>`,
  'admin count label',
)

const oldRequests = `{adminTab === 'requests' && (pending.length ? <div className="review-list">{pending.map((record) => <article className="review-row" key={\`${'${record.table}'}-${'${record.id}'}\`}><div><span className="status pending">معلق</span><h3>{record.title}</h3><p>{record.subtitle} · {formatDate(record.created_at)}</p></div><div className="review-actions"><button className="approve" onClick={() => moderate(record, 'approved')} disabled={busy}>اعتماد</button><button className="reject" onClick={() => moderate(record, 'rejected')} disabled={busy}>رفض</button></div></article>)}</div> : <div className="empty-state"><strong>لا توجد طلبات معلقة</strong><span>جميع الطلبات الأساسية تمت مراجعتها.</span></div>)}`

const newRequests = `{adminTab === 'requests' && (
                <>
                  {pending.length ? <div className="review-list">{pending.map((record) => <article className="review-row" key={\`${'${record.table}'}-${'${record.id}'}\`}><div><span className="status pending">معلق</span><h3>{record.title}</h3><p>{record.subtitle} · {formatDate(record.created_at)}</p></div><div className="review-actions"><button className="approve" onClick={() => moderate(record, 'approved')} disabled={busy}>اعتماد</button><button className="reject" onClick={() => moderate(record, 'rejected')} disabled={busy}>رفض</button></div></article>)}</div> : <div className="empty-state"><strong>لا توجد طلبات معلقة</strong><span>جميع الطلبات الأساسية تمت مراجعتها.</span></div>}
                  {pendingHasMore && <button className="admin-load-more" type="button" disabled={pendingLoadingMore} onClick={() => void loadPending(pending.length, true)}>{pendingLoadingMore ? 'جارٍ تحميل المزيد…' : 'عرض المزيد من الطلبات'}</button>}
                </>
              )}`

app = replaceOnce(app, oldRequests, newRequests, 'admin request pagination UI')

if (!main.includes("import './moderation-pagination.css'")) {
  main = main.replace("import './scale-ui-v2.css'", "import './scale-ui-v2.css'\nimport './moderation-pagination.css'")
}

fs.writeFileSync(appPath, app)
fs.writeFileSync(mainPath, main)
console.log('Applied paginated moderation feed integration.')
