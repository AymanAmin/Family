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

type ChildRow = {
  person_id: string
  full_name: string
  gender: Gender
  direct_child_count: number
  has_children: boolean
  branch_name: string | null
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

export default function LineageHierarchyView({ personId, personName, onOpenPerson, onShowNetwork }: Props) {
  const [context, setContext] = useState<LineageContext | null>(null)
  const [overview, setOverview] = useState<LineageOverview | null>(null)
  const [branches, setBranches] = useState<ChildRow[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [childrenByParent, setChildrenByParent] = useState<Record<string, ChildRow[]>>({})
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
      const { data, error } = await supabase!.rpc('get_lineage_children', { p_parent_person_id: parentId })
      if (error) throw error
      return (data ?? []) as ChildRow[]
    }

    async function load() {
      setLoading(true)
      setMessage('')
      setContext(null)
      setOverview(null)
      setBranches([])
      setSelectedBranchId('')
      setChildrenByParent({})
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
        const [overviewResult, directBranches] = await Promise.all([
          supabase!.rpc('get_lineage_overview', {
            p_root_person_id: activeContext.root_person_id,
            p_max_depth: 20,
          }),
          fetchChildren(activeContext.root_person_id),
        ])
        if (cancelled) return
        if (overviewResult.error) throw overviewResult.error

        const currentOverview = (((overviewResult.data ?? []) as LineageOverview[])[0] ?? null)
        const preferredBranchId = activeContext.generation > 0 && activeContext.branch_person_id
          ? directBranches.find((branch) => branch.person_id === activeContext.branch_person_id)?.person_id ?? ''
          : ''
        const initialBranchId = preferredBranchId || directBranches[0]?.person_id || ''
        const cache: Record<string, ChildRow[]> = { [activeContext.root_person_id]: directBranches }
        const expanded = new Set<string>()

        // Only preload the exact ancestry path of the selected person. Every other
        // node remains lazy and is fetched only when the user expands it.
        const focusPath = safePath(activeContext.ancestry_path)
        if (initialBranchId) {
          const pathIds = focusPath.map((item) => item.person_id)
          const initialBranchIndex = pathIds.indexOf(initialBranchId)
          if (initialBranchIndex >= 0) {
            for (let index = initialBranchIndex; index < pathIds.length - 1; index += 1) {
              const parentId = pathIds[index]
              const children = await fetchChildren(parentId)
              if (cancelled) return
              cache[parentId] = children
              expanded.add(parentId)
            }
          } else {
            const branch = directBranches.find((item) => item.person_id === initialBranchId)
            if (branch?.has_children) {
              cache[initialBranchId] = await fetchChildren(initialBranchId)
              if (cancelled) return
              expanded.add(initialBranchId)
            }
          }
        }

        setContext(activeContext)
        setOverview(currentOverview)
        setBranches(directBranches)
        setSelectedBranchId(initialBranchId)
        setChildrenByParent(cache)
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

  async function ensureChildren(person: ChildRow) {
    if (!supabase || !person.has_children || childrenByParent[person.person_id] || loadingIds.has(person.person_id)) return
    setLoadingIds((current) => new Set(current).add(person.person_id))
    const { data, error } = await supabase.rpc('get_lineage_children', { p_parent_person_id: person.person_id })
    setLoadingIds((current) => {
      const next = new Set(current)
      next.delete(person.person_id)
      return next
    })
    if (error) {
      setMessage(`تعذر تحميل أبناء ${person.full_name}. أعد المحاولة.`)
      return
    }
    setChildrenByParent((current) => ({ ...current, [person.person_id]: (data ?? []) as ChildRow[] }))
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

    await ensureChildren(person)
    setExpandedIds((current) => new Set(current).add(person.person_id))
  }

  async function selectBranch(branch: ChildRow) {
    setSelectedBranchId(branch.person_id)
    setMessage('')
    if (!branch.has_children) return
    await ensureChildren(branch)
    setExpandedIds((current) => new Set(current).add(branch.person_id))
  }

  function renderPersonNode(person: ChildRow, depth = 0, ancestry = new Set<string>()): JSX.Element {
    const isCurrent = person.person_id === personId
    const isExpanded = expandedIds.has(person.person_id)
    const isLoading = loadingIds.has(person.person_id)
    const children = childrenByParent[person.person_id] ?? []
    const cyclic = ancestry.has(person.person_id)
    const nextAncestry = new Set(ancestry).add(person.person_id)

    return <div className={`lineage-expand-node depth-${Math.min(depth, 6)} ${isCurrent ? 'current' : ''}`} key={`${person.person_id}-${depth}`}>
      <div className="lineage-expand-card">
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
        <button type="button" className="lineage-expand-profile" onClick={() => onOpenPerson(person.person_id)}>الملف</button>
      </div>

      {person.has_children && isExpanded && !cyclic && <div className="lineage-expand-children">
        {isLoading && !children.length ? <div className="lineage-expand-loading">جارٍ تحميل الأبناء…</div> : children.length ? children.map((child) => renderPersonNode(child, depth + 1, nextAncestry)) : <div className="lineage-expand-loading">لا توجد ذرية نشطة مسجلة.</div>}
      </div>}
    </div>
  }

  if (loading) {
    return <div className="lineage-hierarchy-loading">جارٍ ترتيب الأصل والفروع…</div>
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
      <button type="button" className={`lineage-root-node ${context.root_person_id === personId ? 'current' : ''}`} onClick={() => onOpenPerson(context.root_person_id)}>
        <small>الجد الأعلى</small>
        <span>{context.root_name.trim().charAt(0) || '؟'}</span>
        <strong>{context.root_name}</strong>
        <em>{context.lineage_name}</em>
      </button>
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
        <div><small>الفروع المباشرة</small><strong>اختر فرعًا ثم افتح الأشخاص تدريجيًا</strong></div>
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
          <small>{childCountLabel(branch.direct_child_count)}</small>
        </button>)}
      </div>

      {selectedBranch && <div className="lineage-expand-tree">
        <div className="lineage-expand-guide"><span>اضغط على الشخص لعرض أبنائه</span><small>زر «الملف» يفتح صفحة الشخص بدون تغيير التفرع.</small></div>
        {renderPersonNode(selectedBranch)}
      </div>}
    </> : <div className="lineage-hierarchy-empty compact">
      <strong>الأصل معتمد ولا توجد فروع مسجلة بعد</strong>
      <p>عند إضافة الأبناء سيظهرون هنا تلقائيًا كفروع.</p>
    </div>}

    {message && <div className="lineage-expand-message" role="status">{message}</div>}
    <p className="lineage-hierarchy-footnote">لا تُحمّل الشجرة كاملة دفعة واحدة؛ تُجلب ذرية كل شخص عند فتحه، وتتحدث تلقائيًا مع علاقات الأب والأم المعتمدة.</p>
  </section>
}
