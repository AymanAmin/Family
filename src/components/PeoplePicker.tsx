import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type PersonOption = {
  id: string
  full_name: string
  gender: string | null
  birth_year: number | null
}

type Props = {
  label: string
  value: string
  onChange: (personId: string) => void
  excludeId?: string
  required?: boolean
}

const SEARCH_DELAY = 320
const CACHE_TTL = 60_000
const resultCache = new Map<string, { savedAt: number; rows: PersonOption[] }>()

function cacheKey(query: string, excludeId?: string) {
  return `${query.trim().toLocaleLowerCase('ar')}::${excludeId ?? ''}`
}

export default function PeoplePicker({ label, value, onChange, excludeId, required = false }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<PersonOption | null>(null)
  const [results, setResults] = useState<PersonOption[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const timerRef = useRef<number | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    if (!supabase || !value) {
      if (!value) setSelected(null)
      return
    }
    if (selected?.id === value) return

    const requestId = ++requestRef.current
    void supabase
      .from('people')
      .select('id,full_name,gender,birth_year')
      .eq('id', value)
      .eq('status', 'approved')
      .maybeSingle()
      .then(({ data }) => {
        if (requestId !== requestRef.current) return
        setSelected((data as PersonOption | null) ?? null)
      })
  }, [value, selected?.id])

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    requestRef.current += 1
  }, [])

  function search(valueText: string) {
    setQuery(valueText)
    setOpen(true)
    if (timerRef.current) window.clearTimeout(timerRef.current)

    const normalized = valueText.trim()
    if (normalized.length < 2) {
      requestRef.current += 1
      setResults([])
      setLoading(false)
      return
    }

    const key = cacheKey(normalized, excludeId)
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

      let request = supabase
        .from('people')
        .select('id,full_name,gender,birth_year')
        .eq('status', 'approved')
        .ilike('full_name', `%${normalized}%`)
        .order('full_name')
        .limit(6)
      if (excludeId) request = request.neq('id', excludeId)

      const { data, error } = await request
      if (requestId !== requestRef.current) return
      const rows = error ? [] : (data ?? []) as PersonOption[]
      if (!error) resultCache.set(key, { savedAt: Date.now(), rows })
      setResults(rows)
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

  return (
    <label className="people-picker-label">
      <span>{label}{required ? ' *' : ''}</span>
      <div className={`people-picker ${open ? 'open' : ''}`}>
        {selected ? (
          <div className="people-picker-selected">
            <span className="people-picker-avatar">{selected.full_name.charAt(0)}</span>
            <span><strong>{selected.full_name}</strong><small>{selected.gender === 'female' ? 'أنثى' : selected.gender === 'male' ? 'ذكر' : 'غير محدد'}{selected.birth_year ? ` · ${selected.birth_year}` : ''}</small></span>
            <button type="button" onClick={clear} aria-label="إزالة الاختيار">×</button>
          </div>
        ) : (
          <input
            value={query}
            onChange={(event) => search(event.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="اكتب حرفين على الأقل للبحث"
            autoComplete="off"
            enterKeyHint="search"
            required={required && !value}
          />
        )}

        {open && !selected && (
          <div className="people-picker-menu" aria-live="polite">
            {loading ? <div className="people-picker-state">جارٍ البحث…</div> : query.trim().length < 2 ? <div className="people-picker-state">ابدأ بكتابة حرفين من الاسم.</div> : results.length ? results.map((person) => (
              <button type="button" key={person.id} onClick={() => choose(person)}>
                <span className="people-picker-avatar">{person.full_name.charAt(0)}</span>
                <span><strong>{person.full_name}</strong><small>{person.birth_year || 'سنة الميلاد غير محددة'}</small></span>
              </button>
            )) : <div className="people-picker-state">لا توجد نتيجة مطابقة.</div>}
          </div>
        )}
      </div>
    </label>
  )
}
