import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import PeoplePicker from './PeoplePicker'
import KinshipNetwork from './KinshipNetwork'
import LineageSummaryCard from './LineageSummaryCard'
import KinshipPathGraph, { type KinshipPathStep } from './KinshipPathGraph'
import KinshipPathImageShare from './KinshipPathImageShare'
import '../kinship-path-summary.css'
import '../kinship-engine.css'

type PersonSummary = {
  id: string
  full_name: string
  gender: 'male' | 'female' | null
  birth_year: number | null
  family_id: string | null
  families?: { name?: string } | { name?: string }[] | null
}

type PathRow = KinshipPathStep

type KinshipResult = {
  from_person_id: string
  from_name: string
  to_person_id: string
  to_name: string
  relationship_code: string
  relationship_label: string
  relationship_detail: string
  confidence: 'high' | 'medium' | 'unknown'
  data_status: 'confirmed' | 'partial' | 'insufficient'
  degree: number | null
  is_blood_relation: boolean
  via_marriage: boolean
  common_ancestor_id: string | null
  common_ancestor_name: string | null
  from_common_depth: number | null
  to_common_depth: number | null
  missing_from_parent_slots: number
  missing_to_parent_slots: number
  from_known_ancestor_depth: number
  to_known_ancestor_depth: number
  path: PathRow[] | null
}

type Props = {
  initialPersonId?: string | null
  onOpenPerson: (personId: string) => void
  onAddPerson: (personId?: string) => void
  onAddRelation: (personId?: string) => void
}

type Mode = 'tree' | 'path'

type SharedKinshipSelection = { fromId: string; toId: string }

const ENGINE_MAX_DEPTH = 8
const LEGACY_PATH_MAX_DEPTH = 6

function familyName(value: PersonSummary['families']) {
  if (!value) return ''
  return Array.isArray(value) ? value[0]?.name ?? '' : value.name ?? ''
}

function confidenceLabel(value: KinshipResult['confidence']) {
  if (value === 'high') return 'ثقة عالية'
  if (value === 'medium') return 'ثقة متوسطة'
  return 'غير محسوم'
}

function safePath(value: KinshipResult['path'] | unknown): PathRow[] {
  return Array.isArray(value) ? value as PathRow[] : []
}

function commonAncestorLabel(result: KinshipResult) {
  const ancestorGender = safePath(result.path).find((step) => step.person_id === result.common_ancestor_id)?.gender
  if (ancestorGender === 'male') return 'الجد المشترك'
  if (ancestorGender === 'female') return 'الجدة المشتركة'
  return 'السلف المشترك'
}

function missingParentsLabel(count: number) {
  if (count <= 0) return 'الوالدان المباشران مسجلان'
  if (count === 1) return 'ينقص أحد الوالدين'
  return 'الوالدان غير مكتملين'
}

function sharedKinshipSelection(): SharedKinshipSelection | null {
  if (typeof window === 'undefined') return null
  const params = new URL(window.location.href).searchParams
  if (params.get('kinshipMode') !== 'path') return null
  const fromId = params.get('kinshipFrom')?.trim() || ''
  const toId = params.get('kinshipTo')?.trim() || ''
  return fromId && toId && fromId !== toId ? { fromId, toId } : null
}

export default function FamilyTreeScreen({ initialPersonId, onOpenPerson, onAddPerson, onAddRelation }: Props) {
  const sharedSelectionRef = useRef<SharedKinshipSelection | null>(sharedKinshipSelection())
  const sharedAutoStartedRef = useRef(false)
  const [mode, setMode] = useState<Mode>(sharedSelectionRef.current ? 'path' : 'tree')
  const [focusId, setFocusId] = useState(initialPersonId ?? '')
  const [focus, setFocus] = useState<PersonSummary | null>(null)
  const [focusLoading, setFocusLoading] = useState(false)
  const [fromId, setFromId] = useState(sharedSelectionRef.current?.fromId ?? initialPersonId ?? '')
  const [toId, setToId] = useState(sharedSelectionRef.current?.toId ?? '')
  const [path, setPath] = useState<PathRow[]>([])
  const [kinshipResult, setKinshipResult] = useState<KinshipResult | null>(null)
  const [pathLoading, setPathLoading] = useState(false)
  const [pathMessage, setPathMessage] = useState('')
  const pathRequestRef = useRef(0)

  useEffect(() => {
    if (!initialPersonId || sharedSelectionRef.current) return
    setFocusId((current) => current || initialPersonId)
    setFromId((current) => current || initialPersonId)
  }, [initialPersonId])

  useEffect(() => () => {
    pathRequestRef.current += 1
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadFocus() {
      if (!supabase || !focusId) {
        setFocus(null)
        return
      }
      setFocusLoading(true)
      const { data } = await supabase
        .from('people')
        .select('id,full_name,gender,birth_year,family_id,families(name)')
        .eq('id', focusId)
        .eq('status', 'approved')
        .maybeSingle()
      if (cancelled) return
      setFocus((data as PersonSummary | null) ?? null)
      setFocusLoading(false)
    }
    void loadFocus()
    return () => { cancelled = true }
  }, [focusId])

  function clearPathResult() {
    pathRequestRef.current += 1
    setPathLoading(false)
    setPath([])
    setKinshipResult(null)
    setPathMessage('')
  }

  async function discoverLegacyPath(requestId: number) {
    if (!supabase) return
    const { data, error } = await supabase.rpc('get_kinship_path', {
      p_from_person_id: fromId,
      p_to_person_id: toId,
      p_max_depth: LEGACY_PATH_MAX_DEPTH,
    })
    if (requestId !== pathRequestRef.current) return
    setPathLoading(false)
    if (error) {
      setPathMessage('تعذر حساب صلة القرابة الآن. أعد المحاولة.')
      return
    }
    const rows = (data ?? []) as PathRow[]
    setPath(rows)
    setPathMessage(rows.length
      ? 'تم عرض المسار المسجل، لكن المسمى الذكي غير متاح مؤقتًا.'
      : 'البيانات الحالية غير كافية لإثبات مسار بين الشخصين.')
  }

  async function discoverPath() {
    if (!supabase || !fromId || !toId) {
      setPathMessage('اختر شخصين أولًا.')
      return
    }
    if (fromId === toId) {
      setPathMessage('اختر شخصين مختلفين.')
      return
    }

    const requestId = ++pathRequestRef.current
    setPathLoading(true)
    setPathMessage('')
    setPath([])
    setKinshipResult(null)

    const { data, error } = await supabase.rpc('get_kinship_relationship', {
      p_from_person_id: fromId,
      p_to_person_id: toId,
      p_max_depth: ENGINE_MAX_DEPTH,
    })

    if (requestId !== pathRequestRef.current) return

    if (error) {
      const lowered = error.message.toLowerCase()
      const unavailable = lowered.includes('does not exist') || lowered.includes('schema cache') || lowered.includes('could not find the function')
      if (unavailable) {
        await discoverLegacyPath(requestId)
        return
      }
      setPathLoading(false)
      const timedOut = lowered.includes('statement timeout') || lowered.includes('57014') || lowered.includes('canceling statement')
      setPathMessage(timedOut
        ? 'استغرق تحليل القرابة وقتًا أطول من المتوقع. أعد المحاولة بعد لحظة.'
        : 'تعذر تحليل صلة القرابة الآن. أعد المحاولة.')
      return
    }

    setPathLoading(false)
    const row = ((data ?? [])[0] ?? null) as KinshipResult | null
    if (!row) {
      setPathMessage('تعذر قراءة بيانات أحد الشخصين أو أن السجل غير متاح.')
      return
    }

    const rows = safePath(row.path)
    setKinshipResult({ ...row, path: rows })
    setPath(rows)
  }

  useEffect(() => {
    const shared = sharedSelectionRef.current
    if (!shared || sharedAutoStartedRef.current || mode !== 'path') return
    if (fromId !== shared.fromId || toId !== shared.toId) return
    sharedAutoStartedRef.current = true
    void discoverPath()
  }, [mode, fromId, toId])

  const pathFromName = kinshipResult?.from_name || path[0]?.full_name || ''
  const pathToName = kinshipResult?.to_name || path[path.length - 1]?.full_name || ''
  const pathTitle = pathFromName && pathToName ? `${pathFromName} ← ${pathToName}` : ''

  return (
    <section className="family-tree-page">
      <header className="family-tree-hero">
        <div className="tree-hero-mark" aria-hidden="true">
          <span className="tree-dot d1" /><span className="tree-dot d2" /><span className="tree-dot d3" /><span className="tree-dot d4" /><i />
        </div>
        <div>
          <span className="tree-kicker">شجرة صلة</span>
          <h1>النسب والعلاقات</h1>
          <p>اختر شخصًا واحدًا لعرض أصله وفرعه وأقرب علاقاته، وافتح التفاصيل فقط عند الحاجة.</p>
        </div>
      </header>

      <nav className="tree-mode-tabs" aria-label="أدوات شجرة العائلة">
        <button type="button" className={mode === 'tree' ? 'active' : ''} onClick={() => setMode('tree')}><span>⌘</span><b>الشجرة</b><small>العلاقات حول شخص</small></button>
        <button type="button" className={mode === 'path' ? 'active' : ''} onClick={() => setMode('path')}><span>↝</span><b>صلة القرابة</b><small>ما صلة شخص بآخر؟</small></button>
      </nav>

      {mode === 'tree' ? (
        <div className="tree-workspace">
          <section className="tree-focus-card">
            <div className="tree-card-heading"><div><span>نقطة البداية</span><h2>اختر شخصًا</h2></div>{focus && <button type="button" onClick={() => onOpenPerson(focus.id)}>فتح الملف</button>}</div>
            <PeoplePicker searchMode="broad" label="الشخص المحوري" value={focusId} onChange={(id) => { setFocusId(id); if (id && !fromId) setFromId(id) }} />
            {focusLoading && <div className="tree-inline-loading">جارٍ تجهيز الشجرة…</div>}
            {focus && !focusLoading && (
              <div className="tree-focus-summary">
                <span className={`tree-focus-avatar ${focus.gender === 'female' ? 'female' : ''}`}>{focus.full_name.trim().charAt(0) || '؟'}</span>
                <div><strong>{focus.full_name}</strong><small>{familyName(focus.families) || 'العائلة غير محددة'}{focus.birth_year ? ` · ${focus.birth_year}` : ''}</small></div>
                <div className="tree-focus-actions">
                  <button type="button" className="tree-add-person" onClick={() => onAddPerson(focus.id)}>＋ فرد</button>
                  <button type="button" onClick={() => onAddRelation(focus.id)}>＋ صلة</button>
                </div>
              </div>
            )}
          </section>

          {focus && !focusLoading && <LineageSummaryCard compact personId={focus.id} personName={focus.full_name} onOpenPerson={onOpenPerson} />}

          {focus ? (
            <KinshipNetwork personId={focus.id} personName={focus.full_name} onOpenPerson={onOpenPerson} onAddRelation={() => onAddRelation(focus.id)} />
          ) : (
            <section className="tree-empty-stage">
              <div className="tree-empty-visual" aria-hidden="true"><span className="root">؟</span><span className="node n1" /><span className="node n2" /><span className="node n3" /><span className="node n4" /></div>
              <strong>اختر شخصًا لتبدأ الشجرة</strong>
              <p>لن نحمل أي علاقات قبل اختيار الشخص، للحفاظ على سرعة التطبيق حتى مع قاعدة بيانات كبيرة.</p>
            </section>
          )}
        </div>
      ) : (
        <div className="kinship-path-workspace">
          <section className="path-picker-card">
            <div className="tree-card-heading"><div><span>محرك القرابة</span><h2>ما صلة فلان بفلان؟</h2></div></div>
            <div className="path-pickers">
              <PeoplePicker searchMode="broad" label="من" value={fromId} onChange={(id) => { clearPathResult(); setFromId(id) }} excludeId={toId || undefined} required />
              <span className="path-switch" aria-hidden="true">↔</span>
              <PeoplePicker searchMode="broad" label="إلى" value={toId} onChange={(id) => { clearPathResult(); setToId(id) }} excludeId={fromId || undefined} required />
            </div>
            <button className="path-discover-button" type="button" disabled={pathLoading || !fromId || !toId} onClick={() => void discoverPath()}>{pathLoading ? 'جارٍ تحليل النسب والمصاهرة…' : 'اكتشف صلة القرابة'}</button>
          </section>

          {kinshipResult && (
            <section className={`kinship-engine-card ${kinshipResult.data_status}`} aria-label="نتيجة صلة القرابة">
              <div className="kinship-engine-head">
                <div><small>صلة {kinshipResult.to_name} بالنسبة إلى {kinshipResult.from_name}</small><strong>{kinshipResult.relationship_label}</strong></div>
                <span className="kinship-engine-direction">{kinshipResult.data_status === 'insufficient' ? 'غير محسوم' : `${kinshipResult.degree ?? 0} درجات`}</span>
              </div>

              <div className="kinship-engine-badges">
                <span className="primary">{kinshipResult.is_blood_relation ? 'نسب' : kinshipResult.via_marriage ? 'مصاهرة' : 'صلة مسجلة'}</span>
                <span>{confidenceLabel(kinshipResult.confidence)}</span>
                {kinshipResult.common_ancestor_name && <span>{commonAncestorLabel(kinshipResult)}: {kinshipResult.common_ancestor_name}</span>}
              </div>

              <p className="kinship-engine-detail">{kinshipResult.relationship_detail}</p>

              {kinshipResult.data_status === 'insufficient' && (
                <>
                  <div className="kinship-engine-incomplete-grid">
                    <div><small>{kinshipResult.from_name}</small><strong>{missingParentsLabel(kinshipResult.missing_from_parent_slots)}</strong><span>أعلى عمق معروف: {kinshipResult.from_known_ancestor_depth} جيل</span></div>
                    <div><small>{kinshipResult.to_name}</small><strong>{missingParentsLabel(kinshipResult.missing_to_parent_slots)}</strong><span>أعلى عمق معروف: {kinshipResult.to_known_ancestor_depth} جيل</span></div>
                  </div>
                  <p className="kinship-engine-hint">يمكن مواصلة العمل وإضافة البيانات لاحقًا؛ سيعيد النظام حساب المسمى تلقائيًا عند اكتمال مسار جديد.</p>
                </>
              )}
            </section>
          )}

          {path.length > 0 && (
            <section className="path-result-card">
              <header>
                <div><span>{kinshipResult ? 'المسار الذي أثبت النتيجة' : 'أقصر مسار موثق'}</span><h3>{pathTitle}</h3></div>
                <div className="path-result-actions">
                  <b>{Math.max(0, path.length - 1)} درجات</b>
                  {kinshipResult && <KinshipPathImageShare
                    fromPersonId={kinshipResult.from_person_id}
                    toPersonId={kinshipResult.to_person_id}
                    fromName={kinshipResult.from_name}
                    toName={kinshipResult.to_name}
                    relationshipLabel={kinshipResult.relationship_label}
                    relationshipDetail={kinshipResult.relationship_detail}
                    degree={kinshipResult.degree}
                    viaMarriage={kinshipResult.via_marriage}
                    isBloodRelation={kinshipResult.is_blood_relation}
                    path={path}
                  />}
                </div>
              </header>

              <KinshipPathGraph path={path} fromPersonId={fromId} toPersonId={toId} onOpenPerson={onOpenPerson} />
              <p className="path-footnote">المخطط يرتب الأشخاص بحسب الأجيال ويُظهر الزواج والإخوة والتفرعات بصريًا. النتيجة مبنية على العلاقات المعتمدة حاليًا وتتحدث تلقائيًا كلما أضيف أب أو أم أو زواج جديد.</p>
            </section>
          )}

          {pathMessage && <div className="tree-path-message">{pathMessage}</div>}
        </div>
      )}
    </section>
  )
}
