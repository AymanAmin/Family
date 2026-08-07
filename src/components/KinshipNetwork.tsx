import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type KinshipRow = {
  related_person_id: string
  full_name: string
  gender: string | null
  relation_type: string
  relation_detail: string | null
  is_inferred: boolean
  shared_parent_count: number | null
}

type DirectRelatedPerson = { id?: string; full_name?: string; gender?: string | null } | { id?: string; full_name?: string; gender?: string | null }[] | null

type Props = {
  personId: string
  personName: string
  onOpenPerson: (personId: string) => void
  onAddRelation?: () => void
}

const groupTitles: Record<string, string> = {
  parent: 'الوالدان', sibling: 'الإخوة والأخوات', spouse: 'الزوج / الزوجة', child: 'الأبناء والبنات',
  grandparent: 'الأجداد والجدات', grandchild: 'الأحفاد', paternal_uncle: 'الأعمام', paternal_aunt: 'العمات',
  maternal_uncle: 'الأخوال', maternal_aunt: 'الخالات', paternal_parent_sibling: 'أشقاء الأب', maternal_parent_sibling: 'أشقاء الأم',
  parent_sibling: 'أشقاء الوالدين', paternal_uncle_child: 'أبناء العم', paternal_aunt_child: 'أبناء العمة',
  maternal_uncle_child: 'أبناء الخال', maternal_aunt_child: 'أبناء الخالة', cousin: 'أبناء العمومة والخؤولة',
  nephew: 'أبناء الإخوة', niece: 'بنات الإخوة', great_grandparent: 'الأجداد الأعلى', great_grandchild: 'أحفاد الأحفاد',
  guardian: 'الولاية والوصاية', other: 'علاقات أخرى',
}

function relationLabel(type: string, gender: string | null): string {
  const female = gender === 'female'
  if (type === 'parent') return female ? 'الأم' : 'الأب'
  if (type === 'child') return female ? 'ابنة' : 'ابن'
  if (type === 'sibling') return female ? 'أخت' : 'أخ'
  if (type === 'spouse') return female ? 'زوجة' : 'زوج'
  if (type === 'grandparent') return female ? 'جدة' : 'جد'
  if (type === 'grandchild') return female ? 'حفيدة' : 'حفيد'
  if (type === 'paternal_uncle') return 'عم'
  if (type === 'paternal_aunt') return 'عمة'
  if (type === 'maternal_uncle') return 'خال'
  if (type === 'maternal_aunt') return 'خالة'
  if (type === 'paternal_parent_sibling') return female ? 'عمة' : 'عم'
  if (type === 'maternal_parent_sibling') return female ? 'خالة' : 'خال'
  if (type === 'parent_sibling') return female ? 'عمة / خالة' : 'عم / خال'
  if (type === 'paternal_uncle_child') return female ? 'بنت العم' : 'ابن العم'
  if (type === 'paternal_aunt_child') return female ? 'بنت العمة' : 'ابن العمة'
  if (type === 'maternal_uncle_child') return female ? 'بنت الخال' : 'ابن الخال'
  if (type === 'maternal_aunt_child') return female ? 'بنت الخالة' : 'ابن الخالة'
  if (type === 'cousin') return female ? 'قريبة من أبناء العمومة' : 'قريب من أبناء العمومة'
  if (type === 'nephew') return 'ابن الأخ / الأخت'
  if (type === 'niece') return 'بنت الأخ / الأخت'
  if (type === 'great_grandparent') return female ? 'جدة كبرى' : 'جد أكبر'
  if (type === 'great_grandchild') return female ? 'حفيدة من الجيل الأدنى' : 'حفيد من الجيل الأدنى'
  if (type === 'guardian') return 'ولي / وصي'
  return 'صلة قرابة'
}

function relatedPerson(value: DirectRelatedPerson) {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function KinNode({ row, onOpen }: { row: KinshipRow; onOpen: (id: string) => void }) {
  return <button className="kin-node" type="button" onClick={() => onOpen(row.related_person_id)}>
    <span className="kin-avatar">{row.full_name.trim().charAt(0) || '؟'}</span>
    <span className="kin-copy"><strong>{row.full_name}</strong><small>{relationLabel(row.relation_type, row.gender)}</small></span>
    {row.is_inferred && <span className="kin-auto" title="استنتجتها المنصة تلقائيًا">✦ تلقائي</span>}
    {row.relation_detail && <span className="kin-detail">{row.relation_detail}</span>}
  </button>
}

function KinGroup({ type, rows, onOpen, className = '' }: { type: string; rows: KinshipRow[]; onOpen: (id: string) => void; className?: string }) {
  if (!rows.length) return null
  return <div className={`kin-group kin-${type} ${className}`}>
    <div className="kin-group-title"><span>{groupTitles[type] || 'صلة قرابة'}</span><b>{rows.length}</b></div>
    <div className="kin-nodes">{rows.map((row) => <KinNode key={`${row.relation_type}-${row.related_person_id}`} row={row} onOpen={onOpen} />)}</div>
  </div>
}

const extendedTypes = ['grandparent','paternal_uncle','paternal_aunt','maternal_uncle','maternal_aunt','paternal_parent_sibling','maternal_parent_sibling','parent_sibling','paternal_uncle_child','paternal_aunt_child','maternal_uncle_child','maternal_aunt_child','cousin','nephew','niece','grandchild','great_grandparent','great_grandchild','guardian','other']

export default function KinshipNetwork({ personId, personName, onOpenPerson, onAddRelation }: Props) {
  const [rows, setRows] = useState<KinshipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [smartAvailable, setSmartAvailable] = useState(true)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!supabase) { setLoading(false); return }
      setLoading(true)
      const smart = await supabase.rpc('get_person_kinship', { p_person_id: personId })
      if (!cancelled && !smart.error) {
        setRows((smart.data ?? []) as KinshipRow[]); setSmartAvailable(true); setLoading(false); return
      }
      const fallback = await supabase.from('person_relationships')
        .select('source_person_id,target_person_id,relation_type,notes,source:people!person_relationships_source_person_id_fkey(id,full_name,gender),target:people!person_relationships_target_person_id_fkey(id,full_name,gender)')
        .eq('status', 'approved').or(`source_person_id.eq.${personId},target_person_id.eq.${personId}`)
      if (cancelled) return
      const mapped: KinshipRow[] = (fallback.data ?? []).flatMap((relation): KinshipRow[] => {
        const selectedIsSource = relation.source_person_id === personId
        const other = relatedPerson((selectedIsSource ? relation.target : relation.source) as DirectRelatedPerson)
        if (!other?.id || !other.full_name) return []
        let canonicalType = relation.relation_type
        if (relation.relation_type === 'parent') canonicalType = selectedIsSource ? 'child' : 'parent'
        if (relation.relation_type === 'child') canonicalType = selectedIsSource ? 'parent' : 'child'
        return [{ related_person_id: other.id, full_name: other.full_name, gender: other.gender ?? null, relation_type: canonicalType, relation_detail: relation.notes ?? null, is_inferred: false, shared_parent_count: null }]
      })
      setRows(mapped); setSmartAvailable(false); setLoading(false)
    }
    void load(); return () => { cancelled = true }
  }, [personId])

  useEffect(() => {
    if (loading || !rows.length) return
    const scroller = scrollRef.current
    if (!scroller) return
    const frame = window.requestAnimationFrame(() => { scroller.scrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth) / 2 })
    return () => window.cancelAnimationFrame(frame)
  }, [loading, rows, personId])

  const grouped = useMemo(() => {
    const map = new Map<string, KinshipRow[]>()
    for (const row of rows) { const bucket = map.get(row.relation_type) ?? []; bucket.push(row); map.set(row.relation_type, bucket) }
    return map
  }, [rows])

  const parents = grouped.get('parent') ?? [], siblings = grouped.get('sibling') ?? [], spouses = grouped.get('spouse') ?? [], children = grouped.get('child') ?? []
  const hasExtended = extendedTypes.some((type) => (grouped.get(type)?.length ?? 0) > 0)

  return <section className="detail-section kinship-section">
    <div className="kinship-heading">
      <div><span className="eyebrow">شبكة القرابة</span><h2>العلاقات حول {personName.split(' ')[0]}</h2><p>تُستنتج القرابات تلقائيًا من الوالدين والأبناء: الإخوة، الأجداد، الأعمام والعمات، الأخوال والخالات وأبناءهم.</p></div>
      <div className="kinship-heading-actions">{smartAvailable && <span className="smart-badge">✦ استنتاج ذكي</span>}{onAddRelation && <button className="text-link" type="button" onClick={onAddRelation}>إضافة صلة</button>}</div>
    </div>
    {loading ? <div className="empty-state compact">جارٍ بناء شبكة القرابة…</div> : rows.length ? <>
      <div className="kinship-pan-hint" aria-hidden="true"><span>↔</span> اسحب المخطط يمينًا ويسارًا</div>
      <div className="kinship-scroll" ref={scrollRef}><div className="kinship-map">
        <KinGroup type="parent" rows={parents} onOpen={onOpenPerson} className="kin-top" />
        <div className="kin-middle"><KinGroup type="sibling" rows={siblings} onOpen={onOpenPerson} /><div className="kin-self"><span className="kin-self-ring"><b>{personName.trim().charAt(0) || '؟'}</b></span><strong>{personName}</strong><small>الشخص الحالي</small></div><KinGroup type="spouse" rows={spouses} onOpen={onOpenPerson} /></div>
        <KinGroup type="child" rows={children} onOpen={onOpenPerson} className="kin-bottom" />
        {hasExtended && <div className="kin-extended">{extendedTypes.map((type) => <KinGroup key={type} type={type} rows={grouped.get(type) ?? []} onOpen={onOpenPerson} />)}</div>}
      </div></div>
    </> : <div className="empty-state compact"><strong>لم تُسجّل علاقات لهذا الشخص بعد</strong><span>أضف الأب أو الأم مرة واحدة، وستستنتج المنصة بقية القرابات تلقائيًا.</span></div>}
    {!smartAvailable && <div className="kinship-update-note">شغّل أحدث <code>supabase/SETUP.sql</code> لتفعيل الاستنتاج الممتد للقرابة.</div>}
  </section>
}
