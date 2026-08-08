import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type Person = { id: string; full_name: string; birth_year: number | null; is_deceased: boolean }
type RelatedPerson = Person | Person[] | null

type Props = {
  familyId: string
  people?: Person[]
  onOpenPerson: (personId: string) => void
}

const labels: Record<string, string> = {
  birth: 'بالنسب / عائلة الأصل', marriage: 'بالزواج', paternal: 'من جهة الأب', maternal: 'من جهة الأم', guardian: 'وصاية أو كفالة', other: 'انتماء آخر',
}

// Keep the family profile light: load a small first batch, then fetch more only
// when the user explicitly asks for it.
const PAGE_SIZE = 10

type Membership = {
  id: string
  person_id: string
  membership_type: string
  is_primary: boolean
  person?: RelatedPerson
}

function onePerson(value: RelatedPerson): Person | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

export default function FamilyMembersPanel({ familyId, onOpenPerson }: Props) {
  const [rows, setRows] = useState<Membership[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)
  const [count, setCount] = useState<number | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestRef.current
    async function load() {
      if (!supabase) { setLoading(false); return }
      setLoading(true)
      const { data, error, count: exactCount } = await supabase
        .from('person_family_memberships')
        .select('id,person_id,membership_type,is_primary,person:people!person_family_memberships_person_id_fkey(id,full_name,birth_year,is_deceased)', { count: 'exact' })
        .eq('family_id', familyId)
        .eq('status', 'approved')
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })
        .range(0, PAGE_SIZE - 1)

      if (requestId !== requestRef.current) return
      if (!error) {
        const items = (data ?? []) as Membership[]
        setRows(items)
        setCount(exactCount ?? null)
        setHasMore(items.length === PAGE_SIZE && (exactCount == null || items.length < exactCount))
        setPage(0)
      }
      setLoading(false)
    }
    void load()
    return () => { requestRef.current += 1 }
  }, [familyId])

  async function loadMore() {
    if (!supabase || loading || !hasMore) return
    const requestId = ++requestRef.current
    setLoading(true)
    const nextPage = page + 1
    const from = nextPage * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error, count: exactCount } = await supabase
      .from('person_family_memberships')
      .select('id,person_id,membership_type,is_primary,person:people!person_family_memberships_person_id_fkey(id,full_name,birth_year,is_deceased)', { count: 'exact' })
      .eq('family_id', familyId)
      .eq('status', 'approved')
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .range(from, to)

    if (requestId !== requestRef.current) return
    if (!error) {
      const items = (data ?? []) as Membership[]
      setRows((current) => [...current, ...items.filter((item) => !current.some((old) => old.id === item.id))])
      setCount(exactCount ?? count)
      setHasMore(items.length === PAGE_SIZE && (exactCount == null || to + 1 < exactCount))
      setPage(nextPage)
    }
    setLoading(false)
  }

  const remaining = count == null ? null : Math.max(0, count - rows.length)
  const nextBatchSize = remaining == null ? PAGE_SIZE : Math.min(PAGE_SIZE, remaining)

  return <div className="detail-section family-members-panel">
    <div className="section-title family-members-title">
      <div><span className="eyebrow">دليل العائلة</span><h2>الأفراد حسب النسب والزواج والفروع</h2><p>يتم تحميل 10 أفراد فقط في البداية، ثم يمكنك عرض المزيد عند الحاجة.</p></div>
      {count != null && <span className="family-members-count" title="عدد أفراد العائلة"><b>{count}</b><small>عضو</small></span>}
    </div>
    <div className="detail-list family-member-list">
      {rows.length ? rows.map((membership) => {
        const person = onePerson(membership.person ?? null)
        if (!person) return null
        return <button className="family-member-card" type="button" key={membership.id} onClick={() => onOpenPerson(person.id)}>
          <span className="family-member-avatar">{person.full_name[0]}</span>
          <span className="family-member-copy"><strong>{person.full_name}</strong><small>{labels[membership.membership_type] || membership.membership_type}{membership.is_primary ? ' · أساسية' : ''}{person.birth_year ? ` · ${person.birth_year}` : ''}{person.is_deceased ? ' · متوفى' : ''}</small></span>
          <span className="family-member-arrow" aria-hidden="true">‹</span>
        </button>
      }) : <div className="empty-state compact">{loading ? 'جارٍ تحميل أفراد العائلة…' : 'لا توجد عضويات عائلية معتمدة لهذه العائلة بعد.'}</div>}
    </div>
    {hasMore && <button className="directory-more" type="button" disabled={loading} onClick={() => void loadMore()}>{loading ? 'جارٍ التحميل…' : `عرض المزيد${nextBatchSize > 0 ? ` (${nextBatchSize})` : ''}`}</button>}
  </div>
}
