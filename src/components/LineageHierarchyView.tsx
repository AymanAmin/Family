import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import '../lineage-hierarchy.css'

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

type DescendantRow = {
  person_id: string
  full_name: string
  gender: Gender
  generation: number
  parent_person_id: string | null
  path: string[] | null
}

type Props = {
  personId: string
  personName: string
  onOpenPerson: (personId: string) => void
  onShowNetwork: () => void
}

const MAX_DEPTH = 8

function generationLabel(generation: number) {
  if (generation === 1) return 'الفرع'
  if (generation === 2) return 'الجيل الثاني'
  if (generation === 3) return 'الجيل الثالث'
  if (generation === 4) return 'الجيل الرابع'
  return `الجيل ${generation}`
}

function safePath(value: string[] | null | undefined) {
  return Array.isArray(value) ? value : []
}

export default function LineageHierarchyView({ personId, personName, onOpenPerson, onShowNetwork }: Props) {
  const [context, setContext] = useState<LineageContext | null>(null)
  const [rows, setRows] = useState<DescendantRow[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!supabase || !personId) {
      setLoading(false)
      return
    }

    let cancelled = false
    async function load() {
      setLoading(true)
      setMessage('')
      setContext(null)
      setRows([])
      setSelectedBranchId('')

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

      const { data: descendantData, error: descendantError } = await supabase!.rpc('get_lineage_descendants', {
        p_ancestor_person_id: activeContext.root_person_id,
        p_max_depth: MAX_DEPTH,
      })
      if (cancelled) return

      if (descendantError) {
        setLoading(false)
        setMessage('تعذر تحميل هيكل النسب الآن. يمكنك استخدام شبكة العلاقات مؤقتًا.')
        return
      }

      const descendants = (descendantData ?? []) as DescendantRow[]
      setContext(activeContext)
      setRows(descendants)

      const directBranches = descendants.filter((row) => row.generation === 1)
      const preferred = activeContext.generation > 0 && activeContext.branch_person_id
        ? directBranches.find((branch) => branch.person_id === activeContext.branch_person_id)?.person_id
        : ''
      setSelectedBranchId(preferred || directBranches[0]?.person_id || '')
      setLoading(false)
    }

    void load()
    return () => { cancelled = true }
  }, [personId])

  const branches = useMemo(() => rows.filter((row) => row.generation === 1), [rows])

  const branchCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const branch of branches) {
      counts.set(branch.person_id, rows.filter((row) => safePath(row.path).includes(branch.person_id)).length)
    }
    return counts
  }, [branches, rows])

  const selectedRows = useMemo(() => {
    if (!selectedBranchId) return []
    return rows.filter((row) => row.person_id !== context?.root_person_id && safePath(row.path).includes(selectedBranchId))
  }, [rows, selectedBranchId, context?.root_person_id])

  const generations = useMemo(() => {
    const map = new Map<number, DescendantRow[]>()
    for (const row of selectedRows) {
      const bucket = map.get(row.generation) ?? []
      bucket.push(row)
      map.set(row.generation, bucket)
    }
    return [...map.entries()].sort(([a], [b]) => a - b)
  }, [selectedRows])

  const focusPath = useMemo(() => {
    if (!context?.ancestry_path || !Array.isArray(context.ancestry_path)) return []
    return context.ancestry_path
  }, [context])

  if (loading) {
    return <div className="lineage-hierarchy-loading">جارٍ ترتيب الأصل والفروع والأجيال…</div>
  }

  if (!context) {
    return <div className="lineage-hierarchy-empty">
      <span aria-hidden="true">⌁</span>
      <strong>الهيكل سيكتمل مع البيانات</strong>
      <p>{message}</p>
      <button type="button" onClick={onShowNetwork}>عرض شبكة العلاقات الحالية</button>
    </div>
  }

  const selectedBranch = branches.find((branch) => branch.person_id === selectedBranchId) ?? null

  return <section className="lineage-hierarchy" aria-label={`هيكل نسب ${personName}`}>
    <div className="lineage-hierarchy-overview">
      <button type="button" className={`lineage-root-node ${context.root_person_id === personId ? 'current' : ''}`} onClick={() => onOpenPerson(context.root_person_id)}>
        <small>الجد الأعلى</small>
        <span>{context.root_name.trim().charAt(0) || '؟'}</span>
        <strong>{context.root_name}</strong>
        <em>{context.lineage_name}</em>
      </button>
      <div className="lineage-root-stats">
        <span><b>{branches.length}</b><small>فروع</small></span>
        <span><b>{Math.max(0, rows.length - 1)}</b><small>من الذرية</small></span>
        <span><b>{Math.max(0, ...rows.map((row) => row.generation))}</b><small>أجيال</small></span>
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
        <div><small>الفروع المباشرة</small><strong>اختر فرعًا لعرض أجياله</strong></div>
        <span>{branches.length}</span>
      </div>
      <div className="lineage-branch-strip">
        {branches.map((branch) => <button
          type="button"
          key={branch.person_id}
          className={`${branch.person_id === selectedBranchId ? 'active' : ''} ${branch.person_id === context.branch_person_id ? 'focus-branch' : ''}`}
          onClick={() => setSelectedBranchId(branch.person_id)}
        >
          <span>{branch.full_name.trim().charAt(0) || '؟'}</span>
          <strong>فرع {branch.full_name}</strong>
          <small>{Math.max(0, (branchCounts.get(branch.person_id) ?? 1) - 1)} من الذرية</small>
        </button>)}
      </div>

      {selectedBranch && <div className="lineage-generation-tree">
        <div className="lineage-selected-branch">
          <span aria-hidden="true">↓</span>
          <div><small>الفرع المختار</small><strong>{selectedBranch.full_name}</strong></div>
          <button type="button" onClick={() => onOpenPerson(selectedBranch.person_id)}>فتح الملف</button>
        </div>

        {generations.map(([generation, people]) => <section className="lineage-generation" key={generation}>
          <header><span>{generation}</span><div><strong>{generationLabel(generation)}</strong><small>{people.length} {people.length === 1 ? 'شخص' : 'أشخاص'}</small></div></header>
          <div className="lineage-generation-people">
            {people.map((person) => <button
              type="button"
              key={person.person_id}
              className={`${person.gender === 'female' ? 'female' : ''} ${person.person_id === personId ? 'current' : ''}`}
              onClick={() => onOpenPerson(person.person_id)}
            >
              <span>{person.full_name.trim().charAt(0) || '؟'}</span>
              <strong>{person.full_name}</strong>
              {person.person_id === personId && <small>الشخص الحالي</small>}
            </button>)}
          </div>
        </section>)}
      </div>}
    </> : <div className="lineage-hierarchy-empty compact">
      <strong>الأصل معتمد ولا توجد فروع مسجلة بعد</strong>
      <p>عند إضافة الأبناء سيظهرون هنا تلقائيًا كفروع.</p>
    </div>}

    <p className="lineage-hierarchy-footnote">يعتمد هذا العرض على علاقات الأب والأم المعتمدة، ويتحدث تلقائيًا مع أي إضافة أو تصحيح جديد.</p>
  </section>
}
