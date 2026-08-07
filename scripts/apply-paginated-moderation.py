from pathlib import Path

app_path = Path('src/App.tsx')
main_path = Path('src/main.tsx')
app = app_path.read_text(encoding='utf-8')
main = main_path.read_text(encoding='utf-8')


def replace_once(source: str, before: str, after: str, label: str) -> str:
    if before not in source:
        if after in source:
            return source
        raise RuntimeError(f'Marker not found: {label}')
    return source.replace(before, after, 1)


app = replace_once(
    app,
    '''type PendingRecord = {
  id: string
  title: string
  subtitle: string
  table: 'families' | 'people' | 'events' | 'person_relationships' | 'account_link_requests'
  created_at: string
}''',
    '''type PendingRecord = {
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

const PENDING_PAGE_SIZE = 15''',
    'pending feed type',
)

app = replace_once(
    app,
    '''  const [pending, setPending] = useState<PendingRecord[]>([])''',
    '''  const [pending, setPending] = useState<PendingRecord[]>([])
  const [pendingHasMore, setPendingHasMore] = useState(false)
  const [pendingLoadingMore, setPendingLoadingMore] = useState(false)''',
    'pending pagination state',
)

old_loader = '''  const loadPending = useCallback(async () => {
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
      rows.push({ id: item.id, title: `${source} — ${target}`, subtitle: relationshipLabels[item.relation_type] || item.relation_type, table: 'person_relationships', created_at: item.created_at })
    }
    for (const item of linkResult.data ?? []) {
      rows.push({ id: item.id, title: personName(item.people as RelatedPerson) || 'طلب ربط حساب', subtitle: 'طلب إثبات أن الحساب يعود لهذا الشخص', table: 'account_link_requests', created_at: item.created_at })
    }
    setPending(rows.sort((a, b) => a.created_at.localeCompare(b.created_at)))
  }, [isAdmin])'''

new_loader = '''  const loadPending = useCallback(async (offset = 0, append = false) => {
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
      rows.push({ id: item.id, title: `${source} — ${target}`, subtitle: relationshipLabels[item.relation_type] || item.relation_type, table: 'person_relationships', created_at: item.created_at })
    }
    for (const item of linkResult.data ?? []) rows.push({ id: item.id, title: personName(item.people as RelatedPerson) || 'طلب ربط حساب', subtitle: 'طلب إثبات أن الحساب يعود لهذا الشخص', table: 'account_link_requests', created_at: item.created_at })

    setPending(rows.sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, PENDING_PAGE_SIZE))
    setPendingHasMore(false)
    setPendingLoadingMore(false)
  }, [isAdmin])'''

app = replace_once(app, old_loader, new_loader, 'paginated pending loader')

app = replace_once(
    app,
    '''  useEffect(() => {
    void loadPending()
  }, [loadPending, families, people, events])''',
    '''  useEffect(() => {
    void loadPending()
  }, [loadPending])''',
    'pending effect',
)

app = replace_once(
    app,
    '''<span className="admin-console-count"><b>{pending.length}</b><small>طلب أساسي</small></span>''',
    '''<span className="admin-console-count"><b>{pending.length}</b><small>طلب محمّل</small></span>''',
    'admin count label',
)

old_requests = '''{adminTab === 'requests' && (pending.length ? <div className="review-list">{pending.map((record) => <article className="review-row" key={`${record.table}-${record.id}`}><div><span className="status pending">معلق</span><h3>{record.title}</h3><p>{record.subtitle} · {formatDate(record.created_at)}</p></div><div className="review-actions"><button className="approve" onClick={() => moderate(record, 'approved')} disabled={busy}>اعتماد</button><button className="reject" onClick={() => moderate(record, 'rejected')} disabled={busy}>رفض</button></div></article>)}</div> : <div className="empty-state"><strong>لا توجد طلبات معلقة</strong><span>جميع الطلبات الأساسية تمت مراجعتها.</span></div>)}'''

new_requests = '''{adminTab === 'requests' && (
                <>
                  {pending.length ? <div className="review-list">{pending.map((record) => <article className="review-row" key={`${record.table}-${record.id}`}><div><span className="status pending">معلق</span><h3>{record.title}</h3><p>{record.subtitle} · {formatDate(record.created_at)}</p></div><div className="review-actions"><button className="approve" onClick={() => moderate(record, 'approved')} disabled={busy}>اعتماد</button><button className="reject" onClick={() => moderate(record, 'rejected')} disabled={busy}>رفض</button></div></article>)}</div> : <div className="empty-state"><strong>لا توجد طلبات معلقة</strong><span>جميع الطلبات الأساسية تمت مراجعتها.</span></div>}
                  {pendingHasMore && <button className="admin-load-more" type="button" disabled={pendingLoadingMore} onClick={() => void loadPending(pending.length, true)}>{pendingLoadingMore ? 'جارٍ تحميل المزيد…' : 'عرض المزيد من الطلبات'}</button>}
                </>
              )}'''

app = replace_once(app, old_requests, new_requests, 'admin request pagination UI')

if "import './moderation-pagination.css'" not in main:
    main = main.replace("import './scale-ui-v2.css'", "import './scale-ui-v2.css'\nimport './moderation-pagination.css'")

app_path.write_text(app, encoding='utf-8')
main_path.write_text(main, encoding='utf-8')
print('Applied paginated moderation feed integration.')
