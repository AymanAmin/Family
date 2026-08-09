import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeArabicSearch } from '../lib/arabicSearch'

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
  return normalizeArabicSearch(value)
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

      // The server applies the same Arabic normalization used by the directory,
      // including hamza variants and ة/ه, before doing a prefix match.
      const smart = await supabase.rpc('find_similar_people', { p_query: query, p_limit: 20 })
      if (requestId !== requestRef.current) return

      if (!smart.error) {
        const result = ((smart.data ?? []) as SimilarPerson[])
          .filter((person) => normalizedKey(person.full_name).startsWith(key))
          .slice(0, 6)
        cache.set(key, { savedAt: Date.now(), rows: result })
        setRows(result)
        setAvailable(true)
        setLoading(false)
        return
      }

      setRows([])
      setAvailable(false)
      setLoading(false)
    }, SEARCH_DELAY)

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [name])

  if (!hasCompletedFirstName(name)) {
    return <div className="duplicate-person-hint"><span>⌕</span><p>بعد كتابة الاسم الأول ثم مسافة، سنبحث تلقائيًا عن أشخاص تبدأ أسماؤهم بما كتبته لتجنب التكرار.</p></div>
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
        <div className="duplicate-clear-state"><span>✓</span><p><strong>لا يظهر سجل يبدأ بهذا الاسم حاليًا.</strong><small>يمكنك متابعة إدخال بقية البيانات.</small></p></div>
      )}

      {!available && <p className="duplicate-migration-note">تعذر تشغيل البحث الذكي حاليًا. أعد تحميل الصفحة بعد اكتمال تحديث النظام.</p>}
    </section>
  )
}
