import { useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type EntityType = 'families' | 'people' | 'events'

type FamilyOption = { id: string; name: string }

type Props = {
  entityType: EntityType
  recordId: string
  createdBy: string | null | undefined
  sessionUserId: string | null | undefined
  isAdmin: boolean
  initialData: Record<string, string | number | boolean | null | undefined>
  familyOptions?: FamilyOption[]
  onSaved?: () => void | Promise<void>
}

const eventLabels: Record<string, string> = {
  death: 'وفاة وعزاء',
  wedding: 'زواج',
  birth: 'مولود',
  naming: 'سماية',
  graduation: 'تخرج ونجاح',
  general: 'مناسبة عامة',
  other: 'أخرى',
}

export default function RecordEditButton({
  entityType,
  recordId,
  createdBy,
  sessionUserId,
  isAdmin,
  initialData,
  familyOptions = [],
  onSaved,
}: Props) {
  const canEdit = Boolean(isAdmin || (sessionUserId && createdBy === sessionUserId))
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState<Record<string, string | number | boolean | null>>(() => normalize(initialData))

  const title = useMemo(() => {
    if (entityType === 'families') return 'تعديل بيانات العائلة'
    if (entityType === 'people') return 'تعديل بيانات الشخص'
    return 'تعديل المناسبة'
  }, [entityType])

  if (!canEdit) return null

  function resetAndOpen() {
    setForm(normalize(initialData))
    setMessage('')
    setOpen(true)
  }

  function setValue(key: string, value: string | number | boolean | null) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function setDeceased(value: boolean) {
    setForm((current) => ({
      ...current,
      is_deceased: value,
      death_date: value ? current.death_date ?? '' : '',
    }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    if (entityType === 'people' && Boolean(form.is_deceased) && !String(form.death_date ?? '').trim()) {
      setMessage('حدد تاريخ الوفاة أولًا.')
      return
    }

    setBusy(true)
    setMessage('')

    const payload = buildPayload(entityType, form)
    const { error } = await supabase.rpc('request_content_edit', {
      p_entity_type: entityType,
      p_record_id: recordId,
      p_proposed_data: payload,
    })

    setBusy(false)
    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(isAdmin ? 'تم حفظ التعديل مباشرة.' : 'تم إرسال التعديل للإدارة. ستبقى النسخة الحالية ظاهرة حتى الاعتماد.')
    if (isAdmin) await onSaved?.()
    window.setTimeout(() => setOpen(false), 900)
  }

  return (
    <>
      <button className="record-edit-trigger" type="button" onClick={resetAndOpen}>تعديل</button>
      {open && (
        <div className="record-edit-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <section className="record-edit-sheet" role="dialog" aria-modal="true" aria-label={title}>
            <div className="record-edit-heading">
              <div><span>تحرير السجل</span><h2>{title}</h2></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق">×</button>
            </div>

            {!isAdmin && <p className="edit-review-note">أي تعديل ترسله سيبقى بانتظار اعتماد الإدارة، ولن تتغير النسخة المنشورة قبل الموافقة.</p>}

            <form className="record-edit-form" onSubmit={submit}>
              {entityType === 'families' && (
                <>
                  <label><span>اسم العائلة</span><input required value={String(form.name ?? '')} onChange={(e) => setValue('name', e.target.value)} /></label>
                  <label><span>مكان الأصل</span><input value={String(form.origin_place ?? '')} onChange={(e) => setValue('origin_place', e.target.value)} /></label>
                  <label><span>نبذة</span><textarea rows={4} value={String(form.description ?? '')} onChange={(e) => setValue('description', e.target.value)} /></label>
                </>
              )}

              {entityType === 'people' && (
                <>
                  <label><span>الاسم الكامل</span><input required value={String(form.full_name ?? '')} onChange={(e) => setValue('full_name', e.target.value)} /></label>
                  <div className="edit-form-grid">
                    <label><span>الجنس</span><select value={String(form.gender ?? '')} onChange={(e) => setValue('gender', e.target.value)}><option value="">غير محدد</option><option value="male">ذكر</option><option value="female">أنثى</option></select></label>
                    <label><span>سنة الميلاد</span><input inputMode="numeric" type="number" min="1800" max="2100" value={String(form.birth_year ?? '')} onChange={(e) => setValue('birth_year', e.target.value)} /></label>
                  </div>

                  <div className={`life-status-card ${Boolean(form.is_deceased) ? 'deceased' : 'alive'}`}>
                    <div className="life-status-copy">
                      <span className="life-status-icon">{Boolean(form.is_deceased) ? '✦' : '●'}</span>
                      <div><strong>{Boolean(form.is_deceased) ? 'متوفى' : 'على قيد الحياة'}</strong><small>{Boolean(form.is_deceased) ? 'يجب تحديد تاريخ الوفاة' : 'يمكن تغيير الحالة عند الحاجة'}</small></div>
                    </div>
                    <label className="life-status-switch"><input type="checkbox" checked={Boolean(form.is_deceased)} onChange={(e) => setDeceased(e.target.checked)} /><span /></label>
                  </div>

                  {Boolean(form.is_deceased) && (
                    <label className="death-date-field"><span>تاريخ الوفاة *</span><input type="date" required value={String(form.death_date ?? '')} onChange={(e) => setValue('death_date', e.target.value)} /></label>
                  )}

                  <label><span>نبذة</span><textarea rows={4} value={String(form.description ?? '')} onChange={(e) => setValue('description', e.target.value)} /></label>
                </>
              )}

              {entityType === 'events' && (
                <>
                  <label><span>نوع المناسبة</span><select value={String(form.event_type ?? 'general')} onChange={(e) => setValue('event_type', e.target.value)}>{Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label><span>العنوان</span><input required value={String(form.title ?? '')} onChange={(e) => setValue('title', e.target.value)} /></label>
                  <div className="edit-form-grid">
                    <label><span>التاريخ</span><input type="date" value={String(form.event_date ?? '')} onChange={(e) => setValue('event_date', e.target.value)} /></label>
                    <label><span>العائلة</span><select value={String(form.family_id ?? '')} onChange={(e) => setValue('family_id', e.target.value)}><option value="">بدون عائلة محددة</option>{familyOptions.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}</select></label>
                  </div>
                  <label><span>المكان</span><input value={String(form.location_name ?? '')} onChange={(e) => setValue('location_name', e.target.value)} /></label>
                  <label><span>التفاصيل</span><textarea rows={4} value={String(form.description ?? '')} onChange={(e) => setValue('description', e.target.value)} /></label>
                </>
              )}

              {message && <div className="record-edit-message">{message}</div>}
              <button className="primary" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : isAdmin ? 'حفظ التعديل' : 'إرسال التعديل للمراجعة'}</button>
            </form>
          </section>
        </div>
      )}
    </>
  )
}

function normalize(input: Props['initialData']): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(input)) result[key] = value ?? ''
  return result
}

function buildPayload(entityType: EntityType, form: Record<string, string | number | boolean | null>) {
  if (entityType === 'families') {
    return { name: String(form.name ?? '').trim(), origin_place: String(form.origin_place ?? '').trim(), description: String(form.description ?? '').trim() }
  }
  if (entityType === 'people') {
    const deceased = Boolean(form.is_deceased)
    return {
      full_name: String(form.full_name ?? '').trim(),
      gender: String(form.gender ?? ''),
      birth_year: String(form.birth_year ?? ''),
      is_deceased: deceased,
      death_date: deceased ? String(form.death_date ?? '').trim() : '',
      description: String(form.description ?? '').trim(),
    }
  }
  return {
    event_type: String(form.event_type ?? 'general'),
    title: String(form.title ?? '').trim(),
    family_id: String(form.family_id ?? ''),
    event_date: String(form.event_date ?? ''),
    location_name: String(form.location_name ?? '').trim(),
    description: String(form.description ?? '').trim(),
  }
}
