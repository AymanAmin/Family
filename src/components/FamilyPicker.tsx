import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeArabicSearch } from '../lib/arabicSearch'
import '../people-picker-scroll.css'

type FamilyOption = {
  id: string
  name: string
  origin_place: string | null
  status: 'approved' | 'pending' | 'rejected'
}

type Props = {
  label: string
  value: string
  onChange: (familyId: string) => void
  required?: boolean
  emptyLabel?: string
  approvedOnly?: boolean
}

const CACHE_TTL = 60_000
const TOUCH_SCROLL_THRESHOLD = 7
const TOUCH_CLICK_SUPPRESS_MS = 420
const cache = new Map<string, { at: number; rows: FamilyOption[] }>()

export default function FamilyPicker({ label, value, onChange, required = false, emptyLabel = 'بدون عائلة محددة', approvedOnly = false }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<FamilyOption | null>(null)
  const [results, setResults] = useState<FamilyOption[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const timerRef = useRef<number | null>(null)
  const requestRef = useRef(0)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressSelectionUntilRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    async function loadSelected() {
      if (!supabase || !value) {
        if (!value) setSelected(null)
        return
      }
      if (selected?.id === value) return
      let request = supabase.from('families').select('id,name,origin_place,status').eq('id', value)
      if (approvedOnly) request = request.eq('status', 'approved')
      const { data } = await request.maybeSingle()
      if (!cancelled) setSelected((data as FamilyOption | null) ?? null)
    }
    void loadSelected()
    return () => { cancelled = true }
  }, [value, selected?.id, approvedOnly])

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
  }, [])

  async function runSearch(raw: string, immediate = false) {
    const term = raw.trim().replace(/\s+/g, ' ')
    const normalizedTerm = normalizeArabicSearch(term)
    const key = `${approvedOnly ? 'approved' : 'visible'}:${normalizedTerm || '__recent__'}`
    const cached = cache.get(key)
    if (cached && Date.now() - cached.at < CACHE_TTL) {
      setResults(cached.rows)
      setLoading(false)
      return
    }

    const execute = async () => {
      if (!supabase) return
      const requestId = ++requestRef.current
      setLoading(true)
      const { data, error } = await supabase.rpc('search_legacy_families_v1', {
        p_query: term || null,
        p_approved_only: approvedOnly,
        p_limit: 20,
      })
      if (requestId !== requestRef.current) return

      if (!error) {
        const rows = (data ?? []) as FamilyOption[]
        cache.set(key, { at: Date.now(), rows })
        setResults(rows)
        setLoading(false)
        return
      }

      // Compatibility fallback: load a bounded visible set, then compare with the
      // same Arabic normalizer used by the rest of the client.
      let request = supabase.from('families').select('id,name,origin_place,status')
      request = approvedOnly ? request.eq('status', 'approved') : request.in('status', ['approved', 'pending'])
      const fallback = await request.order('created_at', { ascending: false }).limit(140)
      if (requestId !== requestRef.current) return
      const rows = ((fallback.data ?? []) as FamilyOption[])
        .filter((family) => !normalizedTerm || normalizeArabicSearch(family.name).includes(normalizedTerm))
        .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
        .slice(0, 20)
      cache.set(key, { at: Date.now(), rows })
      setResults(rows)
      setLoading(false)
    }

    if (immediate) {
      await execute()
      return
    }
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout((): void => {
      void execute()
    }, 260)
  }

  function handleQuery(valueText: string) {
    setQuery(valueText)
    setOpen(true)
    void runSearch(valueText)
  }

  function choose(family: FamilyOption) {
    requestRef.current += 1
    setSelected(family)
    onChange(family.id)
    setQuery('')
    setResults([])
    setOpen(false)
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

  function chooseFromClick(event: ReactMouseEvent<HTMLButtonElement>, family: FamilyOption) {
    if (Date.now() < suppressSelectionUntilRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    choose(family)
  }

  return (
    <div className="family-picker-label">
      <span>{label}{required ? ' *' : ''}</span>
      <div className={`family-picker ${open ? 'open' : ''}`}>
        {selected ? (
          <div className="family-picker-selected">
            <span className="family-picker-mark">{selected.name.trim().charAt(0) || 'ع'}</span>
            <span><strong>{selected.name}</strong><small>{selected.origin_place || (selected.status === 'pending' ? 'بانتظار الاعتماد' : 'عائلة معتمدة')}</small></span>
            <button type="button" onClick={clear} aria-label="إزالة اختيار العائلة">×</button>
          </div>
        ) : (
          <div className="family-picker-input-wrap">
            <input
              value={query}
              onChange={(event) => handleQuery(event.target.value)}
              onFocus={() => { setOpen(true); if (!results.length) void runSearch(query, true) }}
              placeholder={approvedOnly ? 'ابحث في العائلات المعتمدة' : 'اكتب اسم العائلة للبحث'}
              autoComplete="off"
              aria-label={label}
              required={required && !value}
            />
            {!required && <button className="family-picker-empty" type="button" onClick={clear}>{emptyLabel}</button>}
          </div>
        )}

        {open && !selected && (
          <div
            className="family-picker-menu picker-touch-scroll-list"
            onTouchStart={onListTouchStart}
            onTouchMove={onListTouchMove}
            onTouchEnd={onListTouchEnd}
            onTouchCancel={onListTouchEnd}
          >
            {loading ? <div className="family-picker-state">جارٍ البحث…</div> : results.length ? results.map((family) => (
              <button
                type="button"
                key={family.id}
                onClick={(event) => chooseFromClick(event, family)}
              >
                <span className="family-picker-mark">{family.name.trim().charAt(0) || 'ع'}</span>
                <span><strong>{family.name}</strong><small>{family.origin_place || (family.status === 'pending' ? 'بانتظار الاعتماد' : 'عائلة معتمدة')}</small></span>
                {family.status === 'pending' && <i>معلقة</i>}
              </button>
            )) : <div className="family-picker-state">لا توجد عائلة مطابقة.</div>}
          </div>
        )}
      </div>
    </div>
  )
}
