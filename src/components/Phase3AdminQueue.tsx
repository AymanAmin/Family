import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const membershipLabels: Record<string, string> = {
  birth: 'بالنسب / عائلة الأصل',
  marriage: 'بالزواج',
  paternal: 'من جهة الأب',
  maternal: 'من جهة الأم',
  guardian: 'وصاية أو كفالة',
  other: 'انتماء آخر',
}

type MembershipRequest = {
  id: string
  person_id: string
  family_id: string
  membership_type: string
  is_primary: boolean
  notes: string | null
  created_at: string
  people?: { full_name?: string } | { full_name?: string }[] | null
  families?: { name?: string } | { name?: string }[] | null
}

type EditRequest = {
  id: string
  entity_type: 'families' | 'people' | 'events'
  record_id: string
  proposed_data: Record<string, unknown>
  created_at: string
}

type Props = {
  active: boolean
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

export default function Phase3AdminQueue({ active, onChanged }: Props) {
  const [memberships, setMemberships] = useState<MembershipRequest[]>([])
  const [edits, setEdits] = useState<EditRequest[]>([])
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    if (!supabase || !active) return
    const [membershipResult, editResult] = await Promise.all([
      supabase.from('person_family_memberships').select('id,person_id,family_id,membership_type,is_primary,notes,created_at,people(full_name),families(name)').eq('status', 'pending').order('created_at'),
      supabase.from('content_edit_requests').select('id,entity_type,record_id,proposed_data,created_at').eq('status', 'pending').order('created_at'),
    ])
    if (!membershipResult.error) setMemberships((membershipResult.data ?? []) as MembershipRequest[])
    if (!editResult.error) setEdits((editResult.data ?? []) as EditRequest[])
  }, [active])

  useEffect(() => { void load() }, [load])

  async function reviewMembership(id: string, status: 'approved' | 'rejected') {
    if (!supabase) return
    setBusyId(id)
    const { error } = await supabase.from('person_family_memberships').update({
      status,
      approved_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      approved_at: status === 'approved' ? new Date().toISOString() : null,
    }).eq('id', id)
    setBusyId('')
    if (!error) {
      await load()
      await onChanged?.()
    }
  }

  async function reviewEdit(id: string, status: 'approved' | 'rejected') {
    if (!supabase) return
    setBusyId(id)
    const { error } = await supabase.rpc('review_content_edit_request', {
      p_request_id: id,
      p_status: status,
      p_review_note: null,
    })
    setBusyId('')
    if (!error) {
      await load()
      await onChanged?.()
    }
  }

  if (!active || (!memberships.length && !edits.length)) return null

  return (
    <section className="phase3-admin-queue">
      <div className="section-title"><div><span className="eyebrow">مراجعات إضافية</span><h2>التعديلات والانتماءات العائلية</h2></div></div>

      <div className="review-list">
        {edits.map((item) => (
          <article className="review-row" key={`edit-${item.id}`}>
            <div><span className="status pending">تعديل</span><h3>{entityLabel(item.entity_type)}</h3><p>{summary(item.proposed_data)}</p></div>
            <div className="review-actions"><button className="approve" disabled={busyId === item.id} onClick={() => reviewEdit(item.id, 'approved')}>اعتماد</button><button className="reject" disabled={busyId === item.id} onClick={() => reviewEdit(item.id, 'rejected')}>رفض</button></div>
          </article>
        ))}

        {memberships.map((item) => (
          <article className="review-row" key={`membership-${item.id}`}>
            <div><span className="status pending">انتماء عائلي</span><h3>{personName(item.people) || 'شخص'} ← {relatedName(item.families) || 'عائلة'}</h3><p>{membershipLabels[item.membership_type] || item.membership_type}{item.is_primary ? ' · عائلة أساسية' : ''}{item.notes ? ` · ${item.notes}` : ''}</p></div>
            <div className="review-actions"><button className="approve" disabled={busyId === item.id} onClick={() => reviewMembership(item.id, 'approved')}>اعتماد</button><button className="reject" disabled={busyId === item.id} onClick={() => reviewMembership(item.id, 'rejected')}>رفض</button></div>
          </article>
        ))}
      </div>
    </section>
  )
}

function entityLabel(type: EditRequest['entity_type']) {
  if (type === 'families') return 'تعديل بيانات عائلة'
  if (type === 'people') return 'تعديل بيانات شخص'
  return 'تعديل مناسبة'
}

function summary(data: Record<string, unknown>) {
  const preferred = ['name', 'full_name', 'title', 'origin_place', 'location_name']
  for (const key of preferred) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return 'راجع البيانات المقترحة ثم اعتمد أو ارفض.'
}
