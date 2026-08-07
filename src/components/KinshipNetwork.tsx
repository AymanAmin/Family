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
  parent: 'الوالدان',
  sibling: 'الإخوة والأخوات',
  spouse: 'الزوج / الزوجة',
  child: 'الأبناء والبنات',
  grandparent: 'الأجداد والجدات',
  grandchild: 'الأحفاد',
  great_grandparent: 'الجيل الأعلى',
  great_grandchild: 'أحفاد الأحفاد',
  paternal_uncle: 'الأعمام',
  paternal_aunt: 'العمات',
  maternal_uncle: 'الأخوال',
  maternal_aunt: 'الخالات',
  nephew: 'أبناء الإخوة',
  niece: 'بنات الإخوة',
  guardian: 'الولاية والوصاية',
  other: 'علاقات أخرى',
}

function relationLabel(type: string, gender: string | null): string {
  const female = gender === 'female'
  if (type === 'parent') return female ? 'الأم' : 'الأب'
  if (type === 'child') return female ? 'ابنة' : 'ابن'
  if (type === 'sibling') return female ? 'أخت' : 'أخ'
  if (type === 'spouse') return female ? 'زوجة' : 'زوج'
  if (type === 'grandparent') return female ? 'جدة' : 'جد'
  if (type === 'grandchild') return female ? 'حفيدة' : 'حفيد'
  if (type === 'great_grandparent') return female ? 'جدة من الجيل الأعلى' : 'جد من الجيل الأعلى'
  if (type === 'great_grandchild') return female ? 'حفيدة من الجيل الأدنى' : 'حفيد من الجيل الأدنى'
  if (type === 'paternal_uncle') return 'عم'
  if (type === 'paternal_aunt') return 'عمة'
  if (type === 'maternal_uncle') return 'خال'
  if (type === 'maternal_aunt') return 'خالة'
  if (type === 'paternal_parent_sibling') return female ? 'عمة' : 'عم'
  if (type === 'maternal_parent_sibling') return female ? 'خالة' : 'خال'
  if (type === 'parent_sibling') return 'أخ/أخت أحد الوالدين'
  if (type === 'paternal_uncle_child') return female ? 'بنت العم' : 'ابن العم'
  if (type === 'paternal_aunt_child') return female ? 'بنت العمة' : 'ابن العمة'
  if (type === 'maternal_uncle_child') return female ? 'بنت الخال' : 'ابن الخال'
  if (type === 'maternal_aunt_child') return female ? 'بنت الخالة' : 'ابن الخالة'
  if (type === 'cousin') return female ? 'قريبة من أبناء العمومة/الخؤولة' : 'قريب من أبناء العمومة/الخؤولة'
  if (type === 'nephew') return 'ابن أخ/أخت'
  if (type === 'niece') return 'بنت أخ/أخت'
  if (type === 'guardian') return 'ولي / وصي'
  return 'صلة قرابة'
}

function relatedPerson(value: DirectRelatedPerson) {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function KinNode({ row, onOpen }: { row: KinshipRow; onOpen: (id: string) => void }) {
  return (
    <button className={`kin-node relation-${row.relation_type}`} type="button" onClick={() => onOpen(row.related_person_id)}>
      <span className={`kin-avatar ${row.gender === 'female' ? 'female' : ''}`}>{row.full_name.trim().charAt(0) || '؟'}</span>
      <span className="kin-copy">
        <strong>{row.full_name}</strong>
        <small>{relationLabel(row.relation_type, row.gender)}</small>
      </span>
      {row.is_inferred && <span className="kin-auto" title="استنتجتها المنصة تلقائيًا">✦ تلقائي</span>}
      {row.relation_detail && <span className="kin-detail">{row.relation_detail}</span>}
    </button>
  )
}

function KinGroup({ type, rows, onOpen, className = '', title }: { type: string; rows: KinshipRow[]; onOpen: (id: string) => void; className?: string; title?: string }) {
  if (!rows.length) return null
  return (
    <div className={`kin-group kin-${type} ${className}`}>
      <div className="kin-group-title"><span>{title || groupTitles[type] || 'صلة قرابة'}</span><b>{rows.length}</b></div>
      <div className="kin-nodes">
        {rows.map((row) => <KinNode key={`${row.relation_type}-${row.related_person_id}`} row={row} onOpen={onOpen} />)}
      </div>
    </div>
  )
}

export default function KinshipNetwork({ personId, personName, onOpenPerson, onAddRelation }: Props) {
  const [rows, setRows] = useState<KinshipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [smartAvailable, setSmartAvailable] = useState(true)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!supabase) {
        setLoading(false)
        return
      }

      setLoading(true)
      const smart = await supabase.rpc('get_person_kinship', { p_person_id: personId })
      if (!cancelled && !smart.error) {
        setRows((smart.data ?? []) as KinshipRow[])
        setSmartAvailable(true)
        setLoading(false)
        return
      }

      const fallback = await supabase
        .from('person_relationships')
        .select('source_person_id,target_person_id,relation_type,notes,source:people!person_relationships_source_person_id_fkey(id,full_name,gender),target:people!person_relationships_target_person_id_fkey(id,full_name,gender)')
        .eq('status', 'approved')
        .or(`source_person_id.eq.${personId},target_person_id.eq.${personId}`)

      if (cancelled) return
      const mapped: KinshipRow[] = (fallback.data ?? []).flatMap((relation): KinshipRow[] => {
        const selectedIsSource = relation.source_person_id === personId
        const other = relatedPerson((selectedIsSource ? relation.target : relation.source) as DirectRelatedPerson)
        if (!other?.id || !other.full_name) return []

        let canonicalType = relation.relation_type
        if (relation.relation_type === 'parent') canonicalType = selectedIsSource ? 'child' : 'parent'
        if (relation.relation_type === 'child') canonicalType = selectedIsSource ? 'parent' : 'child'

        return [{
          related_person_id: other.id,
          full_name: other.full_name,
          gender: other.gender ?? null,
          relation_type: canonicalType,
          relation_detail: relation.notes ?? null,
          is_inferred: false,
          shared_parent_count: null as number | null,
        }]
      })
      setRows(mapped)
      setSmartAvailable(false)
      setLoading(false)
    }

    void load()
    return () => { cancelled = true }
  }, [personId])

  useEffect(() => {
    if (loading || !rows.length) return
    const scroller = scrollRef.current
    if (!scroller) return

    const frame = window.requestAnimationFrame(() => {
      const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
      scroller.scrollLeft = maxScroll / 2
    })

    return () => window.cancelAnimationFrame(frame)
  }, [loading, rows, personId])

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
  const siblings = grouped.get('sibling') ?? []
  const spouses = grouped.get('spouse') ?? []
  const children = grouped.get('child') ?? []

  const extendedSections = useMemo(() => {
    const collect = (types: string[]) => types.flatMap((type) => grouped.get(type) ?? [])
    return [
      { key: 'ancestors', title: 'الأجداد والجيل الأعلى', type: 'grandparent', rows: collect(['grandparent', 'great_grandparent']) },
      { key: 'paternal', title: 'جهة الأب · الأعمام والعمات', type: 'paternal', rows: collect(['paternal_uncle', 'paternal_aunt', 'paternal_parent_sibling']) },
      { key: 'maternal', title: 'جهة الأم · الأخوال والخالات', type: 'maternal', rows: collect(['maternal_uncle', 'maternal_aunt', 'maternal_parent_sibling']) },
      { key: 'paternal-cousins', title: 'أبناء العمومة', type: 'paternal-cousins', rows: collect(['paternal_uncle_child', 'paternal_aunt_child']) },
      { key: 'maternal-cousins', title: 'أبناء الخؤولة', type: 'maternal-cousins', rows: collect(['maternal_uncle_child', 'maternal_aunt_child']) },
      { key: 'siblings-children', title: 'أبناء وبنات الإخوة', type: 'siblings-children', rows: collect(['nephew', 'niece']) },
      { key: 'descendants', title: 'الأحفاد والجيل الأدنى', type: 'grandchild', rows: collect(['grandchild', 'great_grandchild']) },
      { key: 'other', title: 'علاقات إضافية', type: 'other', rows: collect(['parent_sibling', 'cousin', 'guardian', 'other']) },
    ].filter((section) => section.rows.length > 0)
  }, [grouped])

  const inferredCount = rows.filter((row) => row.is_inferred).length

  return (
    <section className="detail-section kinship-section">
      <div className="kinship-heading">
        <div>
          <span className="eyebrow">شبكة القرابة الذكية</span>
          <h2>العلاقات حول {personName.split(' ')[0]}</h2>
          <p>أدخل الوالدين والأبناء فقط قدر الإمكان؛ المنصة تستنتج الإخوة والأجداد والأعمام والعمات والأخوال والخالات وأبناءهم تلقائيًا.</p>
        </div>
        <div className="kinship-heading-actions">
          {smartAvailable && <span className="smart-badge">✦ {inferredCount} علاقة مستنتجة</span>}
          {onAddRelation && <button className="text-link" type="button" onClick={onAddRelation}>+ إضافة صلة</button>}
        </div>
      </div>

      {loading ? <div className="empty-state compact">جارٍ بناء شبكة القرابة…</div> : rows.length ? (
        <>
          <div className="kinship-pan-hint" aria-hidden="true"><span>↔</span> اسحب المخطط يمينًا ويسارًا</div>
          <div className="kinship-scroll" ref={scrollRef}>
            <div className="kinship-map">
              <KinGroup type="parent" rows={parents} onOpen={onOpenPerson} className="kin-top" />

              <div className="kin-middle">
                <KinGroup type="sibling" rows={siblings} onOpen={onOpenPerson} />

                <div className="kin-self" aria-label={`الشخص الحالي ${personName}`}>
                  <span className="kin-self-ring"><b>{personName.trim().charAt(0) || '؟'}</b></span>
                  <strong>{personName}</strong>
                  <small>الشخص الحالي</small>
                </div>

                <KinGroup type="spouse" rows={spouses} onOpen={onOpenPerson} />
              </div>

              <KinGroup type="child" rows={children} onOpen={onOpenPerson} className="kin-bottom" />
            </div>
          </div>

          {extendedSections.length > 0 && (
            <div className="extended-kinship-area">
              <div className="extended-kinship-heading"><span>القرابة الممتدة</span><small>مستنتجة من شجرة الوالدين والأبناء</small></div>
              <div className="extended-kinship-scroll">
                {extendedSections.map((section) => (
                  <KinGroup key={section.key} type={section.type} title={section.title} rows={section.rows} onOpen={onOpenPerson} className="extended-kin-group" />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="empty-state compact"><strong>لم تُسجّل علاقات لهذا الشخص بعد</strong><span>ابدأ بالأب أو الأم. من هذه البيانات الأساسية ستبني المنصة بقية القرابات تلقائيًا.</span></div>
      )}

      {!smartAvailable && <div className="kinship-update-note">شغّل أحدث <code>supabase/SETUP.sql</code> لتفعيل قواعد العم والعمة والخال والخالة وأبناء العمومة والخؤولة.</div>}
    </section>
  )
}
