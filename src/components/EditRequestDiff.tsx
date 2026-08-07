import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Details = {
  request_id: string
  entity_type: string
  record_id: string
  requester_name: string
  created_at: string
  current_data: Record<string, unknown>
  proposed_data: Record<string, unknown>
}

type Props = {
  requestId: string
  open: boolean
}

const fieldLabels: Record<string, string> = {
  name: 'اسم العائلة',
  origin_place: 'مكان الأصل',
  description: 'النبذة / الوصف',
  full_name: 'الاسم الكامل',
  gender: 'الجنس',
  birth_year: 'سنة الميلاد',
  is_deceased: 'حالة الوفاة',
  death_date: 'تاريخ الوفاة',
  family_id: 'العائلة الأساسية',
  family_name: 'العائلة الأساسية',
  event_type: 'نوع المناسبة',
  title: 'العنوان',
  event_date: 'التاريخ',
  location_name: 'المكان',
  relation_type: 'نوع صلة القرابة',
  notes: 'الملاحظة / المصدر',
}

const relationLabels: Record<string, string> = {
  parent: 'والد أو والدة',
  child: 'ابن أو ابنة',
  spouse: 'زوج أو زوجة',
  sibling: 'أخ أو أخت',
  guardian: 'ولي أو وصي',
  other: 'صلة أخرى',
}

const eventLabels: Record<string, string> = {
  death: 'وفاة وعزاء', wedding: 'زواج', birth: 'مولود', naming: 'سماية', graduation: 'تخرج ونجاح', general: 'مناسبة عامة', other: 'أخرى',
}

function valueText(key: string, value: unknown, companion?: Record<string, unknown>) {
  if (key === 'family_id') return String(companion?.family_name ?? 'بدون عائلة محددة')
  if (key === 'gender') return value === 'female' ? 'أنثى' : value === 'male' ? 'ذكر' : 'غير محدد'
  if (key === 'is_deceased') return value === true || value === 'true' ? 'متوفى' : 'على قيد الحياة'
  if (key === 'relation_type') return relationLabels[String(value ?? '')] || String(value ?? 'غير محدد')
  if (key === 'event_type') return eventLabels[String(value ?? '')] || String(value ?? 'غير محدد')
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا'
  return String(value)
}

export default function EditRequestDiff({ requestId, open }: Props) {
  const [details, setDetails] = useState<Details | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || details || !supabase) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      const { data, error } = await supabase.rpc('get_edit_request_review_details', { p_request_id: requestId })
      if (cancelled) return
      setLoading(false)
      if (error) {
        setError(error.message.toLowerCase().includes('does not exist') ? 'شغّل migration رقم 021 لتفعيل مقارنة التعديلات.' : error.message)
        return
      }
      const row = Array.isArray(data) ? data[0] : null
      setDetails((row as Details | undefined) ?? null)
    }
    void load()
    return () => { cancelled = true }
  }, [open, requestId, details])

  const changedKeys = useMemo(() => {
    if (!details) return []
    return Object.keys(details.proposed_data).filter((key) => key !== 'family_name')
  }, [details])

  if (!open) return null
  if (loading) return <div className="edit-diff-loading"><i /><span>جارٍ تحميل المقارنة…</span></div>
  if (error) return <div className="edit-diff-error">{error}</div>
  if (!details) return <div className="edit-diff-error">تعذر العثور على تفاصيل الطلب.</div>

  return (
    <section className="edit-request-diff">
      <header><div><span>مقدم الطلب</span><strong>{details.requester_name}</strong></div><small>{new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date(details.created_at))}</small></header>
      <div className="edit-diff-columns"><span>الحقل</span><span>الحالي</span><span>المقترح</span></div>
      <div className="edit-diff-rows">
        {changedKeys.map((key) => {
          const current = key === 'family_id' ? details.current_data.family_id : details.current_data[key]
          const proposed = details.proposed_data[key]
          return <div className="edit-diff-row" key={key}><strong>{fieldLabels[key] || key}</strong><span>{valueText(key, current, details.current_data)}</span><span className="proposed">{valueText(key, proposed, details.proposed_data)}</span></div>
        })}
      </div>
    </section>
  )
}
