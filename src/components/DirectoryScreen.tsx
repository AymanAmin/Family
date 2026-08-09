import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import VerifiedBadge from './VerifiedBadge'

type RelatedFamily = { name?: string } | { name?: string }[] | null

export type DirectoryPerson = {
  id: string
  full_name: string
  gender: 'male' | 'female' | null
  birth_year: number | null
  is_deceased: boolean
  death_date: string | null
  is_verified: boolean
  description: string | null
  status: 'pending' | 'approved' | 'rejected'
  family_id: string | null
  family_name?: string | null
  families?: RelatedFamily
  created_by: string
  created_at: string
}

export type DirectoryHousehold = {
  household_id: string
  display_name: string
  husband_person_id: string
  husband_name: string
  spouse_count: number
  child_count: number
  spouse_names: string[]
  lineage_name: string | null
  branch_name: string | null
  total_count: number
}

type Props = {
  initialTerm?: string
  initialTab?: 'all' | 'people' | 'families'
  onOpenPerson: (person: DirectoryPerson) => void
}

type Tab = 'all' | 'people' | 'families'
type PeoplePage = { rows: DirectoryPerson[]; count: number | null; hasMore: boolean }
type HouseholdPage = { rows: DirectoryHousehold[]; count: number | null; hasMore: boolean }

const PAGE_SIZE = 8
const CACHE_TTL = 45_000
const peopleCache = new Map<string, PeoplePage & { savedAt: number }>()
const householdCache = new Map<string, HouseholdPage & { savedAt: number }>()

function cacheKey(term: string, page: number) {
  return `${term.trim().toLocaleLowerCase('ar')}::${page}`
}

function normalizePerson(item: Record<string, unknown>): DirectoryPerson {
  return {
    id: String(item.id ?? ''),
    full_name: String(item.full_name ?? ''),
    gender: item.gender === 'male' || item.gender === 'female' ? item.gender : null,
    birth_year: typeof item.birth_year === 'number' ? item.birth_year : null,
    is_deceased: Boolean(item.is_deceased),
    death_date: typeof item.death_date === 'string' ? item.death_date : null,
    is_verified: Boolean(item.is_verified),
    description: typeof item.description === 'string' ? item.description : null,
    status: item.status === 'pending' || item.status === 'rejected' ? item.status : 'approved',
    family_id: typeof item.family_id === 'string' ? item.family_id : null,
    family_name: typeof item.family_name === 'string' ? item.family_name : null,
    families: (item.families as RelatedFamily | undefined) ?? null,
    created_by: String(item.created_by ?? ''),
    created_at: String(item.created_at ?? ''),
  }
}

function normalizeHousehold(item: Record<string, unknown>): DirectoryHousehold {
  return {
    household_id: String(item.household_id ?? ''),
    display_name: String(item.display_name ?? ''),
    husband_person_id: String(item.husband_person_id ?? ''),
    husband_name: String(item.husband_name ?? ''),
    spouse_count: Number(item.spouse_count ?? 0) || 0,
    child_count: Number(item.child_count ?? 0) || 0,
    spouse_names: Array.isArray(item.spouse_names) ? item.spouse_names.map(String) : [],
    lineage_name: typeof item.lineage_name === 'string' ? item.lineage_name : null,
    branch_name: typeof item.branch_name === 'string' ? item.branch_name : null,
    total_count: Number(item.total_count ?? 0) || 0,
  }
}

function displayLineage(value: string | null) {
  if (!value) return ''
  return value.replace(/^عائلة\s+/, 'نسب ')
}

function PersonCard({ item, onOpen }: { item: DirectoryPerson; onOpen: (item: DirectoryPerson) => void }) {
  const meta = [item.birth_year ? String(item.birth_year) : '', item.is_deceased ? 'متوفى' : '', item.description || ''].filter(Boolean).slice(0, 2).join(' · ')
  return (
    <button className="directory-person-card" type="button" onClick={() => onOpen(item)}>
      <span className={`directory-avatar ${item.gender === 'female' ? 'female' : ''}`}>{item.full_name.trim().charAt(0) || '؟'}</span>
      <span className="directory-card-copy">
        <span className="verified-name-line"><strong>{item.full_name}</strong>{item.is_verified && <VerifiedBadge compact />}</span>
        <small>{meta || 'ملف شخص'}</small>
      </span>
      <span className="directory-arrow" aria-hidden="true">‹</span>
    </button>
  )
}

function HouseholdCard({ item, onOpen }: { item: DirectoryHousehold; onOpen: (item: DirectoryHousehold) => void }) {
  const spouseLabel = item.spouse_count === 1 ? item.spouse_names[0] || 'زوجة واحدة' : `${item.spouse_count} زوجات`
  const lineage = item.branch_name || displayLineage(item.lineage_name)
  return (
    <button className="directory-family-card household-directory-card" type="button" onClick={() => onOpen(item)}>
      <span className="directory-family-mark">{item.husband_name.trim().charAt(0) || 'أ'}</span>
      <span className="directory-card-copy">
        <strong>{item.display_name}</strong>
        <small>{spouseLabel} · {item.child_count} أبناء{lineage ? ` · ${lineage}` : ''}</small>
      </span>
      <span className="directory-arrow" aria-hidden="true">‹</span>
    </button>
  )
}

function hasNextPage(receivedLength: number, count: number | null, from: number) {
  return receivedLength > PAGE_SIZE || (count != null && from + PAGE_SIZE < count)
}

async function fetchPeoplePage(page: number, queryTerm: string): Promise<PeoplePage> {
  if (!supabase) return { rows: [], count: null, hasMore: false }
  const key = cacheKey(queryTerm, page)
  const cached = peopleCache.get(key)
  if (cached && Date.now() - cached.savedAt < CACHE_TTL) return cached

  const from = page * PAGE_SIZE
  const normalizedTerm = queryTerm.trim()

  if (normalizedTerm) {
    const smart = await supabase.rpc('search_directory_people', { p_query: normalizedTerm, p_limit: PAGE_SIZE + 1, p_offset: from })
    if (!smart.error) {
      const received = (smart.data ?? []).map((item: unknown) => normalizePerson(item as Record<string, unknown>))
      const value: PeoplePage = { rows: received.slice(0, PAGE_SIZE), count: null, hasMore: received.length > PAGE_SIZE }
      peopleCache.set(key, { ...value, savedAt: Date.now() })
      return value
    }
  }

  const to = from + PAGE_SIZE
  let query = supabase
    .from('people')
    .select('id,full_name,gender,birth_year,is_deceased,death_date,is_verified,description,status,family_id,created_by,created_at,families(name)', { count: 'planned' })
    .eq('status', 'approved')
  if (normalizedTerm) query = query.ilike('full_name', `%${normalizedTerm}%`)
  const result = await query.order(normalizedTerm ? 'full_name' : 'created_at', { ascending: Boolean(normalizedTerm) }).range(from, to)

  if (result.error) {
    const fallbackBase = supabase.from('people').select('id,full_name,gender,birth_year,is_deceased,death_date,description,status,family_id,created_by,created_at', { count: 'planned' }).eq('status', 'approved')
    const fallback = normalizedTerm ? fallbackBase.ilike('full_name', `%${normalizedTerm}%`) : fallbackBase
    const fallbackResult = await fallback.order(normalizedTerm ? 'full_name' : 'created_at', { ascending: Boolean(normalizedTerm) }).range(from, to)
    if (fallbackResult.error) throw fallbackResult.error
    const received = (fallbackResult.data ?? []).map((item) => normalizePerson(item as unknown as Record<string, unknown>))
    const value: PeoplePage = { rows: received.slice(0, PAGE_SIZE), count: fallbackResult.count ?? null, hasMore: hasNextPage(received.length, fallbackResult.count ?? null, from) }
    peopleCache.set(key, { ...value, savedAt: Date.now() })
    return value
  }

  const received = (result.data ?? []).map((item) => normalizePerson(item as unknown as Record<string, unknown>))
  const value: PeoplePage = { rows: received.slice(0, PAGE_SIZE), count: result.count ?? null, hasMore: hasNextPage(received.length, result.count ?? null, from) }
  peopleCache.set(key, { ...value, savedAt: Date.now() })
  return value
}

async function fetchHouseholdPage(page: number, queryTerm: string): Promise<HouseholdPage> {
  if (!supabase) return { rows: [], count: null, hasMore: false }
  const key = cacheKey(queryTerm, page)
  const cached = householdCache.get(key)
  if (cached && Date.now() - cached.savedAt < CACHE_TTL) return cached

  const from = page * PAGE_SIZE
  const { data, error } = await supabase.rpc('list_households_v1', {
    p_query: queryTerm.trim() || null,
    p_limit: PAGE_SIZE + 1,
    p_offset: from,
  })
  if (error) throw error
  const received = (data ?? []).map((item: unknown) => normalizeHousehold(item as Record<string, unknown>))
  const count = received[0]?.total_count ?? (page === 0 ? 0 : null)
  const value: HouseholdPage = {
    rows: received.slice(0, PAGE_SIZE),
    count,
    hasMore: received.length > PAGE_SIZE || (count != null && from + PAGE_SIZE < count),
  }
  householdCache.set(key, { ...value, savedAt: Date.now() })
  return value
}

export default function DirectoryScreen({ initialTerm = '', initialTab = 'all', onOpenPerson }: Props) {
  const [term, setTerm] = useState(initialTerm)
  const [submittedTerm, setSubmittedTerm] = useState(initialTerm.trim())
  const [tab, setTab] = useState<Tab>(initialTab)
  const [people, setPeople] = useState<DirectoryPerson[]>([])
  const [households, setHouseholds] = useState<DirectoryHousehold[]>([])
  const [peoplePage, setPeoplePage] = useState(0)
  const [householdPage, setHouseholdPage] = useState(0)
  const [peopleHasMore, setPeopleHasMore] = useState(false)
  const [householdHasMore, setHouseholdHasMore] = useState(false)
  const [peopleCount, setPeopleCount] = useState<number | null>(null)
  const [householdCount, setHouseholdCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState<'people' | 'families' | null>(null)
  const [error, setError] = useState('')
  const requestRef = useRef(0)
  const debounceRef = useRef<number | null>(null)

  const reload = useCallback(async (queryTerm: string) => {
    if (!supabase) return
    const requestId = ++requestRef.current
    setLoading(true)
    setError('')
    try {
      const [peopleResult, householdResult] = await Promise.all([fetchPeoplePage(0, queryTerm), fetchHouseholdPage(0, queryTerm)])
      if (requestId !== requestRef.current) return
      setPeople(peopleResult.rows)
      setPeopleCount(peopleResult.count)
      setPeopleHasMore(peopleResult.hasMore)
      setPeoplePage(0)
      setHouseholds(householdResult.rows)
      setHouseholdCount(householdResult.count)
      setHouseholdHasMore(householdResult.hasMore)
      setHouseholdPage(0)
    } catch (err) {
      if (requestId !== requestRef.current) return
      setError(err instanceof Error ? err.message : 'تعذر تحميل الدليل.')
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const value = initialTerm.trim()
    setTerm(initialTerm)
    setSubmittedTerm(value)
    void reload(value)
  }, [initialTerm, reload])

  useEffect(() => setTab(initialTab), [initialTab])
  useEffect(() => () => { if (debounceRef.current) window.clearTimeout(debounceRef.current) }, [])

  function updateTerm(value: string) {
    setTerm(value)
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    const normalized = value.trim()
    if (normalized.length === 1) return
    debounceRef.current = window.setTimeout(() => { setSubmittedTerm(normalized); void reload(normalized) }, 360)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    const value = term.trim()
    if (value.length === 1) return
    setSubmittedTerm(value)
    void reload(value)
  }

  function clearSearch() {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    setTerm('')
    setSubmittedTerm('')
    void reload('')
  }

  function openHousehold(item: DirectoryHousehold) {
    window.dispatchEvent(new CustomEvent('sila:open-household', { detail: { householdId: item.household_id } }))
  }

  async function loadMore(kind: 'people' | 'families') {
    if (loadingMore) return
    setLoadingMore(kind)
    setError('')
    try {
      if (kind === 'people') {
        const nextPage = peoplePage + 1
        const result = await fetchPeoplePage(nextPage, submittedTerm)
        setPeople((current) => [...current, ...result.rows.filter((row) => !current.some((old) => old.id === row.id))])
        setPeopleCount(result.count)
        setPeopleHasMore(result.hasMore)
        setPeoplePage(nextPage)
      } else {
        const nextPage = householdPage + 1
        const result = await fetchHouseholdPage(nextPage, submittedTerm)
        setHouseholds((current) => [...current, ...result.rows.filter((row) => !current.some((old) => old.household_id === row.household_id))])
        setHouseholdCount(result.count)
        setHouseholdHasMore(result.hasMore)
        setHouseholdPage(nextPage)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل المزيد.')
    } finally {
      setLoadingMore(null)
    }
  }

  const showPeople = tab === 'all' || tab === 'people'
  const showHouseholds = tab === 'all' || tab === 'families'
  const waitingForSecondCharacter = term.trim().length === 1

  return (
    <section className="directory-v2-page">
      <div className="directory-v2-hero">
        <div className="directory-v2-heading">
          <span className="directory-kicker">دليل صلة</span>
          <h1>اعثر على الشخص أو الأسرة بسرعة</h1>
          <p>الأسر تُنشأ تلقائيًا من الزواج المعتمد، ويُجمع تعدد الزوجات في ملف أسرة واحد باسم الزوج.</p>
        </div>
        <form className="directory-search-box" onSubmit={submit} role="search">
          <span className="directory-search-icon" aria-hidden="true">⌕</span>
          <input value={term} onChange={(event) => updateTerm(event.target.value)} placeholder="ابحث باسم شخص أو أسرة…" autoComplete="off" enterKeyHint="search" aria-label="البحث في دليل الأشخاص والأسر" />
          {term && <button className="directory-clear" type="button" onClick={clearSearch} aria-label="مسح البحث">×</button>}
          <button className="directory-search-submit" type="submit" disabled={waitingForSecondCharacter}>بحث</button>
        </form>
        {waitingForSecondCharacter && <div className="directory-search-tip">اكتب حرفًا ثانيًا لبدء البحث السريع.</div>}
        <div className="directory-tabs" role="tablist" aria-label="نوع النتائج">
          <button className={tab === 'all' ? 'active' : ''} type="button" onClick={() => setTab('all')}>الكل</button>
          <button className={tab === 'people' ? 'active' : ''} type="button" onClick={() => setTab('people')}>الأشخاص {peopleCount != null && <b title="عدد تقديري سريع">≈{peopleCount}</b>}</button>
          <button className={tab === 'families' ? 'active' : ''} type="button" onClick={() => setTab('families')}>الأسر {householdCount != null && <b>{householdCount}</b>}</button>
        </div>
      </div>

      {error && <div className="directory-inline-error" role="alert">{error}</div>}
      {loading ? (
        <div className="directory-skeleton-list" aria-label="جارٍ تحميل الدليل">{Array.from({ length: 5 }).map((_, index) => <span key={index} />)}</div>
      ) : (
        <div className="directory-result-stack" aria-live="polite">
          {showPeople && (
            <section className="directory-result-section">
              <header><div><span>الأفراد</span><h2>{submittedTerm ? `نتائج «${submittedTerm}»` : 'أحدث الأفراد المعتمدين'}</h2></div>{peopleCount != null && <strong>≈{peopleCount}</strong>}</header>
              {people.length ? <div className="directory-person-list">{people.map((item) => <PersonCard key={item.id} item={item} onOpen={onOpenPerson} />)}</div> : <div className="directory-empty">لا توجد نتائج أشخاص مطابقة.</div>}
              {peopleHasMore && <button className="directory-more" type="button" disabled={loadingMore === 'people'} onClick={() => void loadMore('people')}>{loadingMore === 'people' ? 'جارٍ التحميل…' : 'عرض 8 أشخاص إضافيين'}</button>}
            </section>
          )}

          {showHouseholds && (
            <section className="directory-result-section family-results household-results">
              <header><div><span>الأسر</span><h2>{submittedTerm ? 'الأسر المطابقة' : 'الأسر المنشأة تلقائيًا'}</h2></div>{householdCount != null && <strong>{householdCount}</strong>}</header>
              {households.length ? <div className="directory-family-grid">{households.map((item) => <HouseholdCard key={item.household_id} item={item} onOpen={openHousehold} />)}</div> : <div className="directory-empty">لا توجد أسر مطابقة.</div>}
              {householdHasMore && <button className="directory-more" type="button" disabled={loadingMore === 'families'} onClick={() => void loadMore('families')}>{loadingMore === 'families' ? 'جارٍ تحميل المزيد…' : 'عرض 8 أسر إضافية'}</button>}
            </section>
          )}
        </div>
      )}
    </section>
  )
}
