import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import '../lineage-hierarchy.css'
import '../lineage-expand-tree.css'

type Gender = 'male' | 'female' | null

type LineageContext = {
  lineage_id: string
  lineage_name: string
  root_person_id: string
  root_name: string
  generation: number
  branch_person_id: string | null
  branch_name: string | null
  ancestry_path: Array<{ person_id: string; full_name: string; generation: number }> | null
}

type LineageOverview = {
  root_person_id: string
  descendant_count: number
  direct_children_count: number
  max_depth: number
}

type SpouseSummary = {
  family_unit_id: string
  person_id: string
  full_name: string
  gender: Gender
  display_name: string | null
  child_count: number
}

type ChildRow = {
  person_id: string
  full_name: string
  gender: Gender
  direct_child_count: number
  has_children: boolean
  branch_name: string | null
  spouses: SpouseSummary[]
}

type HouseholdRpcRow = {
  family_unit_id: string | null
  family_display_name: string | null
  spouse_person_id: string | null
  spouse_name: string | null
  spouse_gender: Gender
  child_person_id: string | null
  child_name: string | null
  child_gender: Gender
  child_direct_child_count: number
  child_has_children: boolean
  child_spouses: unknown
  group_type: 'family_unit' | 'unassigned'
}

type HouseholdGroup = {
  key: string
  family_unit_id: string | null
  family_display_name: string | null
  spouse: SpouseSummary | null
  children: ChildRow[]
  group_type: 'family_unit' | 'unassigned'
}

type Props = {
  personId: string
  personName: string
  onOpenPerson: (personId: string) => void
  onShowNetwork: () => void
}

function safePath(value: LineageContext['ancestry_path']) {
  return Array.isArray(value) ? value : []
}

function childCountLabel(count: number) {
  if (count <= 0) return 'لا أبناء مسجلون'
  if (count === 1) return 'ابن/ابنة واحدة'
  if (count === 2) return 'ابنان/ابنتان'
  return `${count} أبناء مباشرين`
}

function householdChildCountLabel(count: number) {
  if (count <= 0) return 'لا أبناء مشتركين مسجلون'
  if (count === 1) return 'ابن/ابنة واحدة'
  if (count === 2) return 'ابنان/ابنتان'
  return `${count} أبناء`
}

function spouseRoleLabel(gender: Gender) {
  if (gender === 'female') return 'الزوجة'
  if (gender === 'male') return 'الزوج'
  return 'الزوج/الزوجة'
}

function normalizeSpouses(value: unknown): SpouseSummary[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): SpouseSummary[] => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    if (typeof row.person_id !== 'string' || typeof row.full_name !== 'string' || typeof row.family_unit_id !== 'string') return []
    return [{
      family_unit_id: row.family_unit_id,
      person_id: row.person_id,
      full_name: row.full_name,
      gender: row.gender === 'male' || row.gender === 'female' ? row.gender : null,
      display_name: typeof row.display_name === 'string' ? row.display_name : null,
      child_count: typeof row.child_count === 'number' ? row.child_count : Number(row.child_count ?? 0) || 0,
    }]
  })
}

function normalizeChildRows(value: unknown): ChildRow[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): ChildRow[] => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    if (typeof row.person_id !== 'string' || typeof row.full_name !== 'string') return []
    return [{
      person_id: row.person_id,
      full_name: row.full_name,
      gender: row.gender === 'male' || row.gender === 'female' ? row.gender : null,
      direct_child_count: typeof row.direct_child_count === 'number' ? row.direct_child_count : Number(row.direct_child_count ?? 0) || 0,
      has_children: Boolean(row.has_children),
      branch_name: typeof row.branch_name === 'string' ? row.branch_name : null,
      spouses: normalizeSpouses(row.spouses),
    }]
  })
}

function groupHouseholdRows(rows: HouseholdRpcRow[]): HouseholdGroup[] {
  const groups = new Map<string, HouseholdGroup>()

  for (const row of rows) {
    const key = row.family_unit_id || '__unassigned__'
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        family_unit_id: row.family_unit_id,
        family_display_name: row.family_display_name,
        spouse: row.spouse_person_id && row.spouse_name ? {
          family_unit_id: row.family_unit_id || '',
          person_id: row.spouse_person_id,
          full_name: row.spouse_name,
          gender: row.spouse_gender,
          display_name: row.family_display_name,
          child_count: 0,
        } : null,
        children: [],
        group_type: row.group_type,
      }
      groups.set(key, group)
    }

    if (row.child_person_id && row.child_name && !group.children.some((child) => child.person_id === row.child_person_id)) {
      group.children.push({
        person_id: row.child_person_id,
        full_name: row.child_name,
        gender: row.child_gender,
        direct_child_count: Number(row.child_direct_child_count ?? 0) || 0,
        has_children: Boolean(row.child_has_children),
        branch_name: null,
        spouses: normalizeSpouses(row.child_spouses),
      })
    }
  }

  return [...groups.values()].map((group) => ({
    ...group,
    spouse: group.spouse ? { ...group.spouse, child_count: group.children.length } : null,
  }))
}

export default function LineageHierarchyView({ personId, personName, onOpenPerson, onShowNetwork }: Props) {
  const [context, setContext] = useState<LineageContext | null>(null)
  const [overview, setOverview] = useState<LineageOverview | null>(null)
  const [branches, setBranches] = useState<ChildRow[]>([])
  const [rootSpouses, setRootSpouses] = useState<SpouseSummary[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [householdsByPerson, setHouseholdsByPerson] = useState<Record<string, HouseholdGroup[]>>({})
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!supabase || !personId) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchChildren(parentId: string): Promise<ChildRow[]> {
      const { data, error } = await supabase!.rpc('get_lineage_children_v2', { p_parent_person_id: parentId })
      if (error) throw error
      return normalizeChildRows(data ?? [])
    }

    async function fetchHouseholds(parentId: string): Promise<HouseholdGroup[]> {
      const { data, error } = await supabase!.rpc('get_lineage_households_v2', { p_person_id: parentId })
      if (error) throw error
      return groupHouseholdRows((data ?? []) as HouseholdRpcRow[])
    }

    async function load() {
      setLoading(true)
      setMessage('')
      setContext(null)
      setOverview(null)
      setBranches([])
      setRootSpouses([])
      setSelectedBranchId('')
      setHouseholdsByPerson({})
      setExpandedIds(new Set())
      setLoadingIds(new Set())

      const { data: contextData, error: contextError } = await supabase!.rpc('get_person_lineage_context', {
        p_person_id: personId,
      })
      if (cancelled) return

      const contexts = (contextData ?? []) as LineageContext[]
      const activeContext = contexts[0] ?? null
      if (contextError || !activeContext) {
        setLoading(false)
        setMessage('لم يُعتمد أصل لهذا المسار بعد. يمكنك متابعة إدخال الوالدين، وسيظهر الهيكل تلقائيًا عند اتصاله بأصل معتمد.')
        return
      }

      try {
        const [overviewResult, directBranches, rootHouseholds] = await Promise.all([
          supabase!.rpc('get_lineage_overview', {
            p_root_person_id: activeContext.root_person_id,
            p_max_depth: 20,
          }),
          fetchChildren(activeContext.root_person_id),
          fetchHouseholds(activeContext.root_person_id),
        ])
        if (cancelled) return
        if (overviewResult.error) throw overviewResult.error

        const currentOverview = (((overviewResult.data ?? []) as LineageOverview[])[0] ?? null)
        const preferredBranchId = activeContext.generation > 0 && activeContext.branch_person_id
          ? directBranches.find((branch) => branch.person_id === activeContext.branch_person_id)?.person_id ?? ''
          : ''
        const initialBranchId = preferredBranchId || directBranches[0]?.person_id || ''
        const householdCache: Record<string, HouseholdGroup[]> = {}
        const expanded = new Set<string>()

        const rootSpouseList = rootHouseholds
          .filter((group) => group.spouse)
          .map((group) => group.spouse as SpouseSummary)

        const focusPath = safePath(activeContext.ancestry_path)
        if (initialBranchId) {
          const pathIds = focusPath.map((item) => item.person_id)
          const initialBranchIndex = pathIds.indexOf(initialBranchId)
          if (initialBranchIndex >= 0) {
            for (let index = initialBranchIndex; index < pathIds.length - 1; index += 1) {
              const parentId = pathIds[index]
              householdCache[parentId] = await fetchHouseholds(parentId)
              if (cancelled) return
              expanded.add(parentId)
            }
          } else {
            const branch = directBranches.find((item) => item.person_id === initialBranchId)
            if (branch?.has_children) {
              householdCache[initialBranchId] = await fetchHouseholds(initialBranchId)
              if (cancelled) return
              expanded.add(initialBranchId)
            }
          }
        }

        setContext(activeContext)
        setOverview(currentOverview)
        setBranches(directBranches)
        setRootSpouses(rootSpouseList)
        setSelectedBranchId(initialBranchId)
        setHouseholdsByPerson(householdCache)
        setExpandedIds(expanded)
        setLoading(false)
      } catch {
        if (cancelled) return
        setLoading(false)
        setMessage('تعذر تحميل هيكل النسب الآن. يمكنك استخدام شبكة العلاقات مؤقتًا.')
      }
    }

    void load()
    return () => { cancelled = true }
  }, [personId])

  const focusPath = useMemo(() => safePath(context?.ancestry_path ?? null), [context])
  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.person_id === selectedBranchId) ?? null,
    [branches, selectedBranchId],
  )

  async function ensureHouseholds(person: ChildRow) {
    if (!supabase || !person.has_children || householdsByPerson[person.person_id] || loadingIds.has(person.person_id)) return
    setLoadingIds((current) => new Set(current).add(person.person_id))
    const { data, error } = await supabase.rpc('get_lineage_households_v2', { p_person_id: person.person_id })
    setLoadingIds((current) => {
      const next = new Set(current)
      next.delete(person.person_id)
      return next
    })
    if (error) {
      setMessage(`تعذر تحميل أسرة ${person.full_name}. أعد المحاولة.`)
      return
    }
    setHouseholdsByPerson((current) => ({
      ...current,
      [person.person_id]: groupHouseholdRows((data ?? []) as HouseholdRpcRow[]),
    }))
  }

  async function togglePerson(person: ChildRow) {
    if (!person.has_children) return
    const currentlyExpanded = expandedIds.has(person.person_id)
    if (currentlyExpanded) {
      setExpandedIds((current) => {
        const next = new Set(current)
        next.delete(person.person_id)
        return next
      })
      return
    }

    await ensureHouseholds(person)
    setExpandedIds((current) => new Set(current).add(person.person_id))
  }

  async function selectBranch(branch: ChildRow) {
    setSelectedBranchId(branch.person_id)
    setMessage('')
    if (!branch.has_children) return
    await ensureHouseholds(branch)
    setExpandedIds((current) => new Set(current).add(branch.person_id))
  }

  function renderSpouseRail(spouses: SpouseSummary[]) {
    if (!spouses.length) return null
    return <div className="lineage-spouse-rail" aria-label="الزوج أو الزوجة">
      {spouses.map((spouse) => <button
        type="button"
        key={spouse.family_unit_id}
        className={spouse.gender === 'female' ? 'female' : ''}
        onClick={() => onOpenPerson(spouse.person_id)}
        title={spouse.display_name || spouse.full_name}
      >
        <span>{spouse.full_name.trim().charAt(0) || '؟'}</span>
        <span className="lineage-spouse-copy"><small>{spouseRoleLabel(spouse.gender)}</small><strong>{spouse.full_name}</strong></span>
        {spouses.length > 1 && <b>{spouse.child_count}</b>}
      </button>)}
    </div>
  }

  function renderPersonNode(person: ChildRow, depth = 0, ancestry = new Set<string>()) {
    const isCurrent = person.person_id === personId
    const isExpanded = expandedIds.has(person.person_id)
    const isLoading = loadingIds.has(person.person_id)
    const householdGroups = householdsByPerson[person.person_id] ?? []
    const cyclic = ancestry.has(person.person_id)
    const nextAncestry = new Set(ancestry).add(person.person_id)

    return <div className={`lineage-expand-node depth-${Math.min(depth, 6)} ${isCurrent ? 'current' : ''}`} key={`${person.person_id}-${depth}`}>
      <div className={`lineage-expand-card ${person.spouses.length ? 'has-spouses' : ''}`}>
        <button
          type="button"
          className={`lineage-expand-main ${person.gender === 'female' ? 'female' : ''}`}
          disabled={!person.has_children || cyclic}
          onClick={() => void togglePerson(person)}
          aria-expanded={person.has_children ? isExpanded : undefined}
        >
          <span className="lineage-expand-avatar">{person.full_name.trim().charAt(0) || '؟'}</span>
          <span className="lineage-expand-copy">
            <strong>{person.full_name}</strong>
            <small>{isCurrent ? 'الشخص الحالي · ' : ''}{childCountLabel(person.direct_child_count)}</small>
          </span>
          {person.has_children && <span className={`lineage-expand-chevron ${isExpanded ? 'open' : ''}`}>{isLoading ? '…' : '⌄'}</span>}
        </button>
        {renderSpouseRail(person.spouses)}
        <button type="button" className="lineage-expand-profile" onClick={() => onOpenPerson(person.person_id)}>الملف</button>
      </div>

      {person.has_children && isExpanded && !cyclic && <div className="lineage-expand-households">
        {isLoading && !householdGroups.length ? <div className="lineage-expand-loading">جارٍ تحميل الأسرة والأبناء…</div> : householdGroups.length ? householdGroups.map((group) => <section
          className={`lineage-household-group ${group.group_type === 'unassigned' ? 'unassigned' : ''}`}
          key={group.key}
        >
          <header>
            {group.spouse ? <button type="button" onClick={() => onOpenPerson(group.spouse!.person_id)}>
              <span className={group.spouse.gender === 'female' ? 'female' : ''}>{group.spouse.full_name.trim().charAt(0) || '؟'}</span>
              <span><small>{spouseRoleLabel(group.spouse.gender)}</small><strong>{group.spouse.full_name}</strong></span>
            </button> : <div className="lineage-unassigned-parent">
              <span>؟</span>
              <div><small>بيانات غير مكتملة</small><strong>الوالد/الوالدة الآخر غير محدد</strong></div>
            </div>}
            <em>{householdChildCountLabel(group.children.length)}</em>
          </header>
          {group.children.length ? <div className="lineage-household-children">
            {group.children.map((child) => renderPersonNode(child, depth + 1, nextAncestry))}
          </div> : <div className="lineage-household-empty">لا يوجد أبناء مشتركين مسجلون لهذه الأسرة.</div>}
        </section>) : <div className="lineage-expand-loading">لا توجد ذرية نشطة مسجلة.</div>}
      </div>}
    </div>
  }

  if (loading) {
    return <div className="lineage-hierarchy-loading">جارٍ ترتيب الأصل والفروع والأسر…</div>
  }

  if (!context) {
    return <div className="lineage-hierarchy-empty">
      <span aria-hidden="true">⌁</span>
      <strong>الهيكل سيكتمل مع البيانات</strong>
      <p>{message}</p>
      <button type="button" onClick={onShowNetwork}>عرض شبكة العلاقات الحالية</button>
    </div>
  }

  return <section className="lineage-hierarchy" aria-label={`هيكل نسب ${personName}`}>
    <div className="lineage-hierarchy-overview">
      <div className="lineage-root-family">
        <button type="button" className={`lineage-root-node ${context.root_person_id === personId ? 'current' : ''}`} onClick={() => onOpenPerson(context.root_person_id)}>
          <small>الجد الأعلى</small>
          <span>{context.root_name.trim().charAt(0) || '؟'}</span>
          <strong>{context.root_name}</strong>
          <em>{context.lineage_name}</em>
        </button>
        {rootSpouses.length > 0 && <div className="lineage-root-spouses">{renderSpouseRail(rootSpouses)}</div>}
      </div>
      <div className="lineage-root-stats">
        <span><b>{overview?.direct_children_count ?? branches.length}</b><small>فروع</small></span>
        <span><b>{overview?.descendant_count ?? '—'}</b><small>من الذرية</small></span>
        <span><b>{overview?.max_depth ?? '—'}</b><small>أجيال</small></span>
      </div>
    </div>

    {focusPath.length > 1 && <div className="lineage-focus-path" aria-label="مسار الشخص الحالي">
      <small>مسارك داخل النسب</small>
      <div>{focusPath.map((item, index) => <span key={item.person_id}>
        {index > 0 && <i>←</i>}
        <button type="button" className={item.person_id === personId ? 'current' : ''} onClick={() => onOpenPerson(item.person_id)}>{item.full_name}</button>
      </span>)}</div>
    </div>}

    {branches.length > 0 ? <>
      <div className="lineage-branch-heading">
        <div><small>الفروع المباشرة</small><strong>اختر فرعًا ثم افتح الأسر والأبناء تدريجيًا</strong></div>
        <span>{branches.length}</span>
      </div>
      <div className="lineage-branch-strip">
        {branches.map((branch) => <button
          type="button"
          key={branch.person_id}
          className={`${branch.person_id === selectedBranchId ? 'active' : ''} ${branch.person_id === context.branch_person_id ? 'focus-branch' : ''}`}
          onClick={() => void selectBranch(branch)}
        >
          <span>{branch.full_name.trim().charAt(0) || '؟'}</span>
          <strong>{branch.branch_name || `فرع ${branch.full_name}`}</strong>
          <small>{branch.spouses.length > 1 ? `${branch.spouses.length} زيجات · ` : ''}{childCountLabel(branch.direct_child_count)}</small>
        </button>)}
      </div>

      {selectedBranch && <div className="lineage-expand-tree">
        <div className="lineage-expand-guide"><span>اضغط على الشخص لعرض أسرته وأبنائه</span><small>يُفصل أبناء كل زواج تلقائيًا، وزر «الملف» يفتح صفحة الشخص.</small></div>
        {renderPersonNode(selectedBranch)}
      </div>}
    </> : <div className="lineage-hierarchy-empty compact">
      <strong>الأصل معتمد ولا توجد فروع مسجلة بعد</strong>
      <p>عند إضافة الأبناء سيظهرون هنا تلقائيًا كفروع.</p>
    </div>}

    {message && <div className="lineage-expand-message" role="status">{message}</div>}
    <p className="lineage-hierarchy-footnote">تُعرض الزوجات والأزواج من وحدات الزواج المعتمدة، ويظهر الأبناء تحت الزوج/الزوجة الصحيحين فقط عندما يثبت الوالدان في بيانات النسب. الحالات غير المكتملة تبقى منفصلة بدون تخمين.</p>
  </section>
}
