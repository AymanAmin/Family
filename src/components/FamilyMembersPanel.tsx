import { useEffect, useState } from 'react'
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
  const pageSize = 12

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!supabase) { setLoading(false); return }
      setLoading(true)
      const { data, error } = await supabase
        .from('person_family_memberships')
        .select('id,person_id,membership_type,is_primary,person:people!person_family_memberships_person_id_fkey(id,full_name,birth_year,is_deceased)')
        .eq('family_id', familyId)
        .eq('status', 'approved')
        .order('is_primary', { ascending: false })
        .range(0, pageSize - 1)
      if (cancelled) return
      if (!error) {
        const items = (data ?? []) as Membership[]
        setRows(items)
        setHasMore(items.length === pageSize)
        setPage(0)
      }
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [familyId])

  async function loadMore() {
    if (!supabase) return
    setLoading(true)
    const nextPage = page + 1
    const from = nextPage * pageSize
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('person_family_memberships')
      .select('id,person_id,membership_type,is_primary,person:people!person_family_memberships_person_id_fkey(id,full_name,birth_year,is_deceased)')
      .eq('family_id', familyId)
      .eq('status', 'approved')
      .order('is_primary', { ascending: false })
      .range(from, to)
    if (!error) {
      const items = (data ?? []) as Membership[]
      setRows((current) => [...current, ...items.filter((item) => !current.some((old) => old.id === item.id))])
      setHasMore(items.length === pageSize)
      setPage(nextPage)
    }
    setLoading(false)
  }

  return <div className="detail-section">
    <div className="section-title"><div><span className="eyebrow">كل المنتمين للعائلة</span><h2>الأفراد حسب النسب والزواج والفروع</h2></div></div>
    <div className="detail-list">
      {rows.length ? rows.map((membership) => {
        const person = onePerson(membership.person ?? null)
        if (!person) return null
        return <button className="list-row interactive-row" type="button" key={membership.id} onClick={() => onOpenPerson(person.id)}>
          <span className="avatar-letter">{person.full_name[0]}</span>
          <div><strong>{person.full_name}</strong><small>{labels[membership.membership_type] || membership.membership_type}{membership.is_primary ? ' · أساسية' : ''}{person.birth_year ? ` · ${person.birth_year}` : ''}{person.is_deceased ? ' · متوفى' : ''}</small></div><span>‹</span>
        </button>
      }) : <div className="empty-state compact">{loading ? 'جارٍ تحميل أفراد العائلة…' : 'لا توجد عضويات عائلية معتمدة لهذه العائلة بعد.'}</div>}
    </div>
    {hasMore && <button className="directory-more" type="button" disabled={loading} onClick={() => void loadMore()}>{loading ? 'جارٍ التحميل…' : 'عرض المزيد من أفراد العائلة'}</button>}
  </div>
}
