import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import FamilyPicker from './FamilyPicker'

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

export default function PersonFamilyMemberships({ personId, recordCreatedBy, sessionUserId, isAdmin = false, onChanged }: Props) {
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [primaryBusyId, setPrimaryBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ family_id: '', membership_type: 'marriage', is_primary: false, notes: '' })

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
  const canChangePrimary = Boolean(sessionUserId && (isAdmin || recordCreatedBy === sessionUserId))

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
      setMessage(error.message)
      return
    }
    setMessage(isAdmin ? 'تمت إضافة الانتماء واعتماده مباشرة.' : 'تم إرسال الانتماء العائلي للمراجعة.')
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
      setMessage(error.message)
      return
    }
    const direct = data === 'approved'
    setMessage(direct ? 'تم تغيير العائلة الأساسية مباشرة.' : 'تم إرسال طلب تغيير العائلة الأساسية للمراجعة.')
    if (direct) {
      await load()
      await onChanged?.()
    }
  }

  return (
    <section className="detail-section family-memberships-section">
      <div className="section-title">
        <div><span className="eyebrow">الانتماء العائلي</span><h2>العائلات والفروع المرتبطة</h2></div>
        {sessionUserId && <button className="text-link" type="button" onClick={() => setOpen((value) => !value)}>{open ? 'إلغاء' : 'إضافة انتماء'}</button>}
      </div>

      {visible.length ? (
        <div className="membership-list">
          {visible.map((item) => {
            const name = familyName(item.families) || 'عائلة'
            return (
              <article className={`membership-card ${item.is_primary ? 'primary-membership' : ''}`} key={item.id}>
                <span className="membership-family-avatar">{name[0]}</span>
                <div className="membership-card-copy">
                  <span className="membership-title-line"><strong>{name}</strong>{item.is_primary && <span className="primary-family-badge">الأساسية</span>}</span>
                  <small>{membershipLabels[item.membership_type] || item.membership_type}</small>
                  {item.notes && <p>{item.notes}</p>}
                </div>
                <div className="membership-card-actions">
                  {item.status === 'pending' && <span className="membership-status pending">بانتظار الاعتماد</span>}
                  {item.status === 'approved' && !item.is_primary && approved.length > 1 && canChangePrimary && <button type="button" className="make-primary-family" disabled={primaryBusyId === item.id} onClick={() => void makePrimary(item)}>{primaryBusyId === item.id ? 'جارٍ الحفظ…' : 'جعلها الأساسية'}</button>}
                </div>
              </article>
            )
          })}
        </div>
      ) : <div className="empty-state compact">لا توجد انتماءات عائلية معتمدة لهذا الشخص بعد.</div>}

      {message && <div className="record-edit-message membership-inline-message">{message}</div>}

      {open && sessionUserId && (
        <form className="membership-form" onSubmit={submit}>
          <FamilyPicker label="العائلة أو الفرع" value={form.family_id} onChange={(familyId) => setForm((current) => ({ ...current, family_id: familyId }))} required />
          <label><span>نوع الانتماء</span><select value={form.membership_type} onChange={(e) => setForm((current) => ({ ...current, membership_type: e.target.value }))}>{Object.entries(membershipLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          {!hasPrimary && <label className="edit-check"><input type="checkbox" checked={form.is_primary} onChange={(e) => setForm((current) => ({ ...current, is_primary: e.target.checked }))} /><span>اعتبارها العائلة الأساسية</span></label>}
          <label><span>ملاحظة توضيحية</span><textarea rows={3} value={form.notes} placeholder="مثال: زوجة أحد أفراد العائلة" onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} /></label>
          <button className="primary" type="submit" disabled={busy}>{busy ? 'جارٍ الإرسال…' : isAdmin ? 'إضافة واعتماد' : 'إرسال للمراجعة'}</button>
        </form>
      )}
    </section>
  )
}

export { membershipLabels }
