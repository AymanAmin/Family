import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { normalizeArabicSearch } from '../lib/arabicSearch'
import PeoplePicker from './PeoplePicker'
import DuplicatePersonCheck from './DuplicatePersonCheck'
import '../lineage-review.css'

type Gender = 'male' | 'female' | null
type Category = 'conflict' | 'duplicate' | 'unknown' | 'incomplete'
type Filter = 'all' | Category

type Suggestion = {
  person_id: string
  full_name: string
  gender: Gender
}

type DuplicateRecord = {
  id: string
  full_name: string
  gender: Gender
  birth_year: number | null
  family_id: string | null
}

type IssueDetail = {
  parent_count?: number
  father_names?: string[]
  mother_names?: string[]
  unknown_parent_names?: string[]
  suggestion_count?: number
  suggestions?: Suggestion[]
  duplicate_count?: number
  records?: DuplicateRecord[]
}

type IssueRow = {
  issue_key: string
  category: Category
  issue_type: string
  severity: 'high' | 'medium' | 'low'
  person_id: string
  person_name: string
  detail: IssueDetail | null
}

type EditorMode = 'existing' | 'new'

const issueLabels: Record<string, string> = {
  multiple_fathers: 'أكثر من أب مسجل',
  multiple_mothers: 'أكثر من أم مسجلة',
  more_than_two_parents: 'أكثر من والدين',
  parent_gender_missing: 'بيانات الوالد تحتاج مراجعة',
  missing_father: 'الأب غير مسجل',
  missing_mother: 'الأم غير مسجلة',
  possible_duplicate: 'تكرار محتمل',
  incomplete_parent_data: 'بيانات الوالدين غير مكتملة',
}

const filterLabels: Record<Filter, string> = {
  all: 'الكل',
  conflict: 'تعارضات',
  duplicate: 'تكرار محتمل',
  unknown: 'تحتاج مراجعة',
  incomplete: 'والد ناقص',
}

function safeArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : []
}

function genderLabel(gender: Gender) {
  if (gender === 'male') return 'ذكر'
  if (gender === 'female') return 'أنثى'
  return 'غير محدد'
}

function missingSlot(issue: IssueRow): 'father' | 'mother' | null {
  if (issue.issue_type === 'missing_father') return 'father'
  if (issue.issue_type === 'missing_mother') return 'mother'
  return null
}

function missingGender(issue: IssueRow): 'male' | 'female' | undefined {
  const slot = missingSlot(issue)
  if (slot === 'father') return 'male'
  if (slot === 'mother') return 'female'
  return undefined
}

function navigateToPerson(personId: string) {
  const url = new URL(window.location.href)
  url.hash = `/person/${personId}`
  window.location.assign(url.toString())
}

export default function AdminLineageReview() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [issues, setIssues] = useState<IssueRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(24)
  const [editingKey, setEditingKey] = useState('')
  const [editorMode, setEditorMode] = useState<EditorMode>('existing')
  const [selectedPersonId, setSelectedPersonId] = useState('')
  const [newPersonName, setNewPersonName] = useState('')
  const [busyKey, setBusyKey] = useState('')
  const [message, setMessage] = useState('')

  const loadIssues = useCallback(async () => {
    if (!supabase || !isAdmin) return
    setLoading(true)
    setMessage('')
    const { data, error } = await supabase.rpc('get_lineage_review_issues')
    setLoading(false)
    setLoaded(true)
    if (error) {
      setMessage('تعذر تحميل مراجعة النسب. تحقق من تطبيق آخر Migration ثم أعد المحاولة.')
      return
    }
    setIssues((data ?? []) as IssueRow[])
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
    void loadIssues()
  }, [isAdmin, portalTarget, loaded, loading, loadIssues])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  useEffect(() => {
    setVisibleCount(24)
  }, [filter, search])

  const counts = useMemo(() => ({
    all: issues.length,
    conflict: issues.filter((item) => item.category === 'conflict').length,
    duplicate: issues.filter((item) => item.category === 'duplicate').length,
    unknown: issues.filter((item) => item.category === 'unknown').length,
    incomplete: issues.filter((item) => item.category === 'incomplete').length,
  }), [issues])

  const filtered = useMemo(() => {
    const term = normalizeArabicSearch(search)
    return issues.filter((item) => {
      if (filter !== 'all' && item.category !== filter) return false
      if (!term) return true
      const detailText = [
        ...safeArray(item.detail?.father_names),
        ...safeArray(item.detail?.mother_names),
        ...safeArray(item.detail?.suggestions).map((entry) => entry.full_name),
        ...safeArray(item.detail?.records).map((entry) => entry.full_name),
      ].join(' ')
      return normalizeArabicSearch(`${item.person_name} ${detailText}`).includes(term)
    })
  }, [issues, filter, search])

  function beginEdit(issue: IssueRow, mode: EditorMode = 'existing') {
    setEditingKey(issue.issue_key)
    setEditorMode(mode)
    setSelectedPersonId('')
    setNewPersonName('')
    setMessage('')
  }

  function cancelEdit() {
    if (busyKey) return
    setEditingKey('')
    setSelectedPersonId('')
    setNewPersonName('')
  }

  async function linkParent(issue: IssueRow, parentId: string) {
    const slot = missingSlot(issue)
    if (!supabase || !slot || !parentId) return
    setBusyKey(issue.issue_key)
    setMessage('')
    const { data, error } = await supabase.rpc('link_person_in_context', {
      p_anchor_person_id: issue.person_id,
      p_existing_person_id: parentId,
      p_relation_slot: slot,
    })
    setBusyKey('')
    if (error) {
      setMessage(error.message.toLowerCase().includes('gender') ? 'الشخص المختار لا يطابق نوع الوالد المطلوب.' : 'تعذر ربط الوالد. راجع البيانات وحاول مرة أخرى.')
      return
    }
    setMessage(data === 'exists' ? 'هذه الصلة مسجلة أصلًا.' : `تم ربط ${slot === 'father' ? 'الأب' : 'الأم'} واعتماد الصلة.`)
    cancelEdit()
    await loadIssues()
  }

  async function createParent(issue: IssueRow) {
    const slot = missingSlot(issue)
    const gender = missingGender(issue)
    if (!supabase || !slot || !gender) return
    if (newPersonName.trim().length < 3) {
      setMessage('اكتب الاسم الكامل للوالد الجديد.')
      return
    }
    setBusyKey(issue.issue_key)
    setMessage('')
    const { error } = await supabase.rpc('create_person_in_context', {
      p_full_name: newPersonName.trim(),
      p_gender: gender,
      p_family_id: null,
      p_anchor_person_id: issue.person_id,
      p_relation_slot: slot,
    })
    setBusyKey('')
    if (error) {
      setMessage('تعذر إنشاء الشخص وربطه. تحقق من عدم وجود سجل سابق للاسم ثم أعد المحاولة.')
      return
    }
    setMessage(`تم إنشاء ${slot === 'father' ? 'الأب' : 'الأم'} وربطه واعتماد الصلة.`)
    cancelEdit()
    await loadIssues()
  }

  if (!isAdmin) return null

  const launcher = portalTarget ? createPortal(
    <button
      type="button"
      role="tab"
      className={`lineage-review-admin-tab ${open ? 'active' : ''}`}
      aria-selected={open}
      onClick={() => { setOpen(true); if (!loaded) void loadIssues() }}
    >
      مراجعة النسب <span>{loaded ? counts.all : '…'}</span>
    </button>,
    portalTarget,
  ) : null

  return (
    <>
      {launcher}
      {open && createPortal(
        <div className="lineage-review-overlay" role="dialog" aria-modal="true" aria-label="مراجعة النسب">
          <section className="lineage-review-screen">
            <header className="lineage-review-header">
              <div>
                <span className="eyebrow">جودة شجرة العائلة</span>
                <h1>مراجعة النسب</h1>
                <p>راجع النواقص والاشتباهات ثم صححها يدويًا. لا يتم حذف أو دمج أي سجل تلقائيًا.</p>
              </div>
              <button type="button" className="lineage-review-close" onClick={() => setOpen(false)} aria-label="إغلاق">×</button>
            </header>

            <div className="lineage-review-body">
              <section className="lineage-review-stats" aria-label="ملخص مشاكل النسب">
                <article className="safe"><small>تعارضات فعلية</small><strong>{counts.conflict}</strong><span>{counts.conflict ? 'تحتاج قرارًا يدويًا' : 'لا توجد حاليًا'}</span></article>
                <article><small>والد ناقص</small><strong>{counts.incomplete}</strong><span>يمكن استكمالها من هنا</span></article>
                <article><small>تكرار محتمل</small><strong>{counts.duplicate}</strong><span>مراجعة فقط دون دمج تلقائي</span></article>
                <article><small>تحتاج مراجعة</small><strong>{counts.unknown}</strong><span>بيانات غير حاسمة</span></article>
              </section>

              <section className="lineage-review-tools">
                <div className="lineage-review-filters" role="tablist" aria-label="تصفية مشاكل النسب">
                  {(Object.keys(filterLabels) as Filter[]).map((key) => (
                    <button type="button" key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
                      {filterLabels[key]} <span>{counts[key]}</span>
                    </button>
                  ))}
                </div>
                <label className="lineage-review-search">
                  <span>بحث</span>
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="اسم الشخص أو الوالد" />
                </label>
                <button type="button" className="lineage-review-refresh" disabled={loading} onClick={() => void loadIssues()}>{loading ? 'جارٍ الفحص…' : '↻ إعادة الفحص'}</button>
              </section>

              {message && <div className="lineage-review-message" role="status">{message}</div>}

              {loading && !loaded ? <div className="lineage-review-loading">جارٍ فحص شجرة النسب…</div> : filtered.length ? (
                <div className="lineage-review-list">
                  {filtered.slice(0, visibleCount).map((issue) => {
                    const detail = issue.detail ?? {}
                    const suggestions = safeArray(detail.suggestions)
                    const duplicateRecords = safeArray(detail.records)
                    const slot = missingSlot(issue)
                    const exactSuggestion = suggestions.length === 1 ? suggestions[0] : null
                    const isEditing = editingKey === issue.issue_key
                    return (
                      <article className={`lineage-review-card ${issue.category}`} key={issue.issue_key}>
                        <header>
                          <div>
                            <span className={`lineage-issue-badge ${issue.severity}`}>{issueLabels[issue.issue_type] || 'مراجعة النسب'}</span>
                            <h2>{issue.person_name}</h2>
                          </div>
                          <button type="button" className="lineage-open-person" onClick={() => navigateToPerson(issue.person_id)}>فتح الملف</button>
                        </header>

                        {issue.category === 'duplicate' ? (
                          <div className="lineage-duplicate-records">
                            <p>هذه السجلات تحمل اسمًا متطابقًا بعد توحيد الكتابة. افتحها وقارن العلاقات قبل اتخاذ أي قرار.</p>
                            {duplicateRecords.map((record) => (
                              <button type="button" key={record.id} onClick={() => navigateToPerson(record.id)}>
                                <span>{record.full_name.charAt(0) || '؟'}</span>
                                <div><strong>{record.full_name}</strong><small>{genderLabel(record.gender)}{record.birth_year ? ` · ${record.birth_year}` : ''}</small></div>
                                <b>فتح</b>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <>
                            <div className="lineage-known-parents">
                              <span><small>الأب المسجل</small><strong>{safeArray(detail.father_names).join('، ') || 'غير مسجل'}</strong></span>
                              <span><small>الأم المسجلة</small><strong>{safeArray(detail.mother_names).join('، ') || 'غير مسجلة'}</strong></span>
                            </div>

                            {slot && exactSuggestion && (
                              <div className="lineage-suggestion-box">
                                <div><small>اقتراح من علاقة الزواج المسجلة</small><strong>{exactSuggestion.full_name}</strong><span>لن تتم الإضافة إلا بعد اعتمادك.</span></div>
                                <button type="button" disabled={busyKey === issue.issue_key} onClick={() => void linkParent(issue, exactSuggestion.person_id)}>{busyKey === issue.issue_key ? 'جارٍ الربط…' : 'اعتماد المقترح'}</button>
                              </div>
                            )}

                            {slot && suggestions.length > 1 && <div className="lineage-review-note">يوجد أكثر من زوج/زوجة محتمل للوالد المسجل؛ اختر الوالد الصحيح يدويًا.</div>}

                            {slot && !isEditing && (
                              <button className="lineage-manual-fix" type="button" onClick={() => beginEdit(issue)}>
                                ＋ {slot === 'father' ? 'تحديد الأب' : 'تحديد الأم'} يدويًا
                              </button>
                            )}

                            {slot && isEditing && (
                              <section className="lineage-fix-editor">
                                <div className="lineage-fix-mode">
                                  <button type="button" className={editorMode === 'existing' ? 'active' : ''} onClick={() => setEditorMode('existing')}>شخص موجود</button>
                                  <button type="button" className={editorMode === 'new' ? 'active' : ''} onClick={() => setEditorMode('new')}>شخص جديد</button>
                                </div>

                                {editorMode === 'existing' ? (
                                  <>
                                    <PeoplePicker
                                      searchMode="broad"
                                      label={slot === 'father' ? 'اختر الأب' : 'اختر الأم'}
                                      value={selectedPersonId}
                                      onChange={setSelectedPersonId}
                                      excludeId={issue.person_id}
                                      genderFilter={missingGender(issue)}
                                      required
                                    />
                                    <div className="lineage-fix-actions">
                                      <button className="primary" type="button" disabled={!selectedPersonId || busyKey === issue.issue_key} onClick={() => void linkParent(issue, selectedPersonId)}>{busyKey === issue.issue_key ? 'جارٍ الربط…' : 'حفظ الصلة'}</button>
                                      <button type="button" onClick={cancelEdit}>إلغاء</button>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <label className="lineage-new-parent-name"><span>الاسم الكامل</span><input value={newPersonName} onChange={(event) => setNewPersonName(event.target.value)} placeholder="اكتب الاسم الكامل" /></label>
                                    <DuplicatePersonCheck name={newPersonName} onOpenPerson={(id) => { setSelectedPersonId(id); setEditorMode('existing'); setMessage('وجدنا سجلًا مشابهًا؛ تم اختياره بدل إنشاء نسخة جديدة.') }} />
                                    <div className="lineage-fix-actions">
                                      <button className="primary" type="button" disabled={newPersonName.trim().length < 3 || busyKey === issue.issue_key} onClick={() => void createParent(issue)}>{busyKey === issue.issue_key ? 'جارٍ الإنشاء…' : `إنشاء ${slot === 'father' ? 'الأب' : 'الأم'} وربطه`}</button>
                                      <button type="button" onClick={cancelEdit}>إلغاء</button>
                                    </div>
                                  </>
                                )}
                              </section>
                            )}

                            {!slot && <div className="lineage-review-note important">هذه الحالة تحتاج مراجعة العلاقات المسجلة من ملف الشخص. لا تُجرى أي إزالة تلقائية.</div>}
                          </>
                        )}
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="lineage-review-empty"><strong>لا توجد حالات ضمن هذا التصنيف.</strong><span>يمكن تغيير الفلتر أو إعادة الفحص.</span></div>
              )}

              {filtered.length > visibleCount && <button type="button" className="lineage-review-more" onClick={() => setVisibleCount((value) => value + 24)}>عرض المزيد · {filtered.length - visibleCount}</button>}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}