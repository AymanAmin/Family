import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type RelatedPerson = { id?: string; full_name?: string } | { id?: string; full_name?: string }[] | null

type Relationship = {
  id: string
  source_person_id: string
  target_person_id: string
  relation_type: string
  notes: string | null
  created_by: string
  source?: RelatedPerson
  target?: RelatedPerson
}

type Props = {
  personId: string
  sessionUserId?: string | null
  isAdmin?: boolean
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

function relatedName(value: RelatedPerson) {
  if (!value) return ''
  return Array.isArray(value) ? value[0]?.full_name || '' : value.full_name || ''
}

export default function DirectRelationshipEditor({ personId, sessionUserId, isAdmin = false, onChanged }: Props) {
  const [rows, setRows] = useState<Relationship[]>([])
  const [editing, setEditing] = useState<Relationship | null>(null)
  const [form, setForm] = useState({ relation_type: 'other', notes: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('person_relationships')
      .select('id,source_person_id,target_person_id,relation_type,notes,created_by,source:people!person_relationships_source_person_id_fkey(id,full_name),target:people!person_relationships_target_person_id_fkey(id,full_name)')
      .eq('status', 'approved')
      .or(`source_person_id.eq.${personId},target_person_id.eq.${personId}`)
      .order('created_at')
    setRows((data ?? []) as Relationship[])
  }, [personId])

  useEffect(() => { void load() }, [load])

  function startEdit(row: Relationship) {
    setEditing(row)
    setForm({ relation_type: row.relation_type, notes: row.notes || '' })
    setMessage('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !editing) return
    setBusy(true)
    setMessage('')
    const { data, error } = await supabase.rpc('request_relationship_edit', {
      p_relationship_id: editing.id,
      p_relation_type: form.relation_type,
      p_notes: form.notes.trim() || null,
    })
    setBusy(false)
    if (error) {
      setMessage(error.message)
      return
    }
    const direct = data === 'approved'
    setMessage(direct ? 'تم تعديل صلة القرابة مباشرة.' : 'تم إرسال تعديل صلة القرابة للمراجعة.')
    if (direct) {
      await load()
      await onChanged?.()
      window.setTimeout(() => setEditing(null), 650)
    }
  }

  const editableRows = rows.filter((row) => isAdmin || row.created_by === sessionUserId)
  if (!sessionUserId || !editableRows.length) return null

  return (
    <section className="detail-section direct-relations-editor">
      <div className="section-title"><div><span className="eyebrow">الصلات المسجلة</span><h2>تعديل صلة القرابة</h2><p className="secondary-queue-note">يمكن تعديل الصلات المدخلة يدويًا فقط؛ العلاقات المستنتجة تلقائيًا تتغير بتعديل بيانات الوالدين.</p></div></div>
      <div className="direct-relation-list">
        {editableRows.map((row) => {
          const source = relatedName(row.source) || 'شخص'
          const target = relatedName(row.target) || 'شخص'
          return <article className="direct-relation-card" key={row.id}><div><strong>{source} — {target}</strong><small>{labels[row.relation_type] || row.relation_type}{row.notes ? ` · ${row.notes}` : ''}</small></div><button type="button" onClick={() => startEdit(row)}>تعديل</button></article>
        })}
      </div>

      {editing && <div className="relationship-edit-box">
        <div className="relationship-edit-heading"><strong>تحرير الصلة</strong><button type="button" onClick={() => setEditing(null)}>×</button></div>
        <form onSubmit={submit}>
          <label><span>نوع الصلة</span><select value={form.relation_type} onChange={(event) => setForm((current) => ({ ...current, relation_type: event.target.value }))}>{Object.entries(labels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>ملاحظة أو مصدر المعلومة</span><textarea rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
          {message && <div className="record-edit-message">{message}</div>}
          <button className="primary" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : isAdmin ? 'حفظ التعديل' : 'إرسال التعديل للمراجعة'}</button>
        </form>
      </div>}
    </section>
  )
}
