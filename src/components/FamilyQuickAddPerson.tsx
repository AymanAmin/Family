import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import DuplicatePersonCheck from './DuplicatePersonCheck'
import PeoplePicker from './PeoplePicker'

type Props = {
  familyId: string
  familyName: string
  sessionUserId?: string | null
  isAdmin?: boolean
  onOpenPerson: (personId: string) => void
  onChanged?: () => void | Promise<void>
}

export default function FamilyQuickAddPerson({ familyId, familyName, sessionUserId, isAdmin = false, onOpenPerson, onChanged }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [existingId, setExistingId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  if (!sessionUserId) return null

  function reset(nextOpen = false) {
    if (busy) return
    setOpen(nextOpen)
    setMode('new')
    setName('')
    setGender('')
    setExistingId('')
    setMessage('')
  }

  function selectExistingPerson(personId: string) {
    setExistingId(personId)
    setMode('existing')
    setMessage('تم اختيار الشخص الموجود في الدليل. يمكنك الآن ربطه بهذه العائلة.')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setMessage('')
    setBusy(true)

    if (mode === 'existing') {
      if (!existingId) { setBusy(false); setMessage('اختر الشخص الموجود في الدليل.'); return }
      const { data, error } = await supabase.rpc('link_person_to_family_context', { p_person_id: existingId, p_family_id: familyId })
      setBusy(false)
      if (error) { setMessage('تعذر ربط الشخص بهذه العائلة.'); return }
      const result = String(data ?? '')
      setMessage(result === 'exists' ? 'هذا الشخص مرتبط بهذه العائلة بالفعل.' : result === 'pending' ? 'تم إرسال انتماء العائلة للمراجعة.' : 'تم ربط الشخص بالعائلة.')
      if (result !== 'exists') await onChanged?.()
      return
    }

    if (name.trim().length < 3) { setBusy(false); setMessage('اكتب الاسم الكامل.'); return }
    const { error } = await supabase.rpc('create_person_in_context', {
      p_full_name: name.trim(),
      p_gender: gender || null,
      p_family_id: familyId,
      p_anchor_person_id: null,
      p_relation_slot: null,
    })
    setBusy(false)
    if (error) { setMessage('تعذر إضافة الشخص. تحقق من الاسم وحاول مرة أخرى.'); return }
    setName('')
    setGender('')
    setMessage(isAdmin ? 'تمت إضافة الشخص مباشرة إلى العائلة.' : 'تم إرسال الشخص للمراجعة، وسيظهر هنا بعد الاعتماد.')
    await onChanged?.()
  }

  return <>
    <button className="family-inline-add-trigger" type="button" onClick={() => reset(true)}>
      <span>＋</span><div><strong>إضافة فرد إلى {familyName}</strong><small>الاسم أولًا، وبقية البيانات يمكن استكمالها لاحقًا</small></div>
    </button>

    {open && <div className="context-sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && reset(false)}>
      <section className="context-sheet" role="dialog" aria-modal="true" aria-label={`إضافة فرد إلى ${familyName}`}>
        <header><div><span>إضافة سريعة</span><h3>فرد داخل {familyName}</h3></div><button type="button" onClick={() => reset(false)} aria-label="إغلاق">×</button></header>
        <div className="context-sheet-mode"><button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}>شخص جديد</button><button type="button" className={mode === 'existing' ? 'active' : ''} onClick={() => setMode('existing')}>موجود في الدليل</button></div>
        <form onSubmit={submit}>
          {mode === 'new' ? <>
            <label><span>الاسم الكامل *</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="اكتب الاسم فقط" required /></label>
            <DuplicatePersonCheck name={name} onOpenPerson={selectExistingPerson} />
            <label><span>الجنس <small>اختياري</small></span><select value={gender} onChange={(event) => setGender(event.target.value)}><option value="">يُستكمل لاحقًا</option><option value="male">ذكر</option><option value="female">أنثى</option></select></label>
            <div className="context-auto-note"><b>{familyName}</b><span>تم تحديد العائلة تلقائيًا من الصفحة الحالية.</span></div>
          </> : <PeoplePicker label="اختر الشخص من الدليل" value={existingId} onChange={setExistingId} required />}
          {message && <div className="context-sheet-error info">{message}</div>}
          <button className="primary context-sheet-submit" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : mode === 'existing' ? 'ربط بالعائلة' : isAdmin ? 'إضافة مباشرة' : 'إرسال للمراجعة'}</button>
        </form>
      </section>
    </div>}
  </>
}
