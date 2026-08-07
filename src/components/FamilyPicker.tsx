import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

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
const cache = new Map<string, { at: number; rows: FamilyOption[] }>()

export default function FamilyPicker({ label, value, onChange, required = false, emptyLabel = 'بدون عائلة محددة', approvedOnly = false }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<FamilyOption | null>(null)
  const [results, setResults] = useState<FamilyOption[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const timerRef = useRef<number | null>(null)
  const requestRef = useRef(0)

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
    const key = `${approvedOnly ? 'approved' : 'visible'}:${term.toLocaleLowerCase('ar') || '__recent__'}`
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
      let request = supabase
        .from('families')
        .select('id,name,origin_place,status')
      request = approvedOnly ? request.eq('status', 'approved') : request.in('status', ['approved', 'pending'])
      if (term) request = request.ilike('name', `%${term}%`)
      const { data } = await request.order(term ? 'name' : 'created_at', { ascending: Boolean(term) }).limit(7)
      if (requestId !== requestRef.current) return
      const rows = (data ?? []) as FamilyOption[]
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
    setSelected(family)
    onChange(family.id)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  function clear() {
    setSelected(null)
    onChange('')
    setQuery('')
    setResults([])
    setOpen(false)
  }

  return (
    <label className="family-picker-label">
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
              required={required && !value}
            />
            {!required && <button className="family-picker-empty" type="button" onClick={clear}>{emptyLabel}</button>}
          </div>
        )}

        {open && !selected && (
          <div className="family-picker-menu">
            {loading ? <div className="family-picker-state">جارٍ البحث…</div> : results.length ? results.map((family) => (
              <button type="button" key={family.id} onClick={() => choose(family)}>
                <span className="family-picker-mark">{family.name.trim().charAt(0) || 'ع'}</span>
                <span><strong>{family.name}</strong><small>{family.origin_place || (family.status === 'pending' ? 'بانتظار الاعتماد' : 'عائلة معتمدة')}</small></span>
                {family.status === 'pending' && <i>معلقة</i>}
              </button>
            )) : <div className="family-picker-state">لا توجد عائلة مطابقة.</div>}
          </div>
        )}
      </div>
    </label>
  )
}
