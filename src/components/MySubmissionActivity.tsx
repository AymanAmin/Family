import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type ActivityStatus = '' | 'pending' | 'approved' | 'rejected'

type ActivityRow = {
  id: string
  item_type: string
  entity_type: string
  record_id: string
  title: string
  subtitle: string
  status: 'pending' | 'approved' | 'rejected'
  review_note: string | null
  created_at: string
}

type Props = {
  active: boolean
  role: string
  onOpenPerson?: (id: string) => void
  onOpenFamily?: (id: string) => void
}

const PAGE_SIZE = 10

const typeLabels: Record<string, string> = {
  family: 'عائلة',
  person: 'شخص',
  event: 'مناسبة',
  relationship: 'صلة قرابة',
  membership: 'انتماء عائلي',
  edit: 'تعديل',
  account_link: 'ربط الحساب',
}

const statusLabels: Record<string, string> = {
  pending: 'بانتظار المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date(value))
}

export default function MySubmissionActivity({ active, role, onOpenPerson, onOpenFamily }: Props) {
  const [status, setStatus] = useState<ActivityStatus>('')
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async (offset = 0, append = false) => {
    if (!supabase || !active) return
    append ? setLoadingMore(true) : setLoading(true)
    setMessage('')

    const { data, error } = await supabase.rpc('list_my_submission_activity', {
      p_status: status || null,
      p_limit: PAGE_SIZE + 1,
      p_offset: offset,
    })

    setLoading(false)
    setLoadingMore(false)

    if (error) {
      setRows([])
      setHasMore(false)
      setMessage(error.message.toLowerCase().includes('does not exist') ? 'شغّل migration رقم 019 لتفعيل سجل طلباتك.' : 'تعذر تحميل سجل طلباتك الآن.')
      return
    }

    const received = (data ?? []) as ActivityRow[]
    setHasMore(received.length > PAGE_SIZE)
    const page = received.slice(0, PAGE_SIZE)
    setRows((current) => append ? [...current, ...page] : page)
  }, [active, status])

  useEffect(() => {
    if (!active) return
    void load()
  }, [active, load])

  function openRecord(item: ActivityRow) {
    if (item.entity_type === 'people' || item.entity_type === 'person_family_memberships' || item.entity_type === 'person_relationships') {
      onOpenPerson?.(item.record_id)
    } else if (item.entity_type === 'families') {
      onOpenFamily?.(item.record_id)
    }
  }

  function canOpen(item: ActivityRow) {
    return Boolean(item.record_id && (item.entity_type === 'people' || item.entity_type === 'families' || item.entity_type === 'person_family_memberships' || item.entity_type === 'person_relationships'))
  }

  if (!active) return null

  return (
    <section className="my-activity-panel">
      <header className="my-activity-heading">
        <div><span className="eyebrow">متابعة المساهمات</span><h2>طلباتي</h2><p>يعرض السجل إضافاتك وتصحيحاتك وحالة مراجعتها، ويتم تحميل {PAGE_SIZE} عناصر فقط في كل دفعة.</p></div>
        <span className={`my-role-pill role-${role}`}>{roleLabel(role)}</span>
      </header>

      <div className="my-activity-filters" role="tablist" aria-label="تصفية طلباتي حسب الحالة">
        {([
          ['', 'الكل'],
          ['pending', 'معلقة'],
          ['approved', 'معتمدة'],
          ['rejected', 'مرفوضة'],
        ] as const).map(([value, label]) => (
          <button key={value || 'all'} type="button" className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>{label}</button>
        ))}
      </div>

      {message && <div className="my-activity-message">{message}</div>}

      {loading ? (
        <div className="my-activity-skeleton"><i /><i /><i /></div>
      ) : rows.length ? (
        <div className="my-activity-list">
          {rows.map((item) => (
            <article className={`my-activity-card status-${item.status}`} key={`${item.item_type}-${item.id}`}>
              <span className="my-activity-type-mark">{typeLabels[item.item_type]?.charAt(0) || 'ط'}</span>
              <div className="my-activity-copy">
                <div className="my-activity-meta"><span>{typeLabels[item.item_type] || item.item_type}</span><time>{formatDate(item.created_at)}</time></div>
                <strong>{item.title}</strong>
                <p>{item.subtitle}</p>
                {item.review_note && <small className="my-review-note">ملاحظة المراجعة: {item.review_note}</small>}
              </div>
              <div className="my-activity-side">
                <span className={`my-activity-status ${item.status}`}>{statusLabels[item.status] || item.status}</span>
                {canOpen(item) && item.status !== 'rejected' && <button type="button" onClick={() => openRecord(item)}>فتح السجل</button>}
              </div>
            </article>
          ))}
        </div>
      ) : <div className="empty-state compact"><strong>لا توجد طلبات في هذا التصنيف</strong><span>ستظهر مساهماتك هنا فور إرسالها.</span></div>}

      {hasMore && !loading && <button className="my-activity-more" type="button" disabled={loadingMore} onClick={() => void load(rows.length, true)}>{loadingMore ? 'جارٍ التحميل…' : 'عرض المزيد'}</button>}
    </section>
  )
}

function roleLabel(role: string) {
  if (role === 'verified_member') return 'عضو موثّق'
  if (role === 'family_moderator') return 'مسؤول عائلة'
  if (role === 'content_moderator') return 'مشرف محتوى'
  if (role === 'admin') return 'مدير'
  if (role === 'super_admin') return 'مدير أعلى'
  return 'عضو'
}
