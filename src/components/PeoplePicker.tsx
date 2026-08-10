import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeArabicSearch } from '../lib/arabicSearch'
import VerifiedBadge from './VerifiedBadge'
import '../people-picker-scroll.css'

type PersonOption = {
  id: string
  full_name: string
  gender: string | null
  birth_year: number | null
  is_verified?: boolean
}

type SearchMode = 'prefix' | 'broad'
type GenderFilter = 'male' | 'female'

type Props = {
  label: string
  value: string
  onChange: (personId: string) => void
  excludeId?: string
  required?: boolean
  searchMode?: SearchMode
  genderFilter?: GenderFilter
}

const SEARCH_DELAY = 320
const CACHE_TTL = 60_000
const TOUCH_SCROLL_THRESHOLD = 7
const TOUCH_CLICK_SUPPRESS_MS = 420
const resultCache = new Map<string, { savedAt: number; rows: PersonOption[] }>()

function cacheKey(query: string, excludeId: string | undefined, searchMode: SearchMode, genderFilter: GenderFilter | undefined) {
  return `${searchMode}::${genderFilter ?? 'any'}::${normalizeArabicSearch(query)}::${excludeId ?? ''}`
}

export default function PeoplePicker({ label, value, onChange, excludeId, required = false, searchMode = 'prefix', genderFilter }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<PersonOption | null>(null)
  const [results, setResults] = useState<PersonOption[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const requestRef = useRef(0)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressSelectionUntilRef = useRef(0)

  useEffect(() => {
    if (!supabase || !value) {
      if (!value) setSelected(null)
      return
    }
    if (selected?.id === value) return

    const requestId = ++requestRef.current
    let selectedQuery = supabase
      .from('people')
      .select('id,full_name,gender,birth_year,is_verified')
      .eq('id', value)
      .eq('status', 'approved')
    if (genderFilter) selectedQuery = selectedQuery.eq('gender', genderFilter)
    void selectedQuery
      .maybeSingle()
      .then(({ data }) => {
        if (requestId !== requestRef.current) return
        setSelected((data as PersonOption | null) ?? null)
      })
  }, [value, selected?.id, genderFilter])

  useEffect(() => {
    function closeWhenClickingOutside(event: PointerEvent) {
      const target = event.target as Node | null
      if (target && rootRef.current && !rootRef.current.contains(target)) setOpen(false)
    }

    document.addEventListener('pointerdown', closeWhenClickingOutside)
    return () => document.removeEventListener('pointerdown', closeWhenClickingOutside)
  }, [])

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    requestRef.current += 1
  }, [])

  function search(valueText: string) {
    setQuery(valueText)
    setOpen(true)
    if (timerRef.current) window.clearTimeout(timerRef.current)

    const normalized = normalizeArabicSearch(valueText)
    if (normalized.length < 2) {
      requestRef.current += 1
      setResults([])
      setLoading(false)
      return
    }

    const key = cacheKey(normalized, excludeId, searchMode, genderFilter)
    const cached = resultCache.get(key)
    if (cached && Date.now() - cached.savedAt < CACHE_TTL) {
      setResults(cached.rows)
      setLoading(false)
      return
    }

    timerRef.current = window.setTimeout(async () => {
      if (!supabase) return
      const requestId = ++requestRef.current
      setLoading(true)

      const smart = await supabase.rpc('search_people_names_v2', {
        p_query: valueText.trim(),
        p_limit: 20,
        p_exclude_id: excludeId || null,
        p_gender: genderFilter || null,
        p_prefix: searchMode === 'prefix',
      })
      if (requestId !== requestRef.current) return

      if (!smart.error) {
        const rows = (smart.data ?? []) as PersonOption[]
        resultCache.set(key, { savedAt: Date.now(), rows })
        setResults(rows)
        setLoading(false)
        return
      }

      // Compatibility fallback for deployments that have not received the v2 RPC yet.
      const fallback = await supabase.rpc('search_people_names', {
        p_query: valueText.trim(),
        p_limit: 24,
        p_exclude_id: excludeId || null,
      })
      if (requestId !== requestRef.current) return

      const fallbackRows = ((fallback.data ?? []) as PersonOption[])
        .filter((person) => !genderFilter || person.gender === genderFilter)
        .filter((person) => searchMode !== 'prefix' || normalizeArabicSearch(person.full_name).startsWith(normalized))
        .slice(0, 20)
      resultCache.set(key, { savedAt: Date.now(), rows: fallbackRows })
      setResults(fallbackRows)
      setLoading(false)
    }, SEARCH_DELAY)
  }

  function choose(person: PersonOption) {
    requestRef.current += 1
    setSelected(person)
    onChange(person.id)
    setQuery('')
    setOpen(false)
    setResults([])
    setLoading(false)
  }

  function clear() {
    requestRef.current += 1
    setSelected(null)
    onChange('')
    setQuery('')
    setResults([])
    setOpen(false)
    setLoading(false)
  }

  function onListTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    const touch = event.touches[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    suppressSelectionUntilRef.current = 0
  }

  function onListTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current
    const touch = event.touches[0]
    if (!start || !touch) return
    if (Math.abs(touch.clientY - start.y) >= TOUCH_SCROLL_THRESHOLD || Math.abs(touch.clientX - start.x) >= TOUCH_SCROLL_THRESHOLD) {
      suppressSelectionUntilRef.current = Date.now() + TOUCH_CLICK_SUPPRESS_MS
    }
  }

  function onListTouchEnd() {
    touchStartRef.current = null
  }

  function chooseFromClick(event: ReactMouseEvent<HTMLButtonElement>, person: PersonOption) {
    if (Date.now() < suppressSelectionUntilRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    choose(person)
  }

  return (
    <div className="people-picker-label" ref={rootRef}>
      <span>{label}{required ? ' *' : ''}</span>
      <div className={`people-picker ${open ? 'open' : ''}`}>
        {selected ? (
          <div className="people-picker-selected">
            <span className="people-picker-avatar">{selected.full_name.charAt(0)}</span>
            <span><span className="verified-name-line"><strong>{selected.full_name}</strong>{selected.is_verified && <VerifiedBadge compact />}</span><small>{selected.gender === 'female' ? 'أنثى' : selected.gender === 'male' ? 'ذكر' : 'غير محدد'}{selected.birth_year ? ` · ${selected.birth_year}` : ''}</small></span>
            <button type="button" onClick={clear} aria-label="إزالة الاختيار">×</button>
          </div>
        ) : (
          <input
            value={query}
            onChange={(event) => search(event.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setOpen(false)
                event.currentTarget.blur()
              } else if (event.key === 'Tab') {
                setOpen(false)
              }
            }}
            placeholder={searchMode === 'prefix' ? 'اكتب بداية الاسم — حرفين على الأقل' : 'اكتب حرفين على الأقل للبحث'}
            autoComplete="off"
            enterKeyHint="search"
            aria-label={label}
            required={required && !value}
          />
        )}

        {open && !selected && (
          <div
            className="people-picker-menu picker-touch-scroll-list"
            aria-live="polite"
            onTouchStart={onListTouchStart}
            onTouchMove={onListTouchMove}
            onTouchEnd={onListTouchEnd}
            onTouchCancel={onListTouchEnd}
          >
            {loading ? <div className="people-picker-state">جارٍ البحث…</div> : normalizeArabicSearch(query).length < 2 ? <div className="people-picker-state">ابدأ بكتابة حرفين من الاسم.</div> : results.length ? results.map((person) => (
              <button
                type="button"
                key={person.id}
                onClick={(event) => chooseFromClick(event, person)}
              >
                <span className="people-picker-avatar">{person.full_name.charAt(0)}</span>
                <span><span className="verified-name-line"><strong>{person.full_name}</strong>{person.is_verified && <VerifiedBadge compact />}</span><small>{person.birth_year || 'سنة الميلاد غير محددة'}</small></span>
              </button>
            )) : <div className="people-picker-state">لا توجد نتيجة مطابقة لهذا الاسم.</div>}
          </div>
        )}
      </div>
    </div>
  )
}
