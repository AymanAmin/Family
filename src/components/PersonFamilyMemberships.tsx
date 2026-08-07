import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Family = { id: string; name: string }

type Membership = {
  id: string
  person_id: string
  family_id: string
  membership_type: string
  is_primary: boolean
  notes: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_by?: string
}

type Props = {
  personId: string
  families: Family[]
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

export default function PersonFamilyMemberships({ personId, families, sessionUserId, isAdmin = false, onChanged }: Props) {
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ family_id: '', membership_type: 'marriage', is_primary: false, notes: '' })

  const load = useCallback(async () => {
    if (!supabase) return
    const { data, error } = await supabase
      .from('person_family_memberships')
      .select('id,person_id,family_id,membership_type,is_primary,notes,status,created_by')
      .eq('person_id', personId)
      .order('is_primary', { ascending: false })
      .order('created_at')
    if (!error) setMemberships((data ?? []) as Membership[])
  }, [personId])

  useEffect(() => { void load() }, [load])

  const approved = useMemo(() => memberships.filter((item) => item.status === 'approved'), [memberships])
  const visible = useMemo(() => memberships.filter((item) => item.status === 'approved' || item.created_by === sessionUserId), [memberships, sessionUserId])
  const hasPrimary = approved.some((item) => item.is_primary)
  const familyById = useMemo(() => new Map(families.map((family) => [family.id, family.name])), [families])

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

  return (
    <section className="detail-section family-memberships-section">
      <div className="section-title">
        <div><span className="eyebrow">الانتماء العائلي</span><h2>العائلات والفروع المرتبطة</h2></div>
        {sessionUserId && <button className="text-link" type="button" onClick={() => setOpen((value) => !value)}>{open ? 'إلغاء' : 'إضافة انتماء'}</button>}
      </div>

      {visible.length ? (
        <div className="membership-list">
          {visible.map((item) => (
            <article className="membership-card" key={item.id}>
              <span className="membership-family-avatar">{(familyById.get(item.family_id) || 'ع')[0]}</span>
              <div>
                <strong>{familyById.get(item.family_id) || 'عائلة'}</strong>
                <small>{membershipLabels[item.membership_type] || item.membership_type}{item.is_primary ? ' · العائلة الأساسية' : ''}</small>
                {item.notes && <p>{item.notes}</p>}
              </div>
              {item.status === 'pending' && <span className="membership-status pending">بانتظار الاعتماد</span>}
            </article>
          ))}
        </div>
      ) : <div className="empty-state compact">لا توجد انتماءات عائلية معتمدة لهذا الشخص بعد.</div>}

      {open && sessionUserId && (
        <form className="membership-form" onSubmit={submit}>
          <label><span>العائلة أو الفرع</span><select required value={form.family_id} onChange={(e) => setForm((current) => ({ ...current, family_id: e.target.value }))}><option value="">اختر العائلة</option>{families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}</select></label>
          <label><span>نوع الانتماء</span><select value={form.membership_type} onChange={(e) => setForm((current) => ({ ...current, membership_type: e.target.value }))}>{Object.entries(membershipLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          {!hasPrimary && <label className="edit-check"><input type="checkbox" checked={form.is_primary} onChange={(e) => setForm((current) => ({ ...current, is_primary: e.target.checked }))} /><span>اعتبارها العائلة الأساسية</span></label>}
          <label><span>ملاحظة توضيحية</span><textarea rows={3} value={form.notes} placeholder="مثال: زوجة أحد أفراد العائلة" onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} /></label>
          {message && <div className="record-edit-message">{message}</div>}
          <button className="primary" type="submit" disabled={busy}>{busy ? 'جارٍ الإرسال…' : isAdmin ? 'إضافة واعتماد' : 'إرسال للمراجعة'}</button>
        </form>
      )}
    </section>
  )
}

export { membershipLabels }
