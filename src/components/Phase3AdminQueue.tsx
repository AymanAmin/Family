import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import EditRequestDiff from './EditRequestDiff'

const PAGE_SIZE = 12

const membershipLabels: Record<string, string> = {
  birth: 'بالنسب / عائلة الأصل',
  marriage: 'بالزواج',
  paternal: 'من جهة الأب',
  maternal: 'من جهة الأم',
  guardian: 'وصاية أو كفالة',
  other: 'انتماء آخر',
}

type QueueItem = {
  id: string
  request_type: 'edit' | 'membership'
  title: string
  subtitle: string
  created_at: string
}

type MembershipRequest = {
  id: string
  membership_type: string
  is_primary: boolean
  notes: string | null
  created_at: string
  people?: { full_name?: string } | { full_name?: string }[] | null
  families?: { name?: string } | { name?: string }[] | null
}

type EditRequest = {
  id: string
  entity_type: 'families' | 'people' | 'events' | 'person_relationships'
  proposed_data: Record<string, unknown>
  created_at: string
}

type Props = {
  active: boolean
  isAdmin?: boolean
  onChanged?: () => void | Promise<void>
}

function relatedName(value: { name?: string } | { name?: string }[] | null | undefined) {
  if (!value) return ''
  return Array.isArray(value) ? value[0]?.name || '' : value.name || ''
}

function personName(value: { full_name?: string } | { full_name?: string }[] | null | undefined) {
  if (!value) return ''
  return Array.isArray(value) ? value[0]?.full_name || '' : value.full_name || ''
}

export default function Phase3AdminQueue({ active, isAdmin = false, onChanged }: Props) {
  const [rows, setRows] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [expandedDiffId, setExpandedDiffId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const load = useCallback(async (offset = 0, append = false) => {
    if (!supabase || !active) return
    append ? setLoadingMore(true) : setLoading(true)
    setMessage('')

    const feedResult = await supabase.rpc('list_pending_secondary_moderation_feed', {
      p_limit: PAGE_SIZE + 1,
      p_offset: offset,
    })

    if (!feedResult.error) {
      const received = (feedResult.data ?? []) as QueueItem[]
      const page = received.slice(0, PAGE_SIZE)
      setHasMore(received.length > PAGE_SIZE)
      setRows((current) => append ? [...current, ...page] : page)
      setLoading(false)
      setLoadingMore(false)
      if (!append) setExpandedDiffId(null)
      return
    }

    if (!isAdmin || offset > 0) {
      setRows([])
      setHasMore(false)
      setLoading(false)
      setLoadingMore(false)
      setMessage(feedResult.error.message.toLowerCase().includes('does not exist') ? 'شغّل أحدث SETUP.sql لتفعيل نطاقات المراجعة.' : 'تعذر تحميل طلبات التعديل والانتماء الآن.')
      return
    }

    const [membershipResult, editResult] = await Promise.all([
      supabase.from('person_family_memberships').select('id,membership_type,is_primary,notes,created_at,people(full_name),families(name)').eq('status', 'pending').order('created_at').limit(6),
      supabase.from('content_edit_requests').select('id,entity_type,proposed_data,created_at').eq('status', 'pending').order('created_at').limit(6),
    ])

    if (membershipResult.error || editResult.error) {
      setRows([])
      setHasMore(false)
      setLoading(false)
      setLoadingMore(false)
      setMessage('تعذر تحميل طلبات التعديل والانتماء الآن.')
      return
    }

    const fallbackRows: QueueItem[] = []
    for (const item of editResult.data ?? []) {
      const edit = item as EditRequest
      fallbackRows.push({ id: edit.id, request_type: 'edit', title: entityLabel(edit.entity_type), subtitle: summary(edit.proposed_data), created_at: edit.created_at })
    }
    for (const item of membershipResult.data ?? []) {
      const membership = item as MembershipRequest
      fallbackRows.push({
        id: membership.id,
        request_type: 'membership',
        title: `${personName(membership.people) || 'شخص'} ← ${relatedName(membership.families) || 'عائلة'}`,
        subtitle: `${membershipLabels[membership.membership_type] || membership.membership_type}${membership.is_primary ? ' · عائلة أساسية' : ''}${membership.notes ? ` · ${membership.notes}` : ''}`,
        created_at: membership.created_at,
      })
    }

    setRows(fallbackRows.sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, PAGE_SIZE))
    setHasMore(false)
    setLoading(false)
    setLoadingMore(false)
    setExpandedDiffId(null)
  }, [active, isAdmin])

  useEffect(() => {
    if (!active) return
    void load()
  }, [active, load])

  async function review(item: QueueItem, status: 'approved' | 'rejected') {
    if (!supabase) return
    setBusyId(item.id)
    setMessage('')

    let result = await supabase.rpc('review_secondary_moderation_request', {
      p_request_type: item.request_type,
      p_request_id: item.id,
      p_status: status,
    })

    if (result.error?.message.toLowerCase().includes('does not exist') && isAdmin) {
      result = item.request_type === 'edit'
        ? await supabase.rpc('review_content_edit_request', { p_request_id: item.id, p_status: status, p_review_note: null })
        : await supabase.from('person_family_memberships').update({
            status,
            approved_by: (await supabase.auth.getUser()).data.user?.id ?? null,
            approved_at: status === 'approved' ? new Date().toISOString() : null,
          }).eq('id', item.id)
    }

    setBusyId('')
    if (result.error) {
      setMessage(result.error.message || 'تعذر مراجعة الطلب.')
      return
    }

    if (expandedDiffId === item.id) setExpandedDiffId(null)
    await load()
    await onChanged?.()
  }

  if (!active) return null

  return (
    <section className="phase3-admin-queue">
      <div className="section-title"><div><span className="eyebrow">مراجعات إضافية</span><h2>التعديلات والانتماءات العائلية</h2><p className="secondary-queue-note">يتم تحميل {PAGE_SIZE} طلبًا فقط في كل دفعة. تفاصيل المقارنة لا تُجلب إلا عند فتح الطلب.</p></div></div>

      {message && <div className="admin-users-message">{message}</div>}

      {loading ? (
        <div className="admin-users-skeleton"><i /><i /><i /></div>
      ) : rows.length ? (
        <div className="review-list">
          {rows.map((item) => {
            const expanded = item.request_type === 'edit' && expandedDiffId === item.id
            return (
              <article className={`review-row secondary-review-row ${expanded ? 'has-details' : ''}`} key={`${item.request_type}-${item.id}`}>
                <div className="secondary-review-copy"><span className="status pending">{item.request_type === 'edit' ? 'تعديل' : 'انتماء عائلي'}</span><h3>{item.title}</h3><p>{item.subtitle}</p></div>
                <div className="review-actions secondary-review-actions">
                  {item.request_type === 'edit' && <button className="review-detail-toggle" type="button" onClick={() => setExpandedDiffId(expanded ? null : item.id)}>{expanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}</button>}
                  <button className="approve" disabled={busyId === item.id} onClick={() => void review(item, 'approved')}>اعتماد</button>
                  <button className="reject" disabled={busyId === item.id} onClick={() => void review(item, 'rejected')}>رفض</button>
                </div>
                {item.request_type === 'edit' && <EditRequestDiff requestId={item.id} open={expanded} />}
              </article>
            )
          })}
        </div>
      ) : <div className="empty-state compact"><strong>لا توجد مراجعات ضمن صلاحياتك</strong><span>لا توجد تعديلات أو انتماءات عائلية معلقة في نطاقك حاليًا.</span></div>}

      {hasMore && !loading && <button type="button" className="admin-load-more" disabled={loadingMore} onClick={() => void load(rows.length, true)}>{loadingMore ? 'جارٍ تحميل المزيد…' : 'عرض المزيد من المراجعات'}</button>}
    </section>
  )
}

function entityLabel(type: EditRequest['entity_type']) {
  if (type === 'families') return 'تعديل بيانات عائلة'
  if (type === 'people') return 'تعديل بيانات شخص'
  if (type === 'person_relationships') return 'تعديل صلة قرابة'
  return 'تعديل مناسبة'
}

function summary(data: Record<string, unknown>) {
  const preferred = ['name', 'full_name', 'title', 'origin_place', 'location_name', 'relation_type']
  for (const key of preferred) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  if (typeof data.family_id === 'string' && data.family_id) return 'تغيير العائلة الأساسية'
  return 'راجع البيانات المقترحة ثم اعتمد أو ارفض.'
}
