import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type RelatedFamily = { name?: string } | { name?: string }[] | null

export type DirectoryPerson = {
  id: string
  full_name: string
  gender: 'male' | 'female' | null
  birth_year: number | null
  is_deceased: boolean
  description: string | null
  status: 'pending' | 'approved' | 'rejected'
  family_id: string | null
  families?: RelatedFamily
  created_by: string
  created_at: string
}

export type DirectoryFamily = {
  id: string
  name: string
  description: string | null
  origin_place: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_by: string
  created_at: string
}

type Props = {
  initialTerm?: string
  onOpenPerson: (person: DirectoryPerson) => void
  onOpenFamily: (family: DirectoryFamily) => void
}

type Tab = 'all' | 'people' | 'families'
const PAGE_SIZE = 8

function familyName(value: RelatedFamily): string {
  if (!value) return ''
  if (Array.isArray(value)) return value[0]?.name ?? ''
  return value.name ?? ''
}

function PersonCard({ item, onOpen }: { item: DirectoryPerson; onOpen: (item: DirectoryPerson) => void }) {
  return (
    <button className="directory-person-card" type="button" onClick={() => onOpen(item)}>
      <span className={`directory-avatar ${item.gender === 'female' ? 'female' : ''}`}>{item.full_name.trim().charAt(0) || '؟'}</span>
      <span className="directory-card-copy">
        <strong>{item.full_name}</strong>
        <small>{familyName(item.families) || 'العائلة غير محددة'}{item.birth_year ? ` · ${item.birth_year}` : ''}</small>
      </span>
      <span className="directory-arrow">‹</span>
    </button>
  )
}

function FamilyCard({ item, onOpen }: { item: DirectoryFamily; onOpen: (item: DirectoryFamily) => void }) {
  return (
    <button className="directory-family-card" type="button" onClick={() => onOpen(item)}>
      <span className="directory-family-mark">{item.name.trim().charAt(0) || 'ع'}</span>
      <span className="directory-card-copy">
        <strong>{item.name}</strong>
        <small>{item.origin_place || item.description || 'عائلة معتمدة'}</small>
      </span>
      <span className="directory-arrow">‹</span>
    </button>
  )
}

export default function DirectoryScreen({ initialTerm = '', onOpenPerson, onOpenFamily }: Props) {
  const [term, setTerm] = useState(initialTerm)
  const [submittedTerm, setSubmittedTerm] = useState(initialTerm.trim())
  const [tab, setTab] = useState<Tab>('all')
  const [people, setPeople] = useState<DirectoryPerson[]>([])
  const [families, setFamilies] = useState<DirectoryFamily[]>([])
  const [peoplePage, setPeoplePage] = useState(0)
  const [familyPage, setFamilyPage] = useState(0)
  const [peopleHasMore, setPeopleHasMore] = useState(false)
  const [familyHasMore, setFamilyHasMore] = useState(false)
  const [peopleCount, setPeopleCount] = useState<number | null>(null)
  const [familyCount, setFamilyCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState<'people' | 'families' | null>(null)
  const [error, setError] = useState('')

  const loadPage = useCallback(async (kind: 'people' | 'families', page: number, append: boolean, queryTerm: string) => {
    if (!supabase) return
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    if (kind === 'people') {
      let query = supabase
        .from('people')
        .select('id,full_name,gender,birth_year,is_deceased,description,status,family_id,created_by,created_at,families(name)', { count: 'exact' })
        .eq('status', 'approved')
      if (queryTerm) query = query.ilike('full_name', `%${queryTerm}%`)
      const result = await query.order(queryTerm ? 'full_name' : 'created_at', { ascending: Boolean(queryTerm) }).range(from, to)
      if (result.error) throw result.error
      const rows = (result.data ?? []) as DirectoryPerson[]
      setPeople((current) => append ? [...current, ...rows.filter((row) => !current.some((old) => old.id === row.id))] : rows)
      setPeopleCount(result.count ?? null)
      setPeopleHasMore(rows.length === PAGE_SIZE && (result.count == null || to + 1 < result.count))
      setPeoplePage(page)
      return
    }

    let query = supabase
      .from('families')
      .select('id,name,description,origin_place,status,created_by,created_at', { count: 'exact' })
      .eq('status', 'approved')
    if (queryTerm) query = query.ilike('name', `%${queryTerm}%`)
    const result = await query.order(queryTerm ? 'name' : 'created_at', { ascending: Boolean(queryTerm) }).range(from, to)
    if (result.error) throw result.error
    const rows = (result.data ?? []) as DirectoryFamily[]
    setFamilies((current) => append ? [...current, ...rows.filter((row) => !current.some((old) => old.id === row.id))] : rows)
    setFamilyCount(result.count ?? null)
    setFamilyHasMore(rows.length === PAGE_SIZE && (result.count == null || to + 1 < result.count))
    setFamilyPage(page)
  }, [])

  const reload = useCallback(async (queryTerm: string) => {
    if (!supabase) return
    setLoading(true)
    setError('')
    try {
      await Promise.all([
        loadPage('people', 0, false, queryTerm),
        loadPage('families', 0, false, queryTerm),
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل الدليل.')
    } finally {
      setLoading(false)
    }
  }, [loadPage])

  useEffect(() => {
    setTerm(initialTerm)
    setSubmittedTerm(initialTerm.trim())
    void reload(initialTerm.trim())
  }, [initialTerm, reload])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = term.trim()
    setSubmittedTerm(value)
    void reload(value)
  }

  async function loadMore(kind: 'people' | 'families') {
    setLoadingMore(kind)
    setError('')
    try {
      await loadPage(kind, kind === 'people' ? peoplePage + 1 : familyPage + 1, true, submittedTerm)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل المزيد.')
    } finally {
      setLoadingMore(null)
    }
  }

  const showPeople = tab === 'all' || tab === 'people'
  const showFamilies = tab === 'all' || tab === 'families'

  return (
    <section className="directory-v2-page">
      <div className="directory-v2-hero">
        <div className="directory-v2-heading">
          <span className="directory-kicker">دليل صلة</span>
          <h1>اعثر على الشخص أو العائلة بسرعة</h1>
          <p>النتائج تُحمّل على دفعات صغيرة من قاعدة البيانات للحفاظ على سرعة التطبيق.</p>
        </div>
        <form className="directory-search-box" onSubmit={submit}>
          <span className="directory-search-icon">⌕</span>
          <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="ابحث بالاسم…" autoComplete="off" />
          {term && <button className="directory-clear" type="button" onClick={() => { setTerm(''); setSubmittedTerm(''); void reload('') }}>×</button>}
          <button className="directory-search-submit" type="submit">بحث</button>
        </form>
        <div className="directory-tabs" role="tablist" aria-label="نوع النتائج">
          <button className={tab === 'all' ? 'active' : ''} type="button" onClick={() => setTab('all')}>الكل</button>
          <button className={tab === 'people' ? 'active' : ''} type="button" onClick={() => setTab('people')}>الأشخاص {peopleCount != null && <b>{peopleCount}</b>}</button>
          <button className={tab === 'families' ? 'active' : ''} type="button" onClick={() => setTab('families')}>العائلات {familyCount != null && <b>{familyCount}</b>}</button>
        </div>
      </div>

      {error && <div className="directory-inline-error">{error}</div>}
      {loading ? (
        <div className="directory-skeleton-list" aria-label="جارٍ تحميل الدليل">
          {Array.from({ length: 5 }).map((_, index) => <span key={index} />)}
        </div>
      ) : (
        <div className="directory-result-stack">
          {showPeople && (
            <section className="directory-result-section">
              <header><div><span>الأفراد</span><h2>{submittedTerm ? `نتائج «${submittedTerm}»` : 'أحدث الأفراد المعتمدين'}</h2></div>{peopleCount != null && <strong>{peopleCount}</strong>}</header>
              {people.length ? (
                <div className="directory-person-list">{people.map((item) => <PersonCard key={item.id} item={item} onOpen={onOpenPerson} />)}</div>
              ) : <div className="directory-empty">لا توجد نتائج أشخاص مطابقة.</div>}
              {peopleHasMore && <button className="directory-more" type="button" disabled={loadingMore === 'people'} onClick={() => void loadMore('people')}>{loadingMore === 'people' ? 'جارٍ التحميل…' : 'عرض 8 أشخاص إضافيين'}</button>}
            </section>
          )}

          {showFamilies && (
            <section className="directory-result-section family-results">
              <header><div><span>العائلات</span><h2>{submittedTerm ? 'العائلات المطابقة' : 'العائلات المعتمدة'}</h2></div>{familyCount != null && <strong>{familyCount}</strong>}</header>
              {families.length ? (
                <div className="directory-family-grid">{families.map((item) => <FamilyCard key={item.id} item={item} onOpen={onOpenFamily} />)}</div>
              ) : <div className="directory-empty">لا توجد عائلات مطابقة.</div>}
              {familyHasMore && <button className="directory-more" type="button" disabled={loadingMore === 'families'} onClick={() => void loadMore('families')}>{loadingMore === 'families' ? 'جارٍ التحميل…' : 'عرض المزيد من العائلات'}</button>}
            </section>
          )}
        </div>
      )}
    </section>
  )
}
