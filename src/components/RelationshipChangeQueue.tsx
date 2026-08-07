import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import ModerationRequestDetails from './ModerationRequestDetails'

type Row = {
  id: string
  relationship_id: string
  action: 'edit' | 'delete'
  title: string
  subtitle: string
  created_at: string
}

type Props = { active: boolean; onChanged?: () => void | Promise<void> }

const PAGE_SIZE = 12

export default function RelationshipChangeQueue({ active, onChanged }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async (offset = 0, append = false) => {
    if (!supabase || !active) return
    append ? setLoadingMore(true) : setLoading(true)
    setMessage('')
    const { data, error } = await supabase.rpc('list_pending_relationship_changes', {
      p_limit: PAGE_SIZE + 1,
      p_offset: offset,
    })
    setLoading(false)
    setLoadingMore(false)
    if (error) {
      setRows([])
      setHasMore(false)
      if (!error.message.toLowerCase().includes('does not exist')) setMessage(error.message)
      return
    }
    const received = (data ?? []) as Row[]
    setHasMore(received.length > PAGE_SIZE)
    const page = received.slice(0, PAGE_SIZE)
    setRows((current) => append ? [...current, ...page] : page)
  }, [active])

  useEffect(() => { if (active) void load() }, [active, load])

  async function review(item: Row, status: 'approved' | 'rejected') {
    if (!supabase) return
    setBusyId(item.id)
    setMessage('')
    const { error } = await supabase.rpc('review_relationship_change', {
      p_request_id: item.id,
      p_status: status,
      p_review_note: null,
    })
    setBusyId('')
    if (error) {
      setMessage(error.message)
      return
    }
    await load()
    await onChanged?.()
  }

  if (!active) return null
  if (!loading && !rows.length && !message) return null

  return (
    <section className="relationship-change-queue">
      <div className="section-title"><div><span className="eyebrow">تغييرات صلة القرابة</span><h2>طلبات التعديل والحذف</h2><p>التعديلات على العلاقات المنشورة لا تُطبق قبل اعتماد الإدارة.</p></div></div>
      {message && <div className="admin-users-message">{message}</div>}
      {loading ? <div className="admin-users-skeleton"><i /><i /></div> : <div className="review-list">
        {rows.map((item) => <article className="review-row moderation-rich-row" key={item.id}>
          <div><span className={`status ${item.action === 'delete' ? 'danger-status' : 'pending'}`}>{item.action === 'delete' ? 'حذف' : 'تعديل'}</span><h3>{item.title}</h3><p>{item.subtitle}</p></div>
          <ModerationRequestDetails requestType="relationship_change" requestId={item.id} />
          <div className="review-actions"><button className="approve" disabled={busyId===item.id} onClick={() => void review(item,'approved')}>اعتماد</button><button className="reject" disabled={busyId===item.id} onClick={() => void review(item,'rejected')}>رفض</button></div>
        </article>)}
      </div>}
      {hasMore && <button className="admin-load-more" type="button" disabled={loadingMore} onClick={() => void load(rows.length,true)}>{loadingMore ? 'جارٍ التحميل…' : 'عرض المزيد'}</button>}
    </section>
  )
}
