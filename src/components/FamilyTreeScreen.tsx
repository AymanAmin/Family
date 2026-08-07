import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import PeoplePicker from './PeoplePicker'
import KinshipNetwork from './KinshipNetwork'

type PersonSummary = {
  id: string
  full_name: string
  gender: 'male' | 'female' | null
  birth_year: number | null
  family_id: string | null
  families?: { name?: string } | { name?: string }[] | null
}

type PathRow = {
  step_no: number
  person_id: string
  full_name: string
  gender: 'male' | 'female' | null
  relation_type: string
  is_inferred: boolean
}

type Props = {
  initialPersonId?: string | null
  onOpenPerson: (personId: string) => void
  onAddRelation: (personId?: string) => void
}

type Mode = 'tree' | 'path'

function familyName(value: PersonSummary['families']) {
  if (!value) return ''
  return Array.isArray(value) ? value[0]?.name ?? '' : value.name ?? ''
}

function relationLabel(type: string, gender: string | null) {
  if (type === 'self') return 'البداية'
  if (type === 'parent') return gender === 'female' ? 'أم' : gender === 'male' ? 'أب' : 'والد/والدة'
  if (type === 'child') return gender === 'female' ? 'ابنة' : gender === 'male' ? 'ابن' : 'ابن/ابنة'
  if (type === 'sibling') return gender === 'female' ? 'أخت' : gender === 'male' ? 'أخ' : 'أخ/أخت'
  if (type === 'spouse') return gender === 'female' ? 'زوجة' : gender === 'male' ? 'زوج' : 'زوج/زوجة'
  if (type === 'guardian') return 'وصاية'
  return 'صلة'
}

export default function FamilyTreeScreen({ initialPersonId, onOpenPerson, onAddRelation }: Props) {
  const [mode, setMode] = useState<Mode>('tree')
  const [focusId, setFocusId] = useState(initialPersonId ?? '')
  const [focus, setFocus] = useState<PersonSummary | null>(null)
  const [focusLoading, setFocusLoading] = useState(false)
  const [fromId, setFromId] = useState(initialPersonId ?? '')
  const [toId, setToId] = useState('')
  const [path, setPath] = useState<PathRow[]>([])
  const [pathLoading, setPathLoading] = useState(false)
  const [pathMessage, setPathMessage] = useState('')

  useEffect(() => {
    if (!initialPersonId) return
    setFocusId((current) => current || initialPersonId)
    setFromId((current) => current || initialPersonId)
  }, [initialPersonId])

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

  const pathTitle = useMemo(() => {
    if (path.length < 2) return ''
    return `${path[0]?.full_name ?? ''} ← ${path[path.length - 1]?.full_name ?? ''}`
  }, [path])

  async function discoverPath() {
    if (!supabase || !fromId || !toId) {
      setPathMessage('اختر شخصين أولًا.')
      return
    }
    if (fromId === toId) {
      setPathMessage('اختر شخصين مختلفين.')
      return
    }

    setPathLoading(true)
    setPath([])
    setPathMessage('')
    const { data, error } = await supabase.rpc('get_kinship_path', {
      p_from_person_id: fromId,
      p_to_person_id: toId,
      p_max_depth: 6,
    })
    setPathLoading(false)

    if (error) {
      const unavailable = error.message.toLowerCase().includes('does not exist') || error.message.toLowerCase().includes('schema cache')
      setPathMessage(unavailable ? 'فعّل migration مسار القرابة في Supabase لاستخدام هذه الأداة.' : 'تعذر حساب مسار القرابة الآن.')
      return
    }

    const rows = (data ?? []) as PathRow[]
    setPath(rows)
    setPathMessage(rows.length ? '' : 'لم نجد مسار قرابة موثقًا بين الشخصين ضمن ست درجات.')
  }

  return (
    <section className="family-tree-page">
      <header className="family-tree-hero">
        <div className="tree-hero-mark" aria-hidden="true">
          <span className="tree-dot d1" /><span className="tree-dot d2" /><span className="tree-dot d3" /><span className="tree-dot d4" /><i />
        </div>
        <div>
          <span className="tree-kicker">شجرة صلة</span>
          <h1>اكتشف عائلتك بصريًا</h1>
          <p>ابدأ من شخص واحد فقط. تُحمّل المنصة شبكة قرابته عند الطلب بدون جلب دليل الأشخاص كاملًا.</p>
        </div>
      </header>

      <nav className="tree-mode-tabs" aria-label="أدوات شجرة العائلة">
        <button type="button" className={mode === 'tree' ? 'active' : ''} onClick={() => setMode('tree')}><span>⌘</span><b>الشجرة</b><small>العلاقات حول شخص</small></button>
        <button type="button" className={mode === 'path' ? 'active' : ''} onClick={() => setMode('path')}><span>↝</span><b>مسار القرابة</b><small>ما صلة شخص بآخر؟</small></button>
      </nav>

      {mode === 'tree' ? (
        <div className="tree-workspace">
          <section className="tree-focus-card">
            <div className="tree-card-heading"><div><span>نقطة البداية</span><h2>اختر شخصًا لبناء المشهد</h2></div>{focus && <button type="button" onClick={() => onOpenPerson(focus.id)}>فتح الملف</button>}</div>
            <PeoplePicker label="الشخص المحوري" value={focusId} onChange={(id) => { setFocusId(id); if (id && !fromId) setFromId(id) }} />
            {focusLoading && <div className="tree-inline-loading">جارٍ تجهيز الشجرة…</div>}
            {focus && !focusLoading && (
              <div className="tree-focus-summary">
                <span className={`tree-focus-avatar ${focus.gender === 'female' ? 'female' : ''}`}>{focus.full_name.trim().charAt(0) || '؟'}</span>
                <div><strong>{focus.full_name}</strong><small>{familyName(focus.families) || 'العائلة غير محددة'}{focus.birth_year ? ` · ${focus.birth_year}` : ''}</small></div>
                <button type="button" onClick={() => onAddRelation(focus.id)}>＋ صلة</button>
              </div>
            )}
          </section>

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
            <div className="tree-card-heading"><div><span>اكتشاف ذكي</span><h2>ما صلة فلان بفلان؟</h2></div></div>
            <div className="path-pickers">
              <PeoplePicker label="من" value={fromId} onChange={(id) => { setFromId(id); setPath([]); setPathMessage('') }} excludeId={toId || undefined} required />
              <span className="path-switch" aria-hidden="true">↔</span>
              <PeoplePicker label="إلى" value={toId} onChange={(id) => { setToId(id); setPath([]); setPathMessage('') }} excludeId={fromId || undefined} required />
            </div>
            <button className="path-discover-button" type="button" disabled={pathLoading || !fromId || !toId} onClick={() => void discoverPath()}>{pathLoading ? 'جارٍ تحليل شجرة النسب…' : 'اكتشف صلة القرابة'}</button>
          </section>

          {path.length > 0 && (
            <section className="path-result-card">
              <header><div><span>أقصر مسار موثق</span><h3>{pathTitle}</h3></div><b>{Math.max(0, path.length - 1)} درجات</b></header>
              <div className="kinship-path-strip">
                {path.map((step, index) => (
                  <div className="path-step-wrap" key={`${step.person_id}-${step.step_no}`}>
                    {index > 0 && <span className="path-connector"><b>{relationLabel(step.relation_type, step.gender)}</b>{step.is_inferred && <small>✦ مستنتج</small>}<i>←</i></span>}
                    <button className="path-person-node" type="button" onClick={() => onOpenPerson(step.person_id)}>
                      <span>{step.full_name.trim().charAt(0) || '؟'}</span>
                      <strong>{step.full_name}</strong>
                    </button>
                  </div>
                ))}
              </div>
              <p className="path-footnote">النتيجة تعتمد فقط على العلاقات المعتمدة في المنصة، وقد تتحسن تلقائيًا كلما اكتملت بيانات النسب.</p>
            </section>
          )}

          {pathMessage && <div className="tree-path-message">{pathMessage}</div>}
        </div>
      )}
    </section>
  )
}
