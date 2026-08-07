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

export default function PeoplePicker({ label, value, onChange, excludeId, required = false }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<PersonOption | null>(null)
  const [results, setResults] = useState<PersonOption[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!supabase || !value) {
      if (!value) setSelected(null)
      return
    }
    if (selected?.id === value) return
    void supabase
      .from('people')
      .select('id,full_name,gender,birth_year')
      .eq('id', value)
      .eq('status', 'approved')
      .maybeSingle()
      .then(({ data }) => setSelected((data as PersonOption | null) ?? null))
  }, [value, selected?.id])

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
  }, [])

  function search(valueText: string) {
    setQuery(valueText)
    setOpen(true)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    if (valueText.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    timerRef.current = window.setTimeout(async () => {
      if (!supabase) return
      setLoading(true)
      let request = supabase
        .from('people')
        .select('id,full_name,gender,birth_year')
        .eq('status', 'approved')
        .ilike('full_name', `%${valueText.trim()}%`)
        .order('full_name')
        .limit(7)
      if (excludeId) request = request.neq('id', excludeId)
      const { data } = await request
      setResults((data ?? []) as PersonOption[])
      setLoading(false)
    }, 260)
  }

  function choose(person: PersonOption) {
    setSelected(person)
    onChange(person.id)
    setQuery('')
    setOpen(false)
    setResults([])
  }

  function clear() {
    setSelected(null)
    onChange('')
    setQuery('')
    setResults([])
    setOpen(false)
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
            required={required && !value}
          />
        )}

        {open && !selected && (
          <div className="people-picker-menu">
            {loading ? <div className="people-picker-state">جارٍ البحث…</div> : query.trim().length < 2 ? <div className="people-picker-state">ابدأ بكتابة الاسم.</div> : results.length ? results.map((person) => (
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
