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
  initialTab?: 'all' | 'people' | 'families'
  onOpenPerson: (person: DirectoryPerson) => void
  onOpenFamily: (family: DirectoryFamily) => void
}

type Tab = 'all' | 'people' | 'families'
type PeoplePage = { rows: DirectoryPerson[]; count: number | null; hasMore: boolean }
type FamilyPage = { rows: DirectoryFamily[]; count: number | null; hasMore: boolean }

const PAGE_SIZE = 8
const CACHE_TTL = 45_000
const peopleCache = new Map<string, PeoplePage & { savedAt: number }>()
const familyCache = new Map<string, FamilyPage & { savedAt: number }>()

function familyName(value: RelatedFamily): string {
  if (!value) return ''
  if (Array.isArray(value)) return value[0]?.name ?? ''
  return value.name ?? ''
}

function personFamily(item: DirectoryPerson) {
  return item.family_name || familyName(item.families) || 'العائلة غير محددة'
}

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

function PersonCard({ item, onOpen }: { item: DirectoryPerson; onOpen: (item: DirectoryPerson) => void }) {
  return (
    <button className="directory-person-card" type="button" onClick={() => onOpen(item)}>
      <span className={`directory-avatar ${item.gender === 'female' ? 'female' : ''}`}>{item.full_name.trim().charAt(0) || '؟'}</span>
      <span className="directory-card-copy">
        <span className="verified-name-line"><strong>{item.full_name}</strong>{item.is_verified && <VerifiedBadge compact />}</span>
        <small>{personFamily(item)}{item.birth_year ? ` · ${item.birth_year}` : ''}{item.is_deceased ? ' · متوفى' : ''}</small>
      </span>
      <span className="directory-arrow" aria-hidden="true">‹</span>
    </button>
  )
}

function FamilyCard({ item, onOpen }: { item: DirectoryFamily; onOpen: (item: DirectoryFamily) => void }) {
  return (
    <button className="directory-family-card" type="button" onClick={() => onOpen(item)}>
      <span className="directory-family-mark">{item.name.trim().charAt(0) || 'ع'}</span>
      <span className="directory-card-copy"><strong>{item.name}</strong><small>{item.origin_place || item.description || 'عائلة معتمدة'}</small></span>
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
    const smart = await supabase.rpc('search_directory_people', {
      p_query: normalizedTerm,
      p_limit: PAGE_SIZE + 1,
      p_offset: from,
    })
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

  const result = await query
    .order(normalizedTerm ? 'full_name' : 'created_at', { ascending: Boolean(normalizedTerm) })
    .range(from, to)

  if (result.error) {
    const fallbackQuery = supabase
      .from('people')
      .select('id,full_name,gender,birth_year,is_deceased,death_date,description,status,family_id,created_by,created_at,families(name)', { count: 'planned' })
      .eq('status', 'approved')
    const fallback = normalizedTerm ? fallbackQuery.ilike('full_name', `%${normalizedTerm}%`) : fallbackQuery
    const fallbackResult = await fallback
      .order(normalizedTerm ? 'full_name' : 'created_at', { ascending: Boolean(normalizedTerm) })
      .range(from, to)
    if (fallbackResult.error) throw fallbackResult.error
    const received = (fallbackResult.data ?? []).map((item) => normalizePerson(item as unknown as Record<string, unknown>))
    const value: PeoplePage = {
      rows: received.slice(0, PAGE_SIZE),
      count: fallbackResult.count ?? null,
      hasMore: hasNextPage(received.length, fallbackResult.count ?? null, from),
    }
    peopleCache.set(key, { ...value, savedAt: Date.now() })
    return value
  }

  const received = (result.data ?? []).map((item) => normalizePerson(item as unknown as Record<string, unknown>))
  const value: PeoplePage = {
    rows: received.slice(0, PAGE_SIZE),
    count: result.count ?? null,
    hasMore: hasNextPage(received.length, result.count ?? null, from),
  }
  peopleCache.set(key, { ...value, savedAt: Date.now() })
  return value
}

async function fetchFamilyPage(page: number, queryTerm: string): Promise<FamilyPage> {
  if (!supabase) return { rows: [], count: null, hasMore: false }
  const key = cacheKey(queryTerm, page)
  const cached = familyCache.get(key)
  if (cached && Date.now() - cached.savedAt < CACHE_TTL) return cached

  const from = page * PAGE_SIZE
  const normalizedTerm = queryTerm.trim()

  if (normalizedTerm) {
    const smart = await supabase.rpc('search_directory_families', {
      p_query: normalizedTerm,
      p_limit: PAGE_SIZE + 1,
      p_offset: from,
    })
    if (!smart.error) {
      const received = (smart.data ?? []) as DirectoryFamily[]
      const value: FamilyPage = { rows: received.slice(0, PAGE_SIZE), count: null, hasMore: received.length > PAGE_SIZE }
      familyCache.set(key, { ...value, savedAt: Date.now() })
      return value
    }
  }

  // Fetch one extra row. The ninth row is used only to determine whether
  // another page exists, then only eight rows are rendered to the user.
  const to = from + PAGE_SIZE
  let query = supabase
    .from('families')
    .select('id,name,description,origin_place,status,created_by,created_at', { count: 'planned' })
    .eq('status', 'approved')

  if (normalizedTerm) query = query.ilike('name', `%${normalizedTerm}%`)

  const result = await query
    .order(normalizedTerm ? 'name' : 'created_at', { ascending: Boolean(normalizedTerm) })
    .range(from, to)

  if (result.error) throw result.error

  const received = (result.data ?? []) as DirectoryFamily[]
  const value: FamilyPage = {
    rows: received.slice(0, PAGE_SIZE),
    count: result.count ?? null,
    hasMore: hasNextPage(received.length, result.count ?? null, from),
  }
  familyCache.set(key, { ...value, savedAt: Date.now() })
  return value
}

export default function DirectoryScreen({ initialTerm = '', initialTab = 'all', onOpenPerson, onOpenFamily }: Props) {
  const [term, setTerm] = useState(initialTerm)
  const [submittedTerm, setSubmittedTerm] = useState(initialTerm.trim())
  const [tab, setTab] = useState<Tab>(initialTab)
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
  const requestRef = useRef(0)
  const debounceRef = useRef<number | null>(null)

  const reload = useCallback(async (queryTerm: string) => {
    if (!supabase) return
    const requestId = ++requestRef.current
    setLoading(true)
    setError('')
    try {
      const [peopleResult, familyResult] = await Promise.all([
        fetchPeoplePage(0, queryTerm),
        fetchFamilyPage(0, queryTerm),
      ])
      if (requestId !== requestRef.current) return
      setPeople(peopleResult.rows)
      setPeopleCount(peopleResult.count)
      setPeopleHasMore(peopleResult.hasMore)
      setPeoplePage(0)
      setFamilies(familyResult.rows)
      setFamilyCount(familyResult.count)
      setFamilyHasMore(familyResult.hasMore)
      setFamilyPage(0)
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

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  useEffect(() => () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
  }, [])

  function updateTerm(value: string) {
    setTerm(value)
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    const normalized = value.trim()
    if (normalized.length === 1) return
    debounceRef.current = window.setTimeout(() => {
      setSubmittedTerm(normalized)
      void reload(normalized)
    }, 360)
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
        const nextPage = familyPage + 1
        const result = await fetchFamilyPage(nextPage, submittedTerm)
        setFamilies((current) => [...current, ...result.rows.filter((row) => !current.some((old) => old.id === row.id))])
        setFamilyCount(result.count)
        setFamilyHasMore(result.hasMore)
        setFamilyPage(nextPage)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل المزيد.')
    } finally {
      setLoadingMore(null)
    }
  }

  const showPeople = tab === 'all' || tab === 'people'
  const showFamilies = tab === 'all' || tab === 'families'
  const waitingForSecondCharacter = term.trim().length === 1
  const canLoadMoreFamilies = familyHasMore || (familyCount != null && families.length < familyCount)

  return (
    <section className="directory-v2-page">
      <div className="directory-v2-hero">
        <div className="directory-v2-heading">
          <span className="directory-kicker">دليل صلة</span>
          <h1>اعثر على الشخص أو العائلة بسرعة</h1>
          <p>بحث عربي ذكي يتجاهل الهمزات واختلاف التاء المربوطة، مع تحميل تدريجي مناسب للجوال.</p>
        </div>
        <form className="directory-search-box" onSubmit={submit} role="search">
          <span className="directory-search-icon" aria-hidden="true">⌕</span>
          <input value={term} onChange={(event) => updateTerm(event.target.value)} placeholder="ابحث بالاسم…" autoComplete="off" enterKeyHint="search" aria-label="البحث في دليل الأشخاص والعائلات" />
          {term && <button className="directory-clear" type="button" onClick={clearSearch} aria-label="مسح البحث">×</button>}
          <button className="directory-search-submit" type="submit" disabled={waitingForSecondCharacter}>بحث</button>
        </form>
        {waitingForSecondCharacter && <div className="directory-search-tip">اكتب حرفًا ثانيًا لبدء البحث السريع.</div>}
        <div className="directory-tabs" role="tablist" aria-label="نوع النتائج">
          <button className={tab === 'all' ? 'active' : ''} type="button" onClick={() => setTab('all')}>الكل</button>
          <button className={tab === 'people' ? 'active' : ''} type="button" onClick={() => setTab('people')}>الأشخاص {peopleCount != null && <b title="عدد تقديري سريع">≈{peopleCount}</b>}</button>
          <button className={tab === 'families' ? 'active' : ''} type="button" onClick={() => setTab('families')}>العائلات {familyCount != null && <b title="عدد تقديري سريع">≈{familyCount}</b>}</button>
        </div>
      </div>

      {error && <div className="directory-inline-error" role="alert">{error}</div>}
      {loading ? (
        <div className="directory-skeleton-list" aria-label="جارٍ تحميل الدليل">
          {Array.from({ length: 5 }).map((_, index) => <span key={index} />)}
        </div>
      ) : (
        <div className="directory-result-stack" aria-live="polite">
          {showPeople && (
            <section className="directory-result-section">
              <header>
                <div><span>الأفراد</span><h2>{submittedTerm ? `نتائج «${submittedTerm}»` : 'أحدث الأفراد المعتمدين'}</h2></div>
                {peopleCount != null && <strong title="عدد تقديري سريع">≈{peopleCount}</strong>}
              </header>
              {people.length ? <div className="directory-person-list">{people.map((item) => <PersonCard key={item.id} item={item} onOpen={onOpenPerson} />)}</div> : <div className="directory-empty">لا توجد نتائج أشخاص مطابقة.</div>}
              {peopleHasMore && <button className="directory-more" type="button" disabled={loadingMore === 'people'} onClick={() => void loadMore('people')}>{loadingMore === 'people' ? 'جارٍ التحميل…' : 'عرض 8 أشخاص إضافيين'}</button>}
            </section>
          )}

          {showFamilies && (
            <section className="directory-result-section family-results">
              <header>
                <div><span>العائلات</span><h2>{submittedTerm ? 'العائلات المطابقة' : 'العائلات المعتمدة'}</h2></div>
                {familyCount != null && <strong title="عدد تقديري سريع">≈{familyCount}</strong>}
              </header>
              {families.length ? <div className="directory-family-grid">{families.map((item) => <FamilyCard key={item.id} item={item} onOpen={onOpenFamily} />)}</div> : <div className="directory-empty">لا توجد عائلات مطابقة.</div>}
              {canLoadMoreFamilies && (
                <button className="directory-more" type="button" disabled={loadingMore === 'families'} onClick={() => void loadMore('families')}>
                  {loadingMore === 'families' ? 'جارٍ تحميل المزيد…' : 'عرض 8 عائلات إضافية'}
                </button>
              )}
            </section>
          )}
        </div>
      )}
    </section>
  )
}
