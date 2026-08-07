import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type RelatedPerson = { id?: string; full_name?: string } | { id?: string; full_name?: string }[] | null

type Relationship = {
  id: string
  source_person_id: string
  target_person_id: string
  relation_type: string
  notes: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_by: string
  source?: RelatedPerson
  target?: RelatedPerson
}

type Props = {
  personId: string
  sessionUserId?: string | null
  isAdmin?: boolean
  onOpenPerson?: (id: string) => void
  onChanged?: () => void | Promise<void>
}

const labels: Record<string, string> = {
  parent: 'والد أو والدة',
  child: 'ابن أو ابنة',
  spouse: 'زوج أو زوجة',
  sibling: 'أخ أو أخت',
  guardian: 'ولي أو وصي',
  other: 'صلة أخرى',
}

function related(value: RelatedPerson) {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function relationTypeFromCurrentPerson(item: Relationship, personId: string) {
  const currentIsSource = item.source_person_id === personId
  if (item.relation_type === 'parent') return currentIsSource ? 'child' : 'parent'
  if (item.relation_type === 'child') return currentIsSource ? 'parent' : 'child'
  return item.relation_type
}

export default function DirectRelationshipManager({ personId, sessionUserId, isAdmin = false, onOpenPerson, onChanged }: Props) {
  const [rows, setRows] = useState<Relationship[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState('')
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ relation_type: 'parent', notes: '' })

  const load = useCallback(async () => {
    if (!isAdmin) {
      setRows([])
      setLoading(false)
      return
    }
    if (!supabase) return
    setLoading(true)
    const { data, error } = await supabase
      .from('person_relationships')
      .select('id,source_person_id,target_person_id,relation_type,notes,status,created_by,source:people!person_relationships_source_person_id_fkey(id,full_name),target:people!person_relationships_target_person_id_fkey(id,full_name)')
      .or(`source_person_id.eq.${personId},target_person_id.eq.${personId}`)
      .in('status', ['approved','pending'])
      .order('created_at')
    if (!error) setRows((data ?? []) as Relationship[])
    setLoading(false)
  }, [personId, isAdmin])

  useEffect(() => { void load() }, [load])

  function canManage() {
    return Boolean(sessionUserId && isAdmin)
  }

  function startEdit(item: Relationship) {
    setConfirmDeleteId('')
    setEditingId(item.id)
    setForm({ relation_type: item.relation_type, notes: item.notes || '' })
    setMessage('')
  }

  async function submitChange(item: Relationship, action: 'edit' | 'delete') {
    if (!supabase || !sessionUserId || !isAdmin || !canManage()) return
    setBusyId(item.id)
    setMessage('')
    const { data, error } = await supabase.rpc('request_relationship_change', {
      p_relationship_id: item.id,
      p_action: action,
      p_relation_type: action === 'edit' ? form.relation_type : null,
      p_notes: action === 'edit' ? form.notes.trim() || null : null,
    })
    setBusyId('')
    if (error) {
      setMessage(error.message.toLowerCase().includes('does not exist') ? 'شغّل أحدث ملف SETUP.sql لتفعيل تعديل وحذف صلات القرابة.' : error.message)
      return
    }
    setEditingId('')
    setConfirmDeleteId('')
    const applied = data === 'applied'
    setMessage(applied ? (action === 'delete' ? 'تم حذف الصلة وتحديث الشجرة.' : 'تم تحديث الصلة.') : (action === 'delete' ? 'تم إرسال طلب الحذف للإدارة.' : 'تم إرسال التعديل للإدارة.'))
    await load()
    await onChanged?.()
  }

  if (!isAdmin) return null
  if (loading) return <section className="direct-relations-panel"><div className="picker-skeleton compact">جارٍ تحميل العلاقات المسجلة…</div></section>
  if (!rows.length) return null

  return (
    <section className="direct-relations-panel">
      <div className="direct-relations-heading"><div><span className="eyebrow">إدارة الصلات</span><h3>العلاقات المسجلة يدويًا</h3><p>العلاقات المستنتجة تلقائيًا لا تُحذف من هنا؛ عدّل أصل النسب الذي استُنتجت منه.</p></div></div>
      {message && <div className="direct-relations-message">{message}</div>}
      <div className="direct-relations-list">
        {rows.map((item) => {
          const source = related(item.source)
          const target = related(item.target)
          const other = item.source_person_id === personId ? target : source
          const contextualRelationType = relationTypeFromCurrentPerson(item, personId)
          const contextualLabel = labels[contextualRelationType] || contextualRelationType
          return (
            <article className="direct-relation-card" key={item.id}>
              <button className="direct-relation-person" type="button" onClick={() => other?.id && onOpenPerson?.(other.id)}>
                <span>{other?.full_name?.charAt(0) || '؟'}</span>
                <div><strong>{other?.full_name || 'شخص'}</strong><small>{contextualLabel}{item.status === 'pending' ? ' · معلقة' : ''}</small></div>
              </button>
              {item.notes && <p>{item.notes}</p>}
              <div className="direct-relation-actions"><button type="button" onClick={() => startEdit(item)}>تعديل</button><button className="danger" type="button" onClick={() => { setEditingId(''); setConfirmDeleteId(item.id) }}>حذف</button></div>

              {editingId === item.id && <div className="direct-relation-edit">
                <label><span>نوع الصلة</span><select value={form.relation_type} onChange={(e) => setForm((current) => ({ ...current, relation_type: e.target.value }))}>{Object.entries(labels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label><span>ملاحظة</span><textarea rows={2} value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} /></label>
                <div><button className="primary" type="button" disabled={busyId === item.id} onClick={() => void submitChange(item,'edit')}>{busyId === item.id ? '…' : 'حفظ'}</button><button type="button" onClick={() => setEditingId('')}>إلغاء</button></div>
              </div>}

              {confirmDeleteId === item.id && <div className="direct-relation-delete-confirm"><span>{`هل تريد حذف صلة «${contextualLabel}» مع ${other?.full_name || 'هذا الشخص'}؟`}</span><div><button className="danger" type="button" disabled={busyId === item.id} onClick={() => void submitChange(item,'delete')}>{busyId === item.id ? '…' : 'تأكيد الحذف'}</button><button type="button" onClick={() => setConfirmDeleteId('')}>إلغاء</button></div></div>}
            </article>
          )
        })}
      </div>
    </section>
  )
}
