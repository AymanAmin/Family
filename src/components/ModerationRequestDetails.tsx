// Decision context is loaded for every visible moderation card so reviewers can act with full identity and impact context.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './ModerationRequestDetails.css'

type DetailRow = {
  label?: string
  value?: string | number | boolean | null
}

type Requester = {
  id?: string | null
  display_name?: string | null
  email?: string | null
  role?: string | null
  linked_person_id?: string | null
  linked_person_name?: string | null
}

type Subject = {
  type?: string | null
  id?: string | null
  name?: string | null
}

type RequestDetails = {
  request_type?: string
  operation?: string | null
  operation_description?: string | null
  status?: string | null
  created_at?: string | null
  requester?: Requester | null
  subject?: Subject | null
  details?: DetailRow[] | null
  note?: string | null
}

type Props = {
  requestType: string
  requestId: string
}

const roleLabels: Record<string, string> = {
  member: 'عضو',
  verified_member: 'عضو موثّق',
  family_moderator: 'مسؤول عائلة',
  content_moderator: 'مشرف محتوى',
  admin: 'مدير',
  super_admin: 'المدير الأعلى',
}

function valueText(value: DetailRow['value']) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا'
  return String(value)
}

export default function ModerationRequestDetails({ requestType, requestId }: Props) {
  const [data, setData] = useState<RequestDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!supabase) {
        if (!cancelled) {
          setLoading(false)
          setError('تعذر تحميل تفاصيل الطلب.')
        }
        return
      }

      setLoading(true)
      setError('')
      const { data: result, error: requestError } = await supabase.rpc('get_moderation_request_details', {
        p_request_type: requestType,
        p_request_id: requestId,
      })

      if (cancelled) return
      setLoading(false)
      if (requestError) {
        setError(requestError.message.toLowerCase().includes('does not exist') ? 'شغّل آخر تحديث لقاعدة البيانات لإظهار تفاصيل القرار.' : 'تعذر تحميل تفاصيل الطلب الآن.')
        return
      }
      setData((result ?? null) as RequestDetails | null)
    }

    void load()
    return () => { cancelled = true }
  }, [requestId, requestType])

  const requester = data?.requester ?? null
  const subject = data?.subject ?? null
  const detailRows = useMemo(() => (data?.details ?? []).filter((item) => item?.label), [data?.details])
  const accountLinkConflict = requestType === 'account_link_requests'
    && requester?.linked_person_name
    && subject?.name
    && requester.linked_person_name !== subject.name

  if (loading) {
    return <div className="moderation-details-loading" aria-label="جارٍ تحميل تفاصيل الطلب"><i /><i /><i /></div>
  }

  if (error) return <div className="moderation-details-error">{error}</div>
  if (!data) return null

  return (
    <section className={`moderation-decision-details ${requestType === 'account_link_requests' ? 'account-link-decision' : ''}`}>
      <div className="moderation-decision-head">
        <div>
          <span>ملخص القرار</span>
          <strong>{data.operation || 'طلب اعتماد'}</strong>
        </div>
        <span className="moderation-decision-badge">قبل الاعتماد</span>
      </div>

      <div className="moderation-key-facts">
        <article>
          <span>مقدم الطلب</span>
          <strong>{requester?.display_name || 'مستخدم'}</strong>
          <small>{requester?.email || 'البريد غير متاح'}{requester?.role ? ` · ${roleLabels[requester.role] || requester.role}` : ''}</small>
        </article>
        <article>
          <span>الطلب يخص</span>
          <strong>{subject?.name || 'السجل المحدد'}</strong>
          <small>{data.operation || 'عملية اعتماد'}</small>
        </article>
        <article>
          <span>هوية الحساب الحالية</span>
          <strong>{requester?.linked_person_name || 'غير مرتبط بشخص'}</strong>
          <small>{requester?.linked_person_name ? 'هذا هو ملف الشخص المرتبط حاليًا بحساب مقدم الطلب' : 'الحساب لا يملك ملف شخص مرتبطًا حاليًا'}</small>
        </article>
      </div>

      {accountLinkConflict && (
        <div className="moderation-impact-warning">
          <strong>تنبيه مهم قبل الربط</strong>
          <span>حساب مقدم الطلب مرتبط حاليًا بـ «{requester?.linked_person_name}»، بينما الطلب الحالي يريد ربطه بـ «{subject?.name}».</span>
        </div>
      )}

      {data.operation_description && (
        <div className="moderation-impact-note">
          <span>ما الذي سيحدث عند الاعتماد؟</span>
          <p>{data.operation_description}</p>
        </div>
      )}

      <button className="moderation-details-toggle" type="button" onClick={() => setShowAll((value) => !value)}>
        {showAll ? 'إخفاء البيانات التفصيلية' : `عرض البيانات التفصيلية${detailRows.length ? ` (${detailRows.length})` : ''}`}
      </button>

      {showAll && detailRows.length > 0 && (
        <div className="moderation-detail-grid">
          {detailRows.map((item, index) => (
            <article key={`${item.label}-${index}`}>
              <span>{item.label}</span>
              <strong>{valueText(item.value)}</strong>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
