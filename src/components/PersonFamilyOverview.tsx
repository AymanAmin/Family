import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import DuplicatePersonCheck from './DuplicatePersonCheck'
import PeoplePicker from './PeoplePicker'
import LineageSummaryCard from './LineageSummaryCard'

type Gender = 'male' | 'female' | null
type RelationSlot = 'father' | 'mother' | 'husband' | 'wife' | 'son' | 'daughter' | 'brother' | 'sister'

type KinshipRow = {
  related_person_id: string
  full_name: string
  gender: Gender
  relation_type: string
  is_inferred: boolean
}

type Props = {
  personId: string
  personName: string
  personGender: Gender
  primaryFamilyId?: string | null
  sessionUserId?: string | null
  isAdmin?: boolean
  onOpenPerson: (personId: string) => void
  onChanged?: () => void | Promise<void>
}

const slotConfig: Record<RelationSlot, { label: string; gender: Exclude<Gender, null>; relationLabel: string }> = {
  father: { label: 'إضافة أب', gender: 'male', relationLabel: 'الأب' },
  mother: { label: 'إضافة أم', gender: 'female', relationLabel: 'الأم' },
  husband: { label: 'إضافة زوج', gender: 'male', relationLabel: 'الزوج' },
  wife: { label: 'إضافة زوجة', gender: 'female', relationLabel: 'الزوجة' },
  son: { label: 'إضافة ابن', gender: 'male', relationLabel: 'الابن' },
  daughter: { label: 'إضافة ابنة', gender: 'female', relationLabel: 'الابنة' },
  brother: { label: 'إضافة أخ', gender: 'male', relationLabel: 'الأخ' },
  sister: { label: 'إضافة أخت', gender: 'female', relationLabel: 'الأخت' },
}

function fallbackRelationType(type: string, currentIsSource: boolean) {
  if (type === 'parent') return currentIsSource ? 'child' : 'parent'
  if (type === 'child') return currentIsSource ? 'parent' : 'child'
  return type
}

export default function PersonFamilyOverview({ personId, personName, personGender, sessionUserId, isAdmin = false, onOpenPerson, onChanged }: Props) {
  const [rows, setRows] = useState<KinshipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [activeSlot, setActiveSlot] = useState<RelationSlot | null>(null)
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [name, setName] = useState('')
  const [existingId, setExistingId] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    const kinship = await supabase.rpc('get_person_kinship', { p_person_id: personId })

    if (!kinship.error) {
      const direct = ((kinship.data ?? []) as KinshipRow[]).filter((row) => ['parent', 'spouse', 'child', 'sibling'].includes(row.relation_type))
      const deduped = new Map<string, KinshipRow>()
      direct.forEach((row) => {
        const key = `${row.relation_type}:${row.related_person_id}`
        const current = deduped.get(key)
        if (!current || (current.is_inferred && !row.is_inferred)) deduped.set(key, row)
      })
      setRows([...deduped.values()])
      setLoading(false)
      return
    }

    const fallback = await supabase.from('person_relationships')
      .select('source_person_id,target_person_id,relation_type,source:people!person_relationships_source_person_id_fkey(id,full_name,gender),target:people!person_relationships_target_person_id_fkey(id,full_name,gender)')
      .eq('status', 'approved')
      .or(`source_person_id.eq.${personId},target_person_id.eq.${personId}`)

    const mapped: KinshipRow[] = (fallback.data ?? []).flatMap((item: any) => {
      const currentIsSource = item.source_person_id === personId
      const value = currentIsSource ? item.target : item.source
      const other = Array.isArray(value) ? value[0] : value
      if (!other?.id || !other?.full_name) return []
      return [{
        related_person_id: other.id,
        full_name: other.full_name,
        gender: other.gender ?? null,
        relation_type: fallbackRelationType(item.relation_type, currentIsSource),
        is_inferred: false,
      }]
    })
    setRows(mapped)
    setLoading(false)
  }, [personId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!activeSlot || typeof document === 'undefined') return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setActiveSlot(null)
    }
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [activeSlot, busy])

  const grouped = useMemo(() => {
    const map = new Map<string, KinshipRow[]>()
    for (const row of rows) {
      const bucket = map.get(row.relation_type) ?? []
      bucket.push(row)
      map.set(row.relation_type, bucket)
    }
    return map
  }, [rows])

  const parents = grouped.get('parent') ?? []
  const spouses = grouped.get('spouse') ?? []
  const children = grouped.get('child') ?? []
  const siblings = grouped.get('sibling') ?? []
  const hasFather = parents.some((row) => row.gender === 'male')
  const hasMother = parents.some((row) => row.gender === 'female')

  function openAdd(slot: RelationSlot) {
    setActiveSlot(slot)
    setMode('new')
    setName('')
    setExistingId('')
    setMessage('')
  }

  function closeAdd() {
    if (busy) return
    setActiveSlot(null)
    setName('')
    setExistingId('')
  }

  function selectExistingPerson(selectedPersonId: string) {
    setExistingId(selectedPersonId)
    setMode('existing')
    setMessage('تم اختيار الشخص الموجود في الدليل. يمكنك الآن إضافته مباشرة بهذه الصلة.')
  }

  async function finish(result: string) {
    setBusy(false)
    setActiveSlot(null)
    setName('')
    setExistingId('')
    const pending = result === 'pending'
    setMessage(result === 'exists' ? 'هذه الصلة مسجلة بالفعل.' : pending ? 'تم إرسال الإضافة للمراجعة. ستظهر بعد الاعتماد.' : 'تمت الإضافة في مكانها داخل الملف.')
    await load()
    await onChanged?.()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !sessionUserId || !activeSlot) return
    const config = slotConfig[activeSlot]
    setBusy(true)
    setMessage('')

    if (mode === 'existing') {
      if (!existingId) { setBusy(false); setMessage('اختر الشخص الموجود أولًا.'); return }
      const { data, error } = await supabase.rpc('link_person_in_context', {
        p_anchor_person_id: personId,
        p_existing_person_id: existingId,
        p_relation_slot: activeSlot,
      })
      if (error) { setBusy(false); setMessage(error.message.includes('gender') ? `السجل المختار لا يطابق نوع ${config.relationLabel}.` : 'تعذر حفظ الصلة. حاول مرة أخرى.'); return }
      await finish(String(data ?? (isAdmin ? 'approved' : 'pending')))
      return
    }

    if (name.trim().length < 3) { setBusy(false); setMessage('اكتب الاسم الكامل.'); return }
    const { error } = await supabase.rpc('create_person_in_context', {
      p_full_name: name.trim(),
      p_gender: config.gender,
      p_family_id: null,
      p_anchor_person_id: personId,
      p_relation_slot: activeSlot,
    })
    if (error) { setBusy(false); setMessage('تعذر إنشاء الشخص وربطه. تحقق من البيانات وحاول مرة أخرى.'); return }
    await finish(isAdmin ? 'approved' : 'pending')
  }

  function PersonChip({ row }: { row: KinshipRow }) {
    return <button className="family-overview-person" type="button" onClick={() => onOpenPerson(row.related_person_id)}>
      <span className={row.gender === 'female' ? 'female' : ''}>{row.full_name.trim().charAt(0) || '؟'}</span>
      <strong>{row.full_name}</strong>
      {row.is_inferred && <small title="مستنتجة من النسب">✦</small>}
    </button>
  }

  function AddButton({ slot }: { slot: RelationSlot }) {
    if (!sessionUserId) return null
    return <button className="family-overview-add" type="button" onClick={() => openAdd(slot)}>＋ {slotConfig[slot].label.replace('إضافة ', '')}</button>
  }

  const addModal = activeSlot && typeof document !== 'undefined' ? createPortal(
    <div className="record-edit-overlay person-add-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeAdd()}>
      <section className="record-edit-sheet person-add-sheet" role="dialog" aria-modal="true" aria-label={slotConfig[activeSlot].label}>
        <div className="record-edit-heading">
          <div><span>إضافة من داخل الملف</span><h2>{slotConfig[activeSlot].label} لـ {personName}</h2></div>
          <button type="button" onClick={closeAdd} aria-label="إغلاق">×</button>
        </div>

        <div className="context-sheet-mode">
          <button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}>شخص جديد</button>
          <button type="button" className={mode === 'existing' ? 'active' : ''} onClick={() => setMode('existing')}>موجود في الدليل</button>
        </div>

        <form className="record-edit-form person-add-form" onSubmit={submit}>
          {mode === 'new' ? <>
            <label><span>الاسم الكامل *</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="اكتب الاسم فقط" required /></label>
            <DuplicatePersonCheck name={name} onOpenPerson={selectExistingPerson} />
            <div className="context-auto-note"><b>{slotConfig[activeSlot].relationLabel}</b><span>سيتم تحديد الجنس والصلة تلقائيًا، ثم يُحدّث النسب والأسرة من العلاقات المعتمدة دون اختيار عائلة يدويًا.</span></div>
          </> : <PeoplePicker label={`اختر ${slotConfig[activeSlot].relationLabel} من الدليل`} value={existingId} onChange={setExistingId} excludeId={personId} required />}
          {message && <div className="context-sheet-error">{message}</div>}
          <button className="primary context-sheet-submit" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : isAdmin ? 'إضافة مباشرة' : 'إرسال للمراجعة'}</button>
        </form>
      </section>
    </div>,
    document.body,
  ) : null

  return <section className="family-overview-card detail-section" aria-label={`الأسرة المباشرة لـ ${personName}`}>
    <header className="family-overview-heading">
      <div><span className="eyebrow">الأسرة والنسب</span><h2>الأسرة المباشرة</h2><p>أهم معلومات النسب والعلاقات في شاشة واحدة. الأسرة تتكون تلقائيًا من الزواج وعلاقات الأب والأم المعتمدة.</p></div>
      <span className="family-overview-count">{rows.length}</span>
    </header>

    <LineageSummaryCard personId={personId} personName={personName} onOpenPerson={onOpenPerson} />

    {message && <div className="family-overview-message" role="status">{message}</div>}

    {loading ? <div className="family-overview-loading">جارٍ تجهيز العلاقات…</div> : <div className="family-overview-sections">
      <section className="family-overview-row">
        <div className="family-overview-row-title"><span>الوالدان</span><small>{parents.length || '—'}</small></div>
        <div className="family-overview-people">{parents.map((row) => <PersonChip row={row} key={`parent-${row.related_person_id}`} />)}</div>
        <div className="family-overview-adds">{!hasFather && <AddButton slot="father" />}{!hasMother && <AddButton slot="mother" />}</div>
      </section>

      <section className="family-overview-row">
        <div className="family-overview-row-title"><span>الزوج / الزوجة</span><small>{spouses.length || '—'}</small></div>
        <div className="family-overview-people">{spouses.map((row) => <PersonChip row={row} key={`spouse-${row.related_person_id}`} />)}</div>
        <div className="family-overview-adds"><AddButton slot={personGender === 'female' ? 'husband' : 'wife'} /></div>
      </section>

      <section className="family-overview-row">
        <div className="family-overview-row-title"><span>الأبناء</span><small>{children.length || '—'}</small></div>
        <div className="family-overview-people">{children.map((row) => <PersonChip row={row} key={`child-${row.related_person_id}`} />)}</div>
        <div className="family-overview-adds"><AddButton slot="son" /><AddButton slot="daughter" /></div>
      </section>

      <section className="family-overview-row">
        <div className="family-overview-row-title"><span>الإخوة والأخوات</span><small>{siblings.length || '—'}</small></div>
        <div className="family-overview-people">{siblings.map((row) => <PersonChip row={row} key={`sibling-${row.related_person_id}`} />)}</div>
        <div className="family-overview-adds"><AddButton slot="brother" /><AddButton slot="sister" /></div>
      </section>
    </div>}

    {addModal}
  </section>
}
