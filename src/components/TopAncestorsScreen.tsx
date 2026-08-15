import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { normalizeArabicSearch } from '../lib/arabicSearch'
import '../top-ancestors.css'

type Gender = 'male' | 'female' | null

type RelativeRef = {
  person_id: string
  full_name: string
  gender: Gender
  photo_url?: string | null
}

type TopAncestor = {
  root_person_id: string
  root_name: string
  root_gender: Gender
  photo_url: string | null
  lineage_id: string
  lineage_name: string
  descendant_count: number
  max_depth: number
  direct_children_count: number
  spouses: RelativeRef[] | null
  branches: RelativeRef[] | null
}

type SortMode = 'descendants' | 'generations' | 'name'

function isAncestorsScreen() {
  if (typeof window === 'undefined') return false
  return new URL(window.location.href).searchParams.get('screen') === 'ancestors'
}

function safePeople(value: RelativeRef[] | null | undefined) {
  return Array.isArray(value) ? value : []
}

function avatar(person: Pick<RelativeRef, 'full_name' | 'photo_url'>, className: string) {
  if (person.photo_url) {
    return <span className={className}><img src={person.photo_url} alt="" loading="lazy" referrerPolicy="no-referrer" /></span>
  }
  return <span className={className}>{person.full_name.trim().charAt(0) || '؟'}</span>
}

export default function TopAncestorsScreen() {
  const [active, setActive] = useState(isAncestorsScreen)
  const [mainTarget, setMainTarget] = useState<HTMLElement | null>(null)
  const [desktopNavTarget, setDesktopNavTarget] = useState<HTMLElement | null>(null)
  const [homeStatsTarget, setHomeStatsTarget] = useState<HTMLElement | null>(null)
  const [ancestors, setAncestors] = useState<TopAncestor[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('descendants')

  const locateTargets = useCallback(() => {
    setMainTarget(document.querySelector<HTMLElement>('.app-shell > main'))
    setDesktopNavTarget(document.querySelector<HTMLElement>('.desktop-nav'))
    setHomeStatsTarget(document.querySelector<HTMLElement>('.unified-home-stats'))
  }, [])

  useEffect(() => {
    locateTargets()
    const observer = new MutationObserver(locateTargets)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [locateTargets])

  useEffect(() => {
    const sync = () => setActive(isAncestorsScreen())
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('top-ancestors-active', active)
    if (active) window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    return () => document.body.classList.remove('top-ancestors-active')
  }, [active])

  useEffect(() => {
    function leaveAncestorsForNormalNavigation(event: MouseEvent) {
      if (!active) return
      const target = event.target
      if (!(target instanceof Element)) return
      const navButton = target.closest('.desktop-nav button, .mobile-bottom-nav button, .brand')
      if (!navButton || navButton.classList.contains('top-ancestors-nav-button')) return
      const url = new URL(window.location.href)
      url.searchParams.delete('screen')
      window.history.replaceState(window.history.state, '', url.toString())
      setActive(false)
    }

    document.addEventListener('click', leaveAncestorsForNormalNavigation, true)
    return () => document.removeEventListener('click', leaveAncestorsForNormalNavigation, true)
  }, [active])

  const loadAncestors = useCallback(async () => {
    if (!supabase) {
      setMessage('تعذر الاتصال بقاعدة بيانات المنصة.')
      setLoaded(true)
      return
    }

    setLoading(true)
    setMessage('')
    const { data, error } = await supabase.rpc('get_public_top_ancestors')
    setLoading(false)
    setLoaded(true)

    if (error) {
      setAncestors([])
      setMessage('تعذر تحميل الأجداد الأعلى الآن. أعد المحاولة بعد تحديث الصفحة.')
      return
    }

    setAncestors((data ?? []) as TopAncestor[])
  }, [])

  useEffect(() => {
    if (!active || loaded || loading) return
    void loadAncestors()
  }, [active, loaded, loading, loadAncestors])

  useEffect(() => {
    const url = new URL(window.location.href)
    const requestedPersonId = url.searchParams.get('ancestorTree')?.trim()
    if (!requestedPersonId || !window.location.hash.startsWith(`#/person/${requestedPersonId}`)) return

    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      const personPageReady = Boolean(document.querySelector('.detail-page'))
      const treeButton = [...document.querySelectorAll<HTMLButtonElement>('.desktop-nav button')]
        .find((button) => button.textContent?.includes('شجرة العائلة'))

      if (personPageReady && treeButton) {
        window.clearInterval(timer)
        treeButton.click()
        const cleanUrl = new URL(window.location.href)
        cleanUrl.searchParams.delete('ancestorTree')
        cleanUrl.searchParams.delete('screen')
        window.history.replaceState(window.history.state, '', cleanUrl.toString())
        return
      }

      if (attempts >= 50) {
        window.clearInterval(timer)
        const cleanUrl = new URL(window.location.href)
        cleanUrl.searchParams.delete('ancestorTree')
        window.history.replaceState(window.history.state, '', cleanUrl.toString())
      }
    }, 120)

    return () => window.clearInterval(timer)
  }, [])

  function openScreen() {
    const url = new URL(window.location.href)
    url.searchParams.set('screen', 'ancestors')
    url.searchParams.delete('ancestorTree')
    window.history.pushState(window.history.state, '', url.toString())
    setActive(true)
  }

  function closeScreen() {
    const url = new URL(window.location.href)
    url.searchParams.delete('screen')
    window.history.replaceState(window.history.state, '', url.toString())
    setActive(false)
  }

  function openPerson(personId: string) {
    const url = new URL(window.location.href)
    url.searchParams.delete('screen')
    url.searchParams.delete('ancestorTree')
    url.hash = `/person/${personId}`
    window.location.assign(url.toString())
  }

  function openTree(personId: string) {
    const url = new URL(window.location.href)
    url.searchParams.delete('screen')
    url.searchParams.set('ancestorTree', personId)
    url.hash = `/person/${personId}`
    window.location.assign(url.toString())
  }

  const visibleAncestors = useMemo(() => {
    const term = normalizeArabicSearch(search)
    const filtered = ancestors.filter((ancestor) => {
      if (!term) return true
      const names = [
        ancestor.root_name,
        ancestor.lineage_name,
        ...safePeople(ancestor.spouses).map((person) => person.full_name),
        ...safePeople(ancestor.branches).map((person) => person.full_name),
      ].join(' ')
      return normalizeArabicSearch(names).includes(term)
    })

    return [...filtered].sort((a, b) => {
      if (sortMode === 'name') return a.root_name.localeCompare(b.root_name, 'ar')
      if (sortMode === 'generations') return b.max_depth - a.max_depth || b.descendant_count - a.descendant_count
      return b.descendant_count - a.descendant_count || b.max_depth - a.max_depth
    })
  }, [ancestors, search, sortMode])

  const maxDescendants = useMemo(() => Math.max(0, ...ancestors.map((ancestor) => ancestor.descendant_count)), [ancestors])
  const maxGenerations = useMemo(() => Math.max(0, ...ancestors.map((ancestor) => ancestor.max_depth)), [ancestors])

  const desktopLauncher = desktopNavTarget ? createPortal(
    <button type="button" className={`top-ancestors-nav-button ${active ? 'active' : ''}`} onClick={openScreen}>الأجداد الأعلى</button>,
    desktopNavTarget,
  ) : null

  const homeLauncher = homeStatsTarget ? createPortal(
    <button className="service-tile top-ancestors-home-tile" type="button" onClick={openScreen}>
      <span className="service-icon">ج</span>
      <span><strong>الأجداد الأعلى</strong><small>الأصول المعتمدة وفروعها</small></span>
    </button>,
    homeStatsTarget,
  ) : null

  const screen = active && mainTarget ? createPortal(
    <section className="top-ancestors-screen" aria-label="الأجداد الأعلى">
      <header className="top-ancestors-hero">
        <button type="button" className="top-ancestors-back" onClick={closeScreen}>→ العودة</button>
        <div className="top-ancestors-title">
          <span className="eyebrow">أصول شجرة العائلة</span>
          <h1>الأجداد الأعلى</h1>
          <p>جميع الأصول المعتمدة التي تبدأ منها فروع النسب في المنصة. تتحدث هذه الشاشة تلقائيًا مع أي تعديل معتمد في العلاقات.</p>
        </div>
        <div className="top-ancestors-mark" aria-hidden="true"><span>ج</span><i /><b /></div>
      </header>

      <section className="top-ancestors-summary" aria-label="ملخص الأجداد الأعلى">
        <article><small>الأجداد الأعلى</small><strong>{loaded ? ancestors.length : '—'}</strong><span>أصل معتمد</span></article>
        <article><small>أكبر شجرة</small><strong>{loaded ? maxDescendants : '—'}</strong><span>من الذرية</span></article>
        <article><small>أقصى امتداد</small><strong>{loaded ? maxGenerations : '—'}</strong><span>أجيال مسجلة</span></article>
      </section>

      <section className="top-ancestors-tools">
        <label className="top-ancestors-search">
          <span>بحث</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم الجد أو الزوجة أو أحد الفروع" />
        </label>
        <label className="top-ancestors-sort">
          <span>ترتيب حسب</span>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="descendants">أكبر عدد من الذرية</option>
            <option value="generations">أكبر عدد من الأجيال</option>
            <option value="name">الاسم</option>
          </select>
        </label>
        <button type="button" className="top-ancestors-refresh" disabled={loading} onClick={() => void loadAncestors()}>{loading ? 'جارٍ التحديث…' : '↻ تحديث'}</button>
      </section>

      {message && <div className="top-ancestors-message" role="status">{message}</div>}

      {loading && !loaded ? (
        <div className="top-ancestors-loading"><span /><strong>جارٍ ترتيب الأصول والفروع…</strong></div>
      ) : visibleAncestors.length ? (
        <div className="top-ancestors-grid">
          {visibleAncestors.map((ancestor) => {
            const spouses = safePeople(ancestor.spouses)
            const branches = safePeople(ancestor.branches)
            const visibleBranches = branches.slice(0, 6)
            const remainingBranches = Math.max(0, branches.length - visibleBranches.length)
            const title = ancestor.root_gender === 'female' ? 'الجدة العليا' : 'الجد الأعلى'

            return <article className="top-ancestor-card" key={ancestor.lineage_id}>
              <div className="top-ancestor-card-head">
                <button type="button" className="top-ancestor-identity" onClick={() => openPerson(ancestor.root_person_id)}>
                  {avatar({ full_name: ancestor.root_name, photo_url: ancestor.photo_url }, 'top-ancestor-avatar')}
                  <span className="top-ancestor-copy"><small>{title}</small><strong>{ancestor.root_name}</strong><em>{ancestor.lineage_name}</em></span>
                </button>
              </div>

              {spouses.length > 0 && <div className="top-ancestor-spouses">
                <small>{ancestor.root_gender === 'female' ? 'الزوج' : spouses.length > 1 ? 'الزوجات' : 'الزوجة'}</small>
                <div>{spouses.map((spouse) => <button type="button" key={spouse.person_id} onClick={() => openPerson(spouse.person_id)}>{avatar(spouse, 'top-ancestor-mini-avatar')}<span>{spouse.full_name}</span></button>)}</div>
              </div>}

              <div className="top-ancestor-metrics">
                <span><strong>{ancestor.direct_children_count}</strong><small>أبناء مباشرين</small></span>
                <span><strong>{ancestor.descendant_count}</strong><small>من الذرية</small></span>
                <span><strong>{ancestor.max_depth}</strong><small>أجيال</small></span>
              </div>

              <div className="top-ancestor-branches">
                <div className="top-ancestor-section-title"><small>الفروع الرئيسية</small><span>{branches.length}</span></div>
                {visibleBranches.length ? <div className="top-ancestor-branch-list">
                  {visibleBranches.map((branch) => <button type="button" key={branch.person_id} onClick={() => openPerson(branch.person_id)}>{avatar(branch, 'top-ancestor-branch-avatar')}<span>{branch.full_name}</span></button>)}
                  {remainingBranches > 0 && <span className="top-ancestor-more">+{remainingBranches}</span>}
                </div> : <p>لم تُسجل فروع مباشرة لهذا الأصل بعد.</p>}
              </div>

              <div className="top-ancestor-actions">
                <button type="button" className="primary" onClick={() => openTree(ancestor.root_person_id)}>عرض الشجرة</button>
                <button type="button" className="secondary" onClick={() => openPerson(ancestor.root_person_id)}>فتح الملف</button>
              </div>
            </article>
          })}
        </div>
      ) : (
        <div className="top-ancestors-empty"><span>⌁</span><strong>{search ? 'لا توجد نتائج مطابقة' : 'لا توجد أصول معتمدة بعد'}</strong><p>{search ? 'جرّب اسمًا آخر أو امسح عبارة البحث.' : 'ستظهر الأصول هنا بعد اعتمادها من إدارة هيكلة النسب.'}</p></div>
      )}
    </section>,
    mainTarget,
  ) : null

  return <>{desktopLauncher}{homeLauncher}{screen}</>
}
