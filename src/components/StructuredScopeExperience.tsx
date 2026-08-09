import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import '../structured-scope-experience.css'

type ScopeType = 'household' | 'lineage' | 'branch'

type PersonScopeRow = {
  scope_type: ScopeType
  scope_id: string
  scope_name: string
  relation_type: string
  source: 'derived' | 'legacy_migration' | 'manual'
}

type EventScopeRow = {
  event_id: string
  title: string
  scope_type: ScopeType | 'community'
  scope_id: string | null
  scope_name: string
}

function personIdFromHash() {
  const match = window.location.hash.match(/^#\/person\/([0-9a-f-]{36})/i)
  return match?.[1] ?? ''
}

function openScope(row: PersonScopeRow) {
  if (row.scope_type === 'household') {
    window.dispatchEvent(new CustomEvent('sila:open-household', { detail: { householdId: row.scope_id } }))
  }
}

function scopeTypeLabel(type: ScopeType) {
  if (type === 'household') return 'أسرة'
  if (type === 'lineage') return 'نسب'
  return 'فرع'
}

function PersonScopePanel({ personId }: { personId: string }) {
  const [rows, setRows] = useState<PersonScopeRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase || !personId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void supabase.rpc('list_person_scope_context_v1', { p_person_id: personId }).then(({ data }) => {
      if (cancelled) return
      setRows((data ?? []) as PersonScopeRow[])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [personId])

  const grouped = useMemo(() => {
    const result: Record<ScopeType, PersonScopeRow[]> = { lineage: [], branch: [], household: [] }
    for (const row of rows) {
      if (!result[row.scope_type].some((old) => old.scope_id === row.scope_id && old.relation_type === row.relation_type)) result[row.scope_type].push(row)
    }
    return result
  }, [rows])

  return (
    <section className="structured-person-context" aria-label="النسب والأسر المرتبطة">
      <header>
        <div><span className="eyebrow">السياق العائلي الصحيح</span><h2>النسب والأسر</h2><p>تُستنتج هذه الارتباطات تلقائيًا من الآباء والزواج والفروع المعتمدة؛ لا تحتاج إلى تسجيل عائلة يدويًا.</p></div>
        <span className="structured-context-count">{rows.length}</span>
      </header>

      {loading ? <div className="structured-context-loading">جارٍ بناء السياق…</div> : rows.length ? (
        <div className="structured-context-groups">
          {(['lineage', 'branch', 'household'] as ScopeType[]).map((type) => grouped[type].length ? (
            <div className={`structured-context-group ${type}`} key={type}>
              <small>{scopeTypeLabel(type)}</small>
              <div>
                {grouped[type].map((row) => (
                  <button type="button" key={`${row.scope_type}-${row.scope_id}-${row.relation_type}`} disabled={row.scope_type !== 'household'} onClick={() => openScope(row)}>
                    <span className="structured-scope-mark">{row.scope_name.trim().charAt(0) || 'ص'}</span>
                    <span><strong>{row.scope_name}</strong><small>{row.relation_type}{row.source === 'legacy_migration' ? ' · مُحوّل من السجل السابق' : ''}</small></span>
                    {row.scope_type === 'household' && <i>فتح الملف ‹</i>}
                  </button>
                ))}
              </div>
            </div>
          ) : null)}
        </div>
      ) : <div className="structured-context-empty">لا يوجد نسب أو أسرة يمكن إثباتها من البيانات الحالية بعد.</div>}
    </section>
  )
}

export default function StructuredScopeExperience() {
  const [personHost, setPersonHost] = useState<HTMLElement | null>(null)
  const [personId, setPersonId] = useState(personIdFromHash())
  const [eventScopes, setEventScopes] = useState<EventScopeRow[]>([])

  const loadEventScopes = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.rpc('list_event_scope_labels_v1', { p_limit: 300 })
    setEventScopes((data ?? []) as EventScopeRow[])
  }, [])

  useEffect(() => { void loadEventScopes() }, [loadEventScopes])

  useEffect(() => {
    const updateRoute = () => setPersonId(personIdFromHash())
    window.addEventListener('hashchange', updateRoute)
    return () => window.removeEventListener('hashchange', updateRoute)
  }, [])

  useEffect(() => {
    const byTitle = new Map<string, EventScopeRow>()
    for (const row of eventScopes) if (!byTitle.has(row.title)) byTitle.set(row.title, row)

    const apply = () => {
      const currentId = personIdFromHash()
      if (currentId !== personId) setPersonId(currentId)

      const legacyMembership = document.querySelector<HTMLElement>('.family-memberships-section')
      if (currentId && legacyMembership) {
        legacyMembership.style.display = 'none'
        let host = legacyMembership.parentElement?.querySelector<HTMLElement>(':scope > .structured-person-context-host') ?? null
        if (!host) {
          host = document.createElement('div')
          host.className = 'structured-person-context-host'
          legacyMembership.after(host)
        }
        if (host !== personHost) setPersonHost(host)
      } else if (!currentId && personHost) {
        setPersonHost(null)
      }

      for (const label of document.querySelectorAll<HTMLElement>('form.data-form label')) {
        const title = label.querySelector(':scope > span')?.textContent?.trim() ?? ''
        if (title.includes('العائلة المرتبطة')) {
          label.style.display = 'none'
          const form = label.closest<HTMLFormElement>('form.data-form')
          if (form && !form.querySelector('.event-auto-scope-note')) {
            const note = document.createElement('div')
            note.className = 'event-auto-scope-note full'
            note.innerHTML = '<strong>السياق يُحدد تلقائيًا</strong><span>اختر الأشخاص المرتبطين بالمناسبة، وسيحدد النظام الأسرة أو النسب أو الفرع المناسب دون إدخال إضافي.</span>'
            label.after(note)
          }
        }
      }
      for (const skeleton of document.querySelectorAll<HTMLElement>('.picker-skeleton')) {
        if (skeleton.textContent?.includes('العائلات')) skeleton.style.display = 'none'
      }

      const rolesPanel = document.querySelector<HTMLElement>('.rbac-users-panel')
      if (rolesPanel) {
        for (const oldManager of rolesPanel.querySelectorAll<HTMLElement>('.family-scope-manager')) oldManager.style.display = 'none'
        const walker = document.createTreeWalker(rolesPanel, NodeFilter.SHOW_TEXT)
        let node = walker.nextNode()
        while (node) {
          if (node.textContent) {
            node.textContent = node.textContent
              .replaceAll('مسؤول عائلة', 'مسؤول نطاق')
              .replaceAll('نطاقات العائلات', 'نطاقات الإشراف')
              .replaceAll('العائلات المعيّنة', 'النطاقات المعيّنة')
          }
          node = walker.nextNode()
        }
      }

      for (const card of document.querySelectorAll<HTMLElement>('.news-card')) {
        const title = card.querySelector('h2')?.textContent?.trim() ?? ''
        const row = byTitle.get(title)
        if (!row) continue
        const meta = card.querySelector<HTMLElement>('.news-meta')
        if (!meta) continue
        for (const item of meta.querySelectorAll<HTMLElement>(':scope > span')) {
          if (item.querySelector('b')?.textContent?.trim() === '⌂') item.remove()
        }
        let badge = meta.querySelector<HTMLElement>('.structured-event-scope')
        if (!badge) {
          badge = document.createElement('span')
          badge.className = 'structured-event-scope'
          meta.append(badge)
        }
        const nextHtml = `<b aria-hidden="true">⌘</b>${row.scope_name}`
        if (badge.innerHTML !== nextHtml) badge.innerHTML = nextHtml
        if (badge.dataset.scopeType !== row.scope_type) badge.dataset.scopeType = row.scope_type
        if (row.scope_type === 'household' && row.scope_id) {
          badge.classList.add('clickable')
          badge.onclick = () => window.dispatchEvent(new CustomEvent('sila:open-household', { detail: { householdId: row.scope_id } }))
        } else {
          badge.classList.remove('clickable')
          badge.onclick = null
        }
      }
    }

    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [eventScopes, personHost, personId])

  if (!personHost || !personId || !document.body.contains(personHost)) return null
  return createPortal(<PersonScopePanel personId={personId} />, personHost)
}
