import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import FamilyPicker from './FamilyPicker'
import '../membership-management.css'

type RelatedFamily = { name?: string } | { name?: string }[] | null

type Membership = {
  id: string
  person_id: string
  family_id: string
  membership_type: string
  is_primary: boolean
  notes: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_by?: string
  families?: RelatedFamily
}

type Props = {
  personId: string
  recordCreatedBy?: string | null
  sessionUserId?: string | null
  isAdmin?: boolean
  isLinkedPerson?: boolean
  onChanged?: () => void | Promise<void>
}

const membershipLabels: Record<string, string> = {
  birth: 'بالنسب / عائلة الأصل',
  marriage: 'بالزواج',
  paternal: 'من جهة الأب',
  maternal: 'من جهة الأم',
  guardian: 'وصاية أو كفالة',
  other: 'انتماء آخر',
}

function familyName(value: RelatedFamily): string {
  if (!value) return ''
  if (Array.isArray(value)) return value[0]?.name ?? ''
  return value.name ?? ''
}

function membershipError(message: string): string {
  const value = message.toLowerCase()
  if (value.includes('membership already exists')) return 'هذا الانتماء مسجل مسبقًا لهذا الشخص.'
  if (value.includes('family not found')) return 'العائلة أو الفرع المحدد غير متاح.'
  if (value.includes('not allowed')) return 'لا تملك صلاحية تعديل هذا الانتماء.'
  if (value.includes('membership not found')) return 'تعذر العثور على الانتماء. حدّث الصفحة وحاول مرة أخرى.'
  return message || 'تعذر إكمال العملية.'
}

export default function PersonFamilyMemberships({ personId, recordCreatedBy, sessionUserId, isAdmin = false, isLinkedPerson = false, onChanged }: Props) {
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [primaryBusyId, setPrimaryBusyId] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [deleteBusyId, setDeleteBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ family_id: '', membership_type: 'marriage', is_primary: false, notes: '' })
  const [editForm, setEditForm] = useState({ family_id: '', membership_type: 'marriage', notes: '' })

  const load = useCallback(async () => {
    if (!supabase) return
    const { data, error } = await supabase
      .from('person_family_memberships')
      .select('id,person_id,family_id,membership_type,is_primary,notes,status,created_by,families(name)')
      .eq('person_id', personId)
      .order('is_primary', { ascending: false })
      .order('created_at')
    if (!error) setMemberships((data ?? []) as Membership[])
  }, [personId])

  useEffect(() => { void load() }, [load])

  const approved = useMemo(() => memberships.filter((item) => item.status === 'approved'), [memberships])
  const visible = useMemo(() => memberships.filter((item) => item.status === 'approved' || item.created_by === sessionUserId), [memberships, sessionUserId])
  const hasPrimary = approved.some((item) => item.is_primary)
  const canChangePrimary = Boolean(sessionUserId && (isAdmin || isLinkedPerson || recordCreatedBy === sessionUserId))
  const primaryMembership = approved.find((item) => item.is_primary)
  const primaryName = primaryMembership ? familyName(primaryMembership.families) : ''

  function canManageMembership(item: Membership) {
    if (!sessionUserId) return false
    return isAdmin || (item.status === 'pending' && item.created_by === sessionUserId)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !sessionUserId || !form.family_id) return
    setBusy(true)
    setMessage('')

    const status = isAdmin ? 'approved' : 'pending'
    const now = isAdmin ? new Date().toISOString() : null
    const { error } = await supabase.from('person_family_memberships').insert({
      person_id: personId,
      family_id: form.family_id,
      membership_type: form.membership_type,
      is_primary: hasPrimary ? false : form.is_primary,
      notes: form.notes.trim() || null,
      status,
      created_by: sessionUserId,
      approved_by: isAdmin ? sessionUserId : null,
      approved_at: now,
    })
    setBusy(false)
    if (error) {
      setMessage(membershipError(error.message))
      return
    }
    setMessage(isAdmin ? 'تمت إضافة العائلة أو الفرع واعتمادها مباشرة.' : 'تم إرسال الانتماء العائلي للمراجعة.')
    setForm({ family_id: '', membership_type: 'marriage', is_primary: false, notes: '' })
    await load()
    await onChanged?.()
    window.setTimeout(() => setOpen(false), 800)
  }

  async function makePrimary(item: Membership) {
    if (!supabase || !canChangePrimary || item.is_primary) return
    setPrimaryBusyId(item.id)
    setMessage('')
    const { data, error } = await supabase.rpc('request_primary_family_change', {
      p_person_id: personId,
      p_family_id: item.family_id,
    })
    setPrimaryBusyId('')
    if (error) {
      setMessage(error.message.toLowerCase().includes('does not exist') ? 'شغّل أحدث migration لتفعيل تغيير العائلة الأساسية.' : error.message)
      return
    }
    const direct = data === 'approved'
    setMessage(direct ? 'تم تغيير العائلة الأساسية مباشرة.' : 'تم إرسال طلب تغيير العائلة الأساسية للمراجعة.')
    if (direct) {
      await load()
      await onChanged?.()
    }
  }

  function startEdit(item: Membership) {
    setMessage('')
    setEditingId(item.id)
    setEditForm({
      family_id: item.family_id,
      membership_type: item.membership_type,
      notes: item.notes ?? '',
    })
  }

  function cancelEdit() {
    if (editBusy) return
    setEditingId('')
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, item: Membership) {
    event.preventDefault()
    if (!supabase || !sessionUserId || !editForm.family_id || !canManageMembership(item)) return
    setEditBusy(true)
    setMessage('')

    const { data, error } = await supabase.rpc('update_person_family_membership', {
      p_membership_id: item.id,
      p_family_id: editForm.family_id,
      p_membership_type: editForm.membership_type,
      p_notes: editForm.notes.trim() || null,
    })

    setEditBusy(false)
    if (error) {
      setMessage(membershipError(error.message))
      return
    }

    setEditingId('')
    setMessage(data === 'pending' ? 'تم تحديث الطلب المعلّق.' : 'تم تحديث العائلة أو الفرع المرتبط بالشخص.')
    await load()
    await onChanged?.()
  }

  async function removeMembership(item: Membership) {
    if (!supabase || !sessionUserId || !canManageMembership(item)) return
    const label = familyName(item.families) || 'هذه العائلة'
    const warning = item.is_primary
      ? `سيتم حذف ارتباط ${label}، وهي العائلة الأساسية حاليًا. سيختار النظام عائلة أساسية بديلة تلقائيًا إن وجدت. هل تريد المتابعة؟`
      : `هل تريد حذف ارتباط ${label} من هذا الشخص؟`
    if (!window.confirm(warning)) return

    setDeleteBusyId(item.id)
    setMessage('')
    const { error } = await supabase.rpc('delete_person_family_membership', { p_membership_id: item.id })
    setDeleteBusyId('')

    if (error) {
      setMessage(membershipError(error.message))
      return
    }

    if (editingId === item.id) setEditingId('')
    setMessage('تم حذف ارتباط العائلة أو الفرع.')
    await load()
    await onChanged?.()
  }

  return (
    <details className="detail-section family-memberships-section family-memberships-collapsible">
      <summary>
        <span><b>العائلات والانتماءات</b><small>{primaryName || 'إدارة الارتباطات الثانوية'}</small></span>
        <em>{visible.length}</em>
      </summary>
      <div className="family-memberships-collapsible-body">
        <div className="section-title">
          <div><span className="eyebrow">إدارة متقدمة</span><h2>العائلات والفروع المرتبطة</h2><p className="membership-section-help">هذه الارتباطات مستقلة عن مسار النسب؛ استخدمها للزواج أو الارتباطات الإدارية والتاريخية.</p></div>
          {sessionUserId && <button className="text-link membership-add-link" type="button" onClick={() => { setMessage(''); setOpen((value) => !value) }}>{open ? 'إلغاء' : '＋ إضافة عائلة أو فرع'}</button>}
        </div>

        {visible.length ? (
          <div className="membership-list">
            {visible.map((item) => {
              const name = familyName(item.families) || 'عائلة'
              const manageable = canManageMembership(item)
              const editing = editingId === item.id
              return (
                <article className={`membership-card ${item.is_primary ? 'primary-membership' : ''} ${editing ? 'is-editing' : ''}`} key={item.id}>
                  <span className="membership-family-avatar">{name[0]}</span>
                  <div className="membership-card-copy">
                    <span className="membership-title-line"><strong>{name}</strong>{item.is_primary && <span className="primary-family-badge">الأساسية</span>}</span>
                    <small>{membershipLabels[item.membership_type] || item.membership_type}</small>
                    {item.notes && <p>{item.notes}</p>}
                  </div>
                  <div className="membership-card-actions">
                    {item.status === 'pending' && <span className="membership-status pending">بانتظار الاعتماد</span>}
                    {item.status === 'approved' && !item.is_primary && approved.length > 1 && canChangePrimary && <button type="button" className="make-primary-family" disabled={primaryBusyId === item.id} onClick={() => void makePrimary(item)}>{primaryBusyId === item.id ? 'جارٍ الحفظ…' : 'جعلها الأساسية'}</button>}
                    {manageable && <div className="membership-inline-actions">
                      <button type="button" className="membership-edit-action" disabled={deleteBusyId === item.id} onClick={() => editing ? cancelEdit() : startEdit(item)}>{editing ? 'إلغاء التعديل' : 'تعديل'}</button>
                      <button type="button" className="membership-delete-action" disabled={deleteBusyId === item.id || editBusy} onClick={() => void removeMembership(item)}>{deleteBusyId === item.id ? 'جارٍ الحذف…' : 'حذف'}</button>
                    </div>}
                  </div>

                  {editing && <form className="membership-card-editor" onSubmit={(event) => void saveEdit(event, item)}>
                    <div className="membership-editor-title"><strong>تعديل ارتباط العائلة</strong><small>{item.status === 'approved' ? 'سيُحفظ مباشرة بصلاحية الإدارة.' : 'هذا الطلب ما زال بانتظار الاعتماد.'}</small></div>
                    <FamilyPicker label="العائلة أو الفرع" value={editForm.family_id} onChange={(familyId) => setEditForm((current) => ({ ...current, family_id: familyId }))} required />
                    <label><span>نوع الانتماء</span><select value={editForm.membership_type} onChange={(e) => setEditForm((current) => ({ ...current, membership_type: e.target.value }))}>{Object.entries(membershipLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                    <label><span>ملاحظة توضيحية</span><textarea rows={2} value={editForm.notes} onChange={(e) => setEditForm((current) => ({ ...current, notes: e.target.value }))} /></label>
                    <div className="membership-editor-actions"><button className="primary" type="submit" disabled={editBusy}>{editBusy ? 'جارٍ الحفظ…' : 'حفظ التعديل'}</button><button className="secondary" type="button" disabled={editBusy} onClick={cancelEdit}>إلغاء</button></div>
                  </form>}
                </article>
              )
            })}
          </div>
        ) : <div className="empty-state compact">لا توجد انتماءات عائلية معتمدة لهذا الشخص بعد.</div>}

        {message && <div className="record-edit-message membership-inline-message" role="status">{message}</div>}

        {open && sessionUserId && (
          <form className="membership-form membership-add-form" onSubmit={submit}>
            <div className="membership-form-heading"><strong>إضافة عائلة أو فرع</strong><small>اختر العائلة الموجودة في الدليل وحدد سبب ارتباطها بهذا الشخص.</small></div>
            <FamilyPicker label="العائلة أو الفرع" value={form.family_id} onChange={(familyId) => setForm((current) => ({ ...current, family_id: familyId }))} required />
            <label><span>نوع الانتماء</span><select value={form.membership_type} onChange={(e) => setForm((current) => ({ ...current, membership_type: e.target.value }))}>{Object.entries(membershipLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            {!hasPrimary && <label className="edit-check"><input type="checkbox" checked={form.is_primary} onChange={(e) => setForm((current) => ({ ...current, is_primary: e.target.checked }))} /><span>اعتبارها العائلة الأساسية</span></label>}
            <label><span>ملاحظة توضيحية</span><textarea rows={3} value={form.notes} placeholder="مثال: زوجة أحد أفراد العائلة" onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} /></label>
            <button className="primary" type="submit" disabled={busy}>{busy ? 'جارٍ الإرسال…' : isAdmin ? 'إضافة واعتماد' : 'إرسال للمراجعة'}</button>
          </form>
        )}
      </div>
    </details>
  )
}

export { membershipLabels }