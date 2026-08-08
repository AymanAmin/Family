import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import '../lineage-profile.css'

type Gender = 'male' | 'female' | null

type LineagePathItem = {
  person_id: string
  full_name: string
  generation: number
}

type LineageContext = {
  lineage_id: string
  lineage_name: string
  root_person_id: string
  root_name: string
  generation: number
  branch_person_id: string | null
  branch_name: string | null
  ancestry_path: LineagePathItem[] | null
}

type AncestorRow = {
  ancestor_person_id: string
  full_name: string
  gender: Gender
  generation: number
}

type DescendantRow = {
  person_id: string
  full_name: string
  gender: Gender
  generation: number
  parent_person_id: string | null
}

type FamilyUnit = {
  id: string
  display_name: string
  husband_person_id: string
  wife_person_id: string
}

type Props = {
  personId: string
  personName: string
  onOpenPerson?: (personId: string) => void
  compact?: boolean
}

type Panel = 'ancestors' | 'descendants' | null

function asPath(value: unknown): LineagePathItem[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is LineagePathItem => Boolean(
    item && typeof item === 'object' && 'person_id' in item && 'full_name' in item,
  ))
}

function ancestorGenerationLabel(generation: number) {
  if (generation === 1) return 'الوالدان'
  if (generation === 2) return 'الأجداد'
  return `الأصول · الجيل ${generation}`
}

function descendantGenerationLabel(generation: number) {
  if (generation === 1) return 'الأبناء'
  if (generation === 2) return 'الأحفاد'
  return `الذرية · الجيل ${generation}`
}

export default function LineageSummaryCard({ personId, personName, onOpenPerson, compact = false }: Props) {
  const [context, setContext] = useState<LineageContext | null>(null)
  const [familyUnits, setFamilyUnits] = useState<FamilyUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [panel, setPanel] = useState<Panel>(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const [ancestors, setAncestors] = useState<AncestorRow[]>([])
  const [descendants, setDescendants] = useState<DescendantRow[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!supabase || !personId) {
        setLoading(false)
        return
      }

      setLoading(true)
      const [contextResult, unitsResult] = await Promise.all([
        supabase.rpc('get_person_lineage_context', { p_person_id: personId }),
        supabase
          .from('family_units')
          .select('id,display_name,husband_person_id,wife_person_id')
          .eq('status', 'approved')
          .or(`husband_person_id.eq.${personId},wife_person_id.eq.${personId}`)
          .order('created_at'),
      ])

      if (cancelled) return

      if (!contextResult.error) {
        const first = ((contextResult.data ?? []) as LineageContext[])[0] ?? null
        setContext(first ? { ...first, ancestry_path: asPath(first.ancestry_path) } : null)
      } else {
        setContext(null)
      }

      if (!unitsResult.error) setFamilyUnits((unitsResult.data ?? []) as FamilyUnit[])
      setLoading(false)
    }

    void load()
    return () => { cancelled = true }
  }, [personId])

  useEffect(() => {
    setPanel(null)
    setAncestors([])
    setDescendants([])
    setMessage('')
  }, [personId])

  const ancestryPath = useMemo(() => asPath(context?.ancestry_path), [context])

  const groupedAncestors = useMemo(() => {
    const groups = new Map<number, AncestorRow[]>()
    ancestors.forEach((row) => groups.set(row.generation, [...(groups.get(row.generation) ?? []), row]))
    return [...groups.entries()].sort(([a], [b]) => a - b)
  }, [ancestors])

  const groupedDescendants = useMemo(() => {
    const groups = new Map<number, DescendantRow[]>()
    descendants.filter((row) => row.generation > 0).forEach((row) => groups.set(row.generation, [...(groups.get(row.generation) ?? []), row]))
    return [...groups.entries()].sort(([a], [b]) => a - b)
  }, [descendants])

  async function togglePanel(next: Exclude<Panel, null>) {
    if (panel === next) {
      setPanel(null)
      return
    }

    setPanel(next)
    setMessage('')
    if (!supabase) return
    if (next === 'ancestors' && ancestors.length) return
    if (next === 'descendants' && descendants.length) return

    setPanelLoading(true)
    if (next === 'ancestors') {
      const { data, error } = await supabase.rpc('get_person_ancestors', { p_person_id: personId, p_max_depth: 8 })
      if (error) setMessage('تعذر تحميل الأجداد الآن.')
      else setAncestors((data ?? []) as AncestorRow[])
    } else {
      const { data, error } = await supabase.rpc('get_lineage_descendants', { p_ancestor_person_id: personId, p_max_depth: 5 })
      if (error) setMessage('تعذر تحميل الذرية الآن.')
      else setDescendants(((data ?? []) as DescendantRow[]).slice(0, 120))
    }
    setPanelLoading(false)
  }

  function PersonButton({ id, name, gender }: { id: string; name: string; gender?: Gender }) {
    return (
      <button className="lineage-person-chip" type="button" onClick={() => onOpenPerson?.(id)} disabled={!onOpenPerson}>
        <span className={gender === 'female' ? 'female' : ''}>{name.trim().charAt(0) || '؟'}</span>
        <strong>{name}</strong>
      </button>
    )
  }

  return (
    <section className={`lineage-summary-card ${compact ? 'compact' : ''}`} aria-label={`ملخص نسب ${personName}`}>
      <header className="lineage-summary-heading">
        <div>
          <span className="eyebrow">النسب</span>
          <h3>{context ? 'الأصل والفرع' : 'مسار النسب'}</h3>
          {!compact && <p>ملخص سريع؛ التفاصيل تظهر فقط عند طلبها.</p>}
        </div>
        {context && <span className="lineage-generation-badge">ج{context.generation}</span>}
      </header>

      {loading ? <div className="lineage-summary-loading">جارٍ تجهيز النسب…</div> : (
        <>
          {context ? (
            <>
              <div className="lineage-facts">
                <article><small>الأصل</small><strong>{context.root_name || context.lineage_name}</strong></article>
                <article><small>الفرع</small><strong>{context.branch_name || 'الجذر'}</strong></article>
                <article><small>الجيل</small><strong>{context.generation === 0 ? 'الجد الأعلى' : `الجيل ${context.generation}`}</strong></article>
              </div>

              {ancestryPath.length > 1 && (
                <div className="lineage-breadcrumb" aria-label="مسار الأصل">
                  {ancestryPath.map((item, index) => (
                    <span className="lineage-breadcrumb-step" key={`${item.person_id}-${index}`}>
                      {index > 0 && <i aria-hidden="true">←</i>}
                      <button type="button" onClick={() => onOpenPerson?.(item.person_id)} disabled={!onOpenPerson}>{item.full_name}</button>
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="lineage-empty-note">لم يُحدد جد أعلى لهذا المسار بعد. يمكن الاستمرار بإضافة الوالدين والأبناء بصورة طبيعية.</div>
          )}

          {familyUnits.length > 0 && (
            <div className="lineage-family-units">
              <small>الأسرة الزوجية</small>
              <div>{familyUnits.map((unit) => <span key={unit.id}>{unit.display_name}</span>)}</div>
            </div>
          )}

          <div className="lineage-quick-actions">
            <button type="button" className={panel === 'ancestors' ? 'active' : ''} onClick={() => void togglePanel('ancestors')}>↑ الأجداد</button>
            <button type="button" className={panel === 'descendants' ? 'active' : ''} onClick={() => void togglePanel('descendants')}>↓ الذرية</button>
          </div>

          {message && <div className="lineage-panel-message">{message}</div>}
          {panelLoading && <div className="lineage-summary-loading compact">جارٍ التحميل…</div>}

          {!panelLoading && panel === 'ancestors' && (
            <div className="lineage-generation-list">
              {groupedAncestors.length ? groupedAncestors.map(([generation, people]) => (
                <section key={`ancestor-${generation}`}>
                  <header><strong>{ancestorGenerationLabel(generation)}</strong><small>{people.length}</small></header>
                  <div>{people.map((person) => <PersonButton id={person.ancestor_person_id} name={person.full_name} gender={person.gender} key={person.ancestor_person_id} />)}</div>
                </section>
              )) : <div className="lineage-empty-note small">لا توجد أصول مسجلة أعلى هذا الشخص.</div>}
            </div>
          )}

          {!panelLoading && panel === 'descendants' && (
            <div className="lineage-generation-list">
              {groupedDescendants.length ? groupedDescendants.map(([generation, people]) => (
                <section key={`descendant-${generation}`}>
                  <header><strong>{descendantGenerationLabel(generation)}</strong><small>{people.length}</small></header>
                  <div>{people.map((person) => <PersonButton id={person.person_id} name={person.full_name} gender={person.gender} key={person.person_id} />)}</div>
                </section>
              )) : <div className="lineage-empty-note small">لا توجد ذرية مسجلة لهذا الشخص.</div>}
            </div>
          )}
        </>
      )}
    </section>
  )
}
