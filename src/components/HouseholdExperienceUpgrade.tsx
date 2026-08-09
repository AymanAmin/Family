import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import HouseholdShareTools, { clearHouseholdShareParam, householdIdFromLocation } from './HouseholdShareTools'
import '../household-experience.css'

type Gender = 'male' | 'female' | null

type HouseholdListRow = {
  household_id: string
  display_name: string
  husband_person_id: string
  husband_name: string
  spouse_count: number
  child_count: number
  spouse_names: string[]
  lineage_name: string | null
  branch_name: string | null
  total_count: number
}

type Person = {
  id: string
  full_name: string
  gender: Gender
  birth_year: number | null
  is_deceased: boolean
  description: string | null
}

type LineageContext = {
  lineage_name: string
  root_person_id: string
  root_name: string
  generation: number
  branch_person_id: string | null
  branch_name: string | null
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
  group_type: 'family_unit' | 'unassigned'
}

type Child = {
  id: string
  name: string
  gender: Gender
  childCount: number
}

type HouseholdGroup = {
  key: string
  familyUnitId: string | null
  spouseId: string | null
  spouseName: string | null
  spouseGender: Gender
  children: Child[]
  unassigned: boolean
}

type HouseholdOpenEvent = CustomEvent<{ householdId?: string }>

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeHousehold(item: Record<string, unknown>): HouseholdListRow {
  return {
    household_id: String(item.household_id ?? ''),
    display_name: String(item.display_name ?? ''),
    husband_person_id: String(item.husband_person_id ?? ''),
    husband_name: String(item.husband_name ?? ''),
    spouse_count: numberValue(item.spouse_count),
    child_count: numberValue(item.child_count),
    spouse_names: Array.isArray(item.spouse_names) ? item.spouse_names.map(String) : [],
    lineage_name: typeof item.lineage_name === 'string' ? item.lineage_name : null,
    branch_name: typeof item.branch_name === 'string' ? item.branch_name : null,
    total_count: numberValue(item.total_count),
  }
}

function displayLineage(value: string | null | undefined): string {
  if (!value) return 'النسب غير مكتمل بعد'
  return value.replace(/^عائلة\s+/, 'نسب ')
}

function groupRows(rows: HouseholdRpcRow[]): HouseholdGroup[] {
  const groups = new Map<string, HouseholdGroup>()
  for (const row of rows) {
    const key = row.family_unit_id || '__unassigned__'
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        familyUnitId: row.family_unit_id,
        spouseId: row.spouse_person_id,
        spouseName: row.spouse_name,
        spouseGender: row.spouse_gender,
        children: [],
        unassigned: row.group_type === 'unassigned',
      }
      groups.set(key, group)
    }
    if (row.child_person_id && row.child_name && !group.children.some((child) => child.id === row.child_person_id)) {
      group.children.push({
        id: row.child_person_id,
        name: row.child_name,
        gender: row.child_gender,
        childCount: numberValue(row.child_direct_child_count),
      })
    }
  }
  return [...groups.values()]
}

function openPerson(id: string): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('household')
  url.hash = `#/person/${id}`
  window.location.href = url.toString()
}

function HouseholdHomePreview({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<HouseholdListRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    let cancelled = false
    void supabase.rpc('list_households_v1', { p_query: null, p_limit: 6, p_offset: 0 }).then(({ data }) => {
      if (cancelled) return
      setRows((data ?? []).map((item: unknown) => normalizeHousehold(item as Record<string, unknown>)))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  return <section className="section-block household-home-block">
    <div className="section-title">
      <div><span className="eyebrow">دليل الأسر</span><h2>الأسر المنشأة تلقائيًا</h2></div>
      <button className="text-link" type="button" onClick={() => {
        const tab = [...document.querySelectorAll<HTMLButtonElement>('.directory-tabs button')].find((button) => button.textContent?.includes('الأسر'))
        if (tab) tab.click()
        else {
          const searchButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.trim() === 'البحث')
          searchButton?.click()
          window.setTimeout(() => [...document.querySelectorAll<HTMLButtonElement>('.directory-tabs button')].find((button) => button.textContent?.includes('الأسر'))?.click(), 150)
        }
      }}>عرض الكل</button>
    </div>
    {loading ? <div className="household-home-loading">جارٍ تحميل الأسر…</div> : rows.length ? <div className="cards-grid household-home-grid">
      {rows.map((item) => <button className="data-card interactive-card household-home-card" type="button" key={item.household_id} onClick={() => onOpen(item.household_id)}>
        <span className="card-symbol">{item.husband_name.trim().charAt(0) || 'أ'}</span>
        <div><h3>{item.display_name}</h3><p>{item.spouse_count === 1 ? item.spouse_names[0] || 'زوجة واحدة' : `${item.spouse_count} زوجات`} · {item.child_count} أبناء</p></div>
        <span className="card-chevron">‹</span>
      </button>)}
    </div> : <div className="empty-state"><strong>لا توجد أسر مكتملة بعد</strong><span>تظهر الأسرة تلقائيًا بمجرد اعتماد الزواج.</span></div>}
  </section>
}

function HouseholdProfile({ householdId, onClose }: { householdId: string; onClose: () => void }) {
  const [husband, setHusband] = useState<Person | null>(null)
  const [context, setContext] = useState<LineageContext | null>(null)
  const [groups, setGroups] = useState<HouseholdGroup[]>([])
  const [descendantCount, setDescendantCount] = useState(0)
  const [generationDepth, setGenerationDepth] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    document.body.classList.add('household-profile-open')
    return () => document.body.classList.remove('household-profile-open')
  }, [])

  useEffect(() => {
    if (!supabase) {
      setError('تعذر الاتصال بقاعدة البيانات.')
      setLoading(false)
      return
    }
    let cancelled = false
    async function load(): Promise<void> {
      setLoading(true)
      setError('')
      const [personResult, householdResult, contextResult, descendantsResult] = await Promise.all([
        supabase!.from('people').select('id,full_name,gender,birth_year,is_deceased,description').eq('id', householdId).maybeSingle(),
        supabase!.rpc('get_lineage_households_v2', { p_person_id: householdId }),
        supabase!.rpc('get_person_lineage_context', { p_person_id: householdId }),
        supabase!.rpc('get_lineage_descendants', { p_ancestor_person_id: householdId, p_max_depth: 8 }),
      ])
      if (cancelled) return
      if (personResult.error || !personResult.data || householdResult.error) {
        setError('تعذر تحميل ملف الأسرة الآن.')
        setLoading(false)
        return
      }
      setHusband(personResult.data as Person)
      setGroups(groupRows((householdResult.data ?? []) as HouseholdRpcRow[]))
      setContext((((contextResult.data ?? []) as LineageContext[])[0] ?? null))
      const descendants = (descendantsResult.data ?? []) as Array<{ generation?: number }>
      const generations = descendants.map((row) => numberValue(row.generation))
      setDescendantCount(descendants.filter((row) => numberValue(row.generation) > 0).length)
      setGenerationDepth(generations.length ? Math.max(...generations) : 0)
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [householdId])

  const spouseGroups = useMemo(() => groups.filter((group) => !group.unassigned && group.spouseId), [groups])
  const unassignedGroup = useMemo(() => groups.find((group) => group.unassigned) ?? null, [groups])
  const directChildrenCount = useMemo(() => new Set(groups.flatMap((group) => group.children.map((child) => child.id))).size, [groups])
  const householdName = husband ? `أسرة ${husband.full_name}` : 'ملف الأسرة'
  const lineageName = context ? displayLineage(context.lineage_name) : ''
  const branchName = context?.branch_name || ''

  return <div className="household-profile-layer" role="dialog" aria-modal="true" aria-label="ملف الأسرة">
    <div className="household-profile-page">
      <header className="household-profile-topbar">
        <button type="button" onClick={onClose} aria-label="إغلاق ملف الأسرة">×</button>
        <div><small>صلة القرابة</small><strong>ملف الأسرة</strong></div>
      </header>

      {loading ? <div className="household-profile-state">جارٍ بناء ملف الأسرة…</div> : error || !husband ? <div className="household-profile-state error">{error || 'الأسرة غير موجودة.'}</div> : <>
        <section className="household-profile-hero">
          <div className="household-profile-avatar">{husband.full_name.trim().charAt(0) || 'أ'}</div>
          <div className="household-profile-title">
            <span>ملف الأسرة</span>
            <h1>{householdName}</h1>
            <p>{context ? `${lineageName}${branchName ? ` · ${branchName}` : ''}` : 'يتحدث النسب تلقائيًا عند اكتمال بيانات الآباء.'}</p>
          </div>
          <button className="household-open-husband" type="button" onClick={() => openPerson(husband.id)}><span>الزوج</span><strong>{husband.full_name}</strong><i>‹</i></button>
        </section>

        <section className="household-profile-stats" aria-label="إحصائيات الأسرة">
          <article><strong>{spouseGroups.length}</strong><span>{spouseGroups.length === 1 ? 'زوجة' : 'زوجات'}</span></article>
          <article><strong>{directChildrenCount}</strong><span>أبناء</span></article>
          <article><strong>{descendantCount}</strong><span>الذرية</span></article>
          <article><strong>{generationDepth}</strong><span>أجيال</span></article>
        </section>

        <HouseholdShareTools
          householdId={householdId}
          householdName={householdName}
          husbandName={husband.full_name}
          lineageName={lineageName}
          branchName={branchName}
          spouseCount={spouseGroups.length}
          directChildrenCount={directChildrenCount}
          descendantCount={descendantCount}
          generationDepth={generationDepth}
          groups={groups.map((group) => ({ spouseName: group.spouseName, children: group.children.map((child) => ({ name: child.name })), unassigned: group.unassigned }))}
        />

        <section className="household-profile-context" aria-label="الأسرة والنسب">
          <header><span>الأسرة والنسب</span><strong>موقع الأسرة داخل النسب</strong></header>
          <div className="household-profile-context-grid">
            <div><small>النسب</small><strong>{lineageName || 'غير محدد بعد'}</strong></div>
            <div><small>الفرع</small><strong>{branchName || 'غير محدد بعد'}</strong></div>
          </div>
        </section>

        <section className="household-marriages-section">
          <header><div><span>الزوجات والأبناء</span><h2>تكوين الأسرة</h2></div><b>{spouseGroups.length}</b></header>
          <div className="household-marriage-list">
            {spouseGroups.map((group, index) => <article className="household-marriage-card" key={group.key}>
              <div className="household-spouse-heading">
                <button type="button" className={group.spouseGender === 'female' ? 'female' : ''} onClick={() => group.spouseId && openPerson(group.spouseId)}>
                  <span>{group.spouseName?.trim().charAt(0) || '؟'}</span>
                  <span><small>الزوجة {spouseGroups.length > 1 ? index + 1 : ''}</small><strong>{group.spouseName}</strong></span>
                  <i>‹</i>
                </button>
                <em>{group.children.length} أبناء</em>
              </div>
              {group.children.length ? <div className="household-child-grid">{group.children.map((child) => <button type="button" key={child.id} className={child.gender === 'female' ? 'female' : ''} onClick={() => openPerson(child.id)}>
                <span>{child.name.trim().charAt(0) || '؟'}</span>
                <span><strong>{child.name}</strong><small>{child.childCount ? `${child.childCount} أبناء` : 'لا أبناء مسجلون'}</small></span>
                <i>‹</i>
              </button>)}</div> : <div className="household-no-children">لا يوجد أبناء مشتركون مسجلون لهذه الزيجة.</div>}
            </article>)}
          </div>
        </section>

        {unassignedGroup && unassignedGroup.children.length > 0 && <section className="household-unassigned-section">
          <div><span>بيانات غير مكتملة</span><h2>الوالد/الوالدة الآخر غير محدد</h2><p>هؤلاء الأبناء مرتبطون برأس الأسرة، لكن البيانات الحالية لا تكفي لإسنادهم إلى زواج محدد. لن يقوم النظام بالتخمين.</p></div>
          <div className="household-child-grid">{unassignedGroup.children.map((child) => <button type="button" key={child.id} onClick={() => openPerson(child.id)}><span>{child.name.trim().charAt(0) || '؟'}</span><span><strong>{child.name}</strong><small>بحاجة لاستكمال الوالدين</small></span><i>‹</i></button>)}</div>
        </section>}

        <section className="household-profile-note">يُحدّث ملف الأسرة تلقائيًا من الزواج وعلاقات الأب والأم والنسب المعتمدة.</section>
      </>}
    </div>
  </div>
}

export default function HouseholdExperienceUpgrade() {
  const [householdId, setHouseholdId] = useState('')
  const [homeHost, setHomeHost] = useState<HTMLElement | null>(null)
  const [householdCount, setHouseholdCount] = useState<number | null>(null)

  useEffect(() => {
    const directHouseholdId = householdIdFromLocation()
    if (directHouseholdId) setHouseholdId(directHouseholdId)
  }, [])

  useEffect(() => {
    if (!supabase) return
    void supabase.rpc('get_household_stats_v1').then(({ data }) => {
      const row = ((data ?? []) as Array<{ household_count?: number }>)[0]
      if (row) setHouseholdCount(numberValue(row.household_count))
    })
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const id = (event as HouseholdOpenEvent).detail?.householdId
      if (id) setHouseholdId(id)
    }
    window.addEventListener('sila:open-household', handler)
    return () => window.removeEventListener('sila:open-household', handler)
  }, [])

  useEffect(() => {
    let host: HTMLElement | null = null
    const apply = () => {
      const anchor = document.querySelector<HTMLElement>('.household-home-anchor')
      if (anchor && !document.querySelector('.household-home-portal-host')) {
        host = document.createElement('div')
        host.className = 'household-home-portal-host'
        anchor.replaceChildren(host)
        setHomeHost(host)
      }

      for (const button of document.querySelectorAll<HTMLButtonElement>('.segmented-control button')) {
        if (button.textContent?.trim() === 'عائلة') {
          button.style.display = 'none'
          if (button.classList.contains('active')) {
            const personButton = [...button.parentElement!.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === 'شخص')
            personButton?.click()
          }
        }
      }

      for (const button of document.querySelectorAll<HTMLButtonElement>('.desktop-nav button, .service-tile, .home-section-heading button')) {
        if (button.textContent?.trim() === 'شجرة العائلة') button.textContent = 'شجرة النسب'
      }
      for (const heading of document.querySelectorAll<HTMLElement>('.home-section-heading h2')) {
        if (heading.textContent?.trim() === 'شجرة العائلة') heading.textContent = 'شجرة النسب'
      }
      for (const strong of document.querySelectorAll<HTMLElement>('.service-tile strong')) {
        if (strong.textContent?.trim() === 'العائلات') {
          strong.textContent = 'الأسر'
          const tile = strong.closest<HTMLButtonElement>('.service-tile')
          const small = tile?.querySelector('small')
          const icon = tile?.querySelector<HTMLElement>('.service-icon')
          if (small) small.textContent = 'الأسر المنشأة تلقائيًا'
          if (icon && householdCount != null) icon.textContent = String(householdCount)
        }
      }
      for (const input of document.querySelectorAll<HTMLInputElement>('input[placeholder*="عائلة"]')) {
        input.placeholder = input.placeholder.replace('عائلة', 'أسرة')
        input.setAttribute('aria-label', (input.getAttribute('aria-label') || '').replace('عائلة', 'أسرة'))
      }
    }

    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      if (host) host.remove()
    }
  }, [householdCount])

  function closeHousehold(): void {
    setHouseholdId('')
    clearHouseholdShareParam()
    document.body.classList.remove('household-profile-open')
  }

  return <>
    {homeHost && createPortal(<HouseholdHomePreview onOpen={setHouseholdId} />, homeHost)}
    {householdId && <HouseholdProfile householdId={householdId} onClose={closeHousehold} />}
  </>
}
