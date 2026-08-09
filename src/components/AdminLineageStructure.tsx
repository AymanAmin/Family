import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { normalizeArabicSearch } from '../lib/arabicSearch'
import '../lineage-structure.css'

type Gender = 'male' | 'female' | null
type Confidence = 'high' | 'medium' | 'review' | 'overlap'
type ViewFilter = 'ready' | 'review' | 'all'

type PersonRef = {
  person_id: string
  full_name: string
  gender: Gender
}

type Candidate = {
  root_person_id: string
  root_name: string
  root_gender: Gender
  descendant_count: number
  max_depth: number
  direct_children_count: number
  overlap_count: number
  confidence: Confidence
  can_approve: boolean
  suggested_lineage_name: string
  spouses: PersonRef[] | null
  branches: PersonRef[] | null
}

const confidenceLabel: Record<Confidence, string> = {
  high: 'مرشح قوي',
  medium: 'مرشح مناسب',
  review: 'يحتاج مراجعة',
  overlap: 'يتقاطع مع نسب قائم',
}

function safePeople(value: PersonRef[] | null | undefined): PersonRef[] {
  return Array.isArray(value) ? value : []
}

function navigateToPerson(personId: string) {
  const url = new URL(window.location.href)
  url.hash = `/person/${personId}`
  window.location.assign(url.toString())
}

export default function AdminLineageStructure() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [filter, setFilter] = useState<ViewFilter>('ready')
  const [search, setSearch] = useState('')
  const [confirmId, setConfirmId] = useState('')
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')

  const loadCandidates = useCallback(async () => {
    if (!supabase || !isAdmin) return
    setLoading(true)
    setMessage('')
    const { data, error } = await supabase.rpc('get_lineage_structure_candidates')
    setLoading(false)
    setLoaded(true)
    if (error) {
      setCandidates([])
      setMessage('تعذر تحليل الأصول والفروع الآن. أعد المحاولة بعد تحديث الصفحة.')
      return
    }
    setCandidates((data ?? []) as Candidate[])
  }, [isAdmin])

  useEffect(() => {
    if (!supabase) return
    let active = true

    async function resolveAdmin() {
      const { data: sessionData } = await supabase!.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) {
        if (active) setIsAdmin(false)
        return
      }
      const { data } = await supabase!
        .from('profiles')
        .select('role,account_status')
        .eq('id', userId)
        .maybeSingle()
      if (!active) return
      setIsAdmin(Boolean(data?.account_status === 'active' && ['admin', 'super_admin'].includes(data?.role ?? '')))
    }

    void resolveAdmin()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { void resolveAdmin() })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isAdmin) {
      setPortalTarget(null)
      setOpen(false)
      return
    }

    function locateAdminTabs() {
      setPortalTarget(document.querySelector<HTMLElement>('.admin-console-tabs'))
    }

    locateAdminTabs()
    const observer = new MutationObserver(locateAdminTabs)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin || !portalTarget || loaded || loading) return
    void loadCandidates()
  }, [isAdmin, portalTarget, loaded, loading, loadCandidates])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  const counts = useMemo(() => ({
    ready: candidates.filter((candidate) => candidate.can_approve).length,
    high: candidates.filter((candidate) => candidate.confidence === 'high').length,
    review: candidates.filter((candidate) => !candidate.can_approve).length,
    overlap: candidates.filter((candidate) => candidate.overlap_count > 0).length,
  }), [candidates])

  const visibleCandidates = useMemo(() => {
    const term = normalizeArabicSearch(search)
    return candidates.filter((candidate) => {
      if (filter === 'ready' && !candidate.can_approve) return false
      if (filter === 'review' && candidate.can_approve) return false
      if (!term) return true
      const names = [
        candidate.root_name,
        ...safePeople(candidate.spouses).map((person) => person.full_name),
        ...safePeople(candidate.branches).map((person) => person.full_name),
      ].join(' ')
      return normalizeArabicSearch(names).includes(term)
    })
  }, [candidates, filter, search])

  async function approveCandidate(candidate: Candidate) {
    if (!supabase || !candidate.can_approve) return
    setBusyId(candidate.root_person_id)
    setMessage('')
    const { error } = await supabase.rpc('approve_lineage_structure_candidate', {
      p_root_person_id: candidate.root_person_id,
      p_display_name: candidate.suggested_lineage_name,
    })
    setBusyId('')
    setConfirmId('')
    if (error) {
      const text = error.message.toLowerCase()
      setMessage(text.includes('overlap')
        ? 'تغيرت الشجرة وأصبح هذا المرشح متداخلًا مع نسب معتمد. أعد الفحص قبل الاعتماد.'
        : 'تعذر اعتماد الأصل والفروع. راجع بيانات الشخص ثم أعد المحاولة.')
      await loadCandidates()
      return
    }
    setMessage(`تم اعتماد ${candidate.suggested_lineage_name} وإنشاء الفروع المباشرة تلقائيًا.`)
    await loadCandidates()
  }

  if (!isAdmin) return null

  const launcher = portalTarget ? createPortal(
    <button
      type="button"
      role="tab"
      className={`lineage-structure-admin-tab ${open ? 'active' : ''}`}
      aria-selected={open}
      onClick={() => { setOpen(true); if (!loaded) void loadCandidates() }}
    >
      الأصول والفروع <span>{loaded ? counts.ready : '…'}</span>
    </button>,
    portalTarget,
  ) : null

  return (
    <>
      {launcher}
      {open && createPortal(
        <div className="lineage-structure-overlay" role="dialog" aria-modal="true" aria-label="الأصول والفروع">
          <section className="lineage-structure-screen">
            <header className="lineage-structure-header">
              <div>
                <span className="eyebrow">هيكلة شجرة العائلة</span>
                <h1>الأصول والفروع</h1>
                <p>النظام يكتشف الجد الأعلى المحتمل والفروع المباشرة. الاعتماد يتم فقط بقرار منك.</p>
              </div>
              <button type="button" className="lineage-structure-close" onClick={() => setOpen(false)} aria-label="إغلاق">×</button>
            </header>

            <div className="lineage-structure-body">
              <section className="lineage-structure-stats" aria-label="ملخص الأصول المرشحة">
                <article className="ready"><small>جاهز للاعتماد</small><strong>{counts.ready}</strong><span>بدون تداخل مع نسب قائم</span></article>
                <article><small>مرشح قوي</small><strong>{counts.high}</strong><span>ذرية ممتدة لأكثر من جيل</span></article>
                <article><small>يحتاج مراجعة</small><strong>{counts.review}</strong><span>لا يعتمد تلقائيًا</span></article>
                <article className={counts.overlap ? 'warning' : 'safe'}><small>تداخل</small><strong>{counts.overlap}</strong><span>{counts.overlap ? 'مرتبط بنسب قائم' : 'لا يوجد'}</span></article>
              </section>

              <section className="lineage-structure-tools">
                <div className="lineage-structure-filters" role="tablist" aria-label="تصفية الأصول">
                  <button type="button" className={filter === 'ready' ? 'active' : ''} onClick={() => setFilter('ready')}>جاهز <span>{counts.ready}</span></button>
                  <button type="button" className={filter === 'review' ? 'active' : ''} onClick={() => setFilter('review')}>مراجعة <span>{counts.review}</span></button>
                  <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>الكل <span>{candidates.length}</span></button>
                </div>
                <label className="lineage-structure-search"><span>بحث</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="اسم الجد أو أحد الفروع" /></label>
                <button type="button" className="lineage-structure-refresh" disabled={loading} onClick={() => void loadCandidates()}>{loading ? 'جارٍ التحليل…' : '↻ إعادة التحليل'}</button>
              </section>

              {message && <div className="lineage-structure-message" role="status">{message}</div>}

              {loading && !loaded ? <div className="lineage-structure-loading">جارٍ تحليل مسارات النسب…</div> : visibleCandidates.length ? (
                <div className="lineage-structure-list">
                  {visibleCandidates.map((candidate) => {
                    const spouses = safePeople(candidate.spouses)
                    const branches = safePeople(candidate.branches)
                    const confirming = confirmId === candidate.root_person_id
                    return (
                      <article className={`lineage-structure-card ${candidate.confidence}`} key={candidate.root_person_id}>
                        <header>
                          <div>
                            <span className={`lineage-structure-badge ${candidate.confidence}`}>{confidenceLabel[candidate.confidence]}</span>
                            <h2>{candidate.root_name}</h2>
                            <small>{candidate.suggested_lineage_name}</small>
                          </div>
                          <button type="button" className="lineage-structure-open-person" onClick={() => navigateToPerson(candidate.root_person_id)}>فتح الملف</button>
                        </header>

                        <div className="lineage-structure-metrics">
                          <span><small>الذرية</small><strong>{candidate.descendant_count}</strong></span>
                          <span><small>عمق الأجيال</small><strong>{candidate.max_depth}</strong></span>
                          <span><small>الفروع المباشرة</small><strong>{candidate.direct_children_count}</strong></span>
                        </div>

                        {spouses.length > 0 && (
                          <div className="lineage-structure-spouses"><small>{candidate.root_gender === 'male' ? 'الزوجة' : 'الزوج'}</small><div>{spouses.map((person) => <button type="button" key={person.person_id} onClick={() => navigateToPerson(person.person_id)}>{person.full_name}</button>)}</div></div>
                        )}

                        {branches.length > 0 && (
                          <div className="lineage-structure-branches">
                            <small>الفروع المقترحة من الأبناء المباشرين</small>
                            <div>{branches.map((branch) => <button type="button" key={branch.person_id} onClick={() => navigateToPerson(branch.person_id)}>{branch.full_name}</button>)}</div>
                          </div>
                        )}

                        {candidate.overlap_count > 0 && (
                          <div className="lineage-structure-warning">يتقاطع هذا المسار مع نسب قائم في {candidate.overlap_count} من الأشخاص، لذلك تم إيقاف الاعتماد السريع حتى لا تتكرر الأنساب.</div>
                        )}

                        {!candidate.can_approve && candidate.overlap_count === 0 && (
                          <div className="lineage-structure-note">هذا مرشح غير محسوم حاليًا. راجع الوالدين أو ملف الشخص قبل اعتباره جدًّا أعلى.</div>
                        )}

                        {candidate.can_approve && !confirming && (
                          <button className="lineage-structure-approve" type="button" onClick={() => setConfirmId(candidate.root_person_id)}>اعتماد الأصل والفروع</button>
                        )}

                        {candidate.can_approve && confirming && (
                          <div className="lineage-structure-confirm">
                            <span>سيتم اعتماد <strong>{candidate.suggested_lineage_name}</strong> وإنشاء {branches.length} فرع مباشر. لا يتم حذف أي بيانات.</span>
                            <div>
                              <button className="primary" type="button" disabled={busyId === candidate.root_person_id} onClick={() => void approveCandidate(candidate)}>{busyId === candidate.root_person_id ? 'جارٍ الاعتماد…' : 'تأكيد الاعتماد'}</button>
                              <button type="button" disabled={busyId === candidate.root_person_id} onClick={() => setConfirmId('')}>إلغاء</button>
                            </div>
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="lineage-structure-empty"><strong>لا توجد أصول ضمن هذا التصنيف.</strong><span>أعد التحليل بعد استكمال المزيد من علاقات الوالدين.</span></div>
              )}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}
