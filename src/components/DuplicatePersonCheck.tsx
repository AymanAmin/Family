import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type SimilarPerson = {
  id: string
  full_name: string
  gender: string | null
  birth_year: number | null
  family_id: string | null
  family_name: string | null
  status: string
  match_score: number
}

type Props = {
  name: string
  onOpenPerson: (personId: string) => void
}

const SEARCH_DELAY = 320
const CACHE_TTL = 60_000
const cache = new Map<string, { savedAt: number; rows: SimilarPerson[] }>()

function normalizedKey(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ar')
}

function hasCompletedFirstName(value: string) {
  const trimmedStart = value.replace(/^\s+/, '')
  return /\S+\s+/.test(trimmedStart)
}

function scoreLabel(score: number) {
  if (score >= .98) return 'مطابق تقريبًا'
  if (score >= .86) return 'تشابه قوي'
  if (score >= .72) return 'قد يكون نفس الشخص'
  return 'اسم قريب'
}

export default function DuplicatePersonCheck({ name, onOpenPerson }: Props) {
  const [rows, setRows] = useState<SimilarPerson[]>([])
  const [loading, setLoading] = useState(false)
  const [available, setAvailable] = useState(true)
  const timerRef = useRef<number | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current)

    const query = name.trim().replace(/\s+/g, ' ')
    if (!hasCompletedFirstName(name)) {
      requestRef.current += 1
      setRows([])
      setLoading(false)
      return
    }

    const key = normalizedKey(query)
    const cached = cache.get(key)
    if (cached && Date.now() - cached.savedAt < CACHE_TTL) {
      setRows(cached.rows)
      setLoading(false)
      return
    }

    timerRef.current = window.setTimeout(async () => {
      if (!supabase) return
      const requestId = ++requestRef.current
      setLoading(true)

      const smart = await supabase.rpc('find_similar_people', { p_query: query, p_limit: 6 })
      if (requestId !== requestRef.current) return

      if (!smart.error) {
        const result = (smart.data ?? []) as SimilarPerson[]
        cache.set(key, { savedAt: Date.now(), rows: result })
        setRows(result)
        setAvailable(true)
        setLoading(false)
        return
      }

      // Safe fallback before migration 011 is installed: approved people only.
      const fallback = await supabase
        .from('people')
        .select('id,full_name,gender,birth_year,family_id,status,families(name)')
        .eq('status', 'approved')
        .ilike('full_name', `%${query}%`)
        .order('full_name')
        .limit(6)

      if (requestId !== requestRef.current) return
      const mapped: SimilarPerson[] = (fallback.data ?? []).map((item) => {
        const familyValue = item.families as { name?: string } | { name?: string }[] | null
        const familyName = Array.isArray(familyValue) ? familyValue[0]?.name ?? null : familyValue?.name ?? null
        return {
          id: item.id,
          full_name: item.full_name,
          gender: item.gender,
          birth_year: item.birth_year,
          family_id: item.family_id,
          family_name: familyName,
          status: item.status,
          match_score: .65,
        }
      })
      setRows(mapped)
      setAvailable(false)
      setLoading(false)
    }, SEARCH_DELAY)

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [name])

  if (!hasCompletedFirstName(name)) {
    return <div className="duplicate-person-hint"><span>⌕</span><p>بعد كتابة الاسم الأول ثم مسافة، سنبحث تلقائيًا عن أشخاص مشابهين لتجنب التكرار.</p></div>
  }

  return (
    <section className="duplicate-person-check" aria-live="polite">
      <header>
        <div><span className="duplicate-kicker">فحص ذكي قبل الإضافة</span><strong>هل الشخص موجود بالفعل؟</strong></div>
        {loading && <span className="duplicate-loading">جارٍ البحث…</span>}
      </header>

      {!loading && rows.length > 0 && (
        <div className="duplicate-results">
          {rows.map((person) => (
            <button type="button" key={person.id} className="duplicate-result-card" onClick={() => onOpenPerson(person.id)}>
              <span className="duplicate-avatar">{person.full_name.trim().charAt(0) || '؟'}</span>
              <span className="duplicate-copy">
                <strong>{person.full_name}</strong>
                <small>{person.family_name || 'العائلة غير محددة'}{person.birth_year ? ` · ${person.birth_year}` : ''}</small>
              </span>
              <span className={`duplicate-score ${person.match_score >= .86 ? 'strong' : ''}`}>
                <b>{Math.round(person.match_score * 100)}%</b>
                <small>{scoreLabel(person.match_score)}</small>
              </span>
            </button>
          ))}
          <p className="duplicate-warning">راجع النتائج قبل إنشاء سجل جديد. وجود نفس الاسم لا يعني دائمًا أنه نفس الشخص.</p>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="duplicate-clear-state"><span>✓</span><p><strong>لا يظهر سجل مشابه حاليًا.</strong><small>يمكنك متابعة إدخال بقية البيانات.</small></p></div>
      )}

      {!available && <p className="duplicate-migration-note">البحث الأساسي يعمل الآن. تشغيل migration 011 يفعّل تشابه الأسماء العربية المتقدم.</p>}
    </section>
  )
}
