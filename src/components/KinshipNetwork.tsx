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
  if (type === 'guardian') return 'ولي / وصي'
  return 'صلة قرابة'
}

function relatedPerson(value: DirectRelatedPerson) {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function KinNode({ row, onOpen }: { row: KinshipRow; onOpen: (id: string) => void }) {
  return (
    <button className="kin-node" type="button" onClick={() => onOpen(row.related_person_id)}>
      <span className="kin-avatar">{row.full_name.trim().charAt(0) || '؟'}</span>
      <span className="kin-copy">
        <strong>{row.full_name}</strong>
        <small>{relationLabel(row.relation_type, row.gender)}</small>
      </span>
      {row.is_inferred && <span className="kin-auto" title="استنتجتها المنصة تلقائيًا">✦ تلقائي</span>}
      {row.relation_detail && <span className="kin-detail">{row.relation_detail}</span>}
    </button>
  )
}

function KinGroup({ type, rows, onOpen, className = '' }: { type: string; rows: KinshipRow[]; onOpen: (id: string) => void; className?: string }) {
  if (!rows.length) return null
  return (
    <div className={`kin-group kin-${type} ${className}`}>
      <div className="kin-group-title"><span>{groupTitles[type] || 'صلة قرابة'}</span><b>{rows.length}</b></div>
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
  const extended = ['grandparent', 'grandchild', 'guardian', 'other'].flatMap((type) => grouped.get(type) ?? [])

  return (
    <section className="detail-section kinship-section">
      <div className="kinship-heading">
        <div>
          <span className="eyebrow">شبكة القرابة</span>
          <h2>العلاقات حول {personName.split(' ')[0]}</h2>
          <p>الوالدان والأبناء والإخوة تُرتّب كشبكة واحدة، والإخوة المشتركون في الأب أو الأم يُستنتجون تلقائيًا.</p>
        </div>
        <div className="kinship-heading-actions">
          {smartAvailable && <span className="smart-badge">✦ استنتاج ذكي</span>}
          {onAddRelation && <button className="text-link" type="button" onClick={onAddRelation}>إضافة صلة</button>}
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

              {extended.length > 0 && (
                <div className="kin-extended">
                  {['grandparent', 'grandchild', 'guardian', 'other'].map((type) => (
                    <KinGroup key={type} type={type} rows={grouped.get(type) ?? []} onOpen={onOpenPerson} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="empty-state compact"><strong>لم تُسجّل علاقات لهذا الشخص بعد</strong><span>أضف الأب أو الأم مرة واحدة، وستستنتج المنصة الإخوة والقرابات المرتبطة تلقائيًا.</span></div>
      )}

      {!smartAvailable && <div className="kinship-update-note">شغّل أحدث <code>supabase/SETUP.sql</code> لتفعيل استنتاج الإخوة والأجداد تلقائيًا.</div>}
    </section>
  )
}
