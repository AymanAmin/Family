import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type PendingModerationCounts = {
  primary_count: number
  edit_count: number
  membership_count: number
  relationship_change_count: number
  secondary_count: number
  total_count: number
}

const EMPTY_COUNTS: PendingModerationCounts = {
  primary_count: 0,
  edit_count: 0,
  membership_count: 0,
  relationship_change_count: 0,
  secondary_count: 0,
  total_count: 0,
}

const MODERATOR_ROLES = new Set(['family_moderator', 'content_moderator', 'admin', 'super_admin'])

function normalizeCounts(value: unknown): PendingModerationCounts {
  const raw = Array.isArray(value) ? value[0] : value
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    primary_count: Number(row.primary_count || 0),
    edit_count: Number(row.edit_count || 0),
    membership_count: Number(row.membership_count || 0),
    relationship_change_count: Number(row.relationship_change_count || 0),
    secondary_count: Number(row.secondary_count || 0),
    total_count: Number(row.total_count || 0),
  }
}

function findAdminNavigationButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.desktop-nav button, .mobile-bottom-nav button'))
    .find((button) => button.textContent?.includes('الإدارة')) || null
}

export function openAdminModeration(tab: 'requests' | 'edits' = 'requests') {
  const navigationButton = findAdminNavigationButton()
  navigationButton?.click()

  window.setTimeout((): void => {
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.admin-console-tabs button'))
    const target = tabs[tab === 'edits' ? 1 : 0]
    target?.click()
    document.querySelector('.admin-console')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 120)
}

export default function AdminPendingDashboard() {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState('')
  const [counts, setCounts] = useState<PendingModerationCounts>(EMPTY_COUNTS)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [loading, setLoading] = useState(false)

  const canModerate = useMemo(() => MODERATOR_ROLES.has(role), [role])

  const loadCounts = useCallback(async () => {
    if (!supabase || !session || !MODERATOR_ROLES.has(role)) {
      setCounts(EMPTY_COUNTS)
      return
    }

    setLoading(true)
    const { data, error } = await supabase.rpc('get_pending_moderation_counts')
    setLoading(false)
    if (error) return

    const next = normalizeCounts(data)
    setCounts(next)
    window.dispatchEvent(new CustomEvent('sila:pending-counts-updated', { detail: next }))
  }, [role, session])

  useEffect(() => {
    if (!supabase) return

    let mounted = true
    async function syncContext(nextSession: Session | null) {
      if (!mounted) return
      setSession(nextSession)
      if (!nextSession) {
        setRole('')
        setCounts(EMPTY_COUNTS)
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', nextSession.user.id)
        .maybeSingle()
      if (!mounted) return
      setRole(String(data?.role || ''))
    }

    void supabase.auth.getSession().then(({ data }) => syncContext(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncContext(nextSession)
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!canModerate) return
    void loadCounts()
    const interval = window.setInterval((): void => { void loadCounts() }, 45_000)
    const refresh = (): void => { void loadCounts() }
    window.addEventListener('sila:moderation-updated', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('sila:moderation-updated', refresh)
    }
  }, [canModerate, loadCounts])

  useEffect(() => {
    const placeMount = (): void => {
      const consoleElement = document.querySelector<HTMLElement>('.admin-console')
      const tabs = consoleElement?.querySelector<HTMLElement>('.admin-console-tabs')
      if (!consoleElement || !tabs) {
        setPortalTarget((current) => current?.isConnected ? current : null)
        return
      }

      let mount = consoleElement.querySelector<HTMLElement>(':scope > .admin-pending-dashboard-mount')
      if (!mount) {
        mount = document.createElement('div')
        mount.className = 'admin-pending-dashboard-mount'
        consoleElement.insertBefore(mount, tabs)
      }
      setPortalTarget(mount)
    }

    placeMount()
    const observer = new MutationObserver(placeMount)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const handleOpen = (event: Event): void => {
      const detail = (event as CustomEvent<{ tab?: 'requests' | 'edits' }>).detail
      openAdminModeration(detail?.tab || 'requests')
    }
    window.addEventListener('sila:open-admin-review', handleOpen)
    return () => window.removeEventListener('sila:open-admin-review', handleOpen)
  }, [])

  useEffect(() => {
    if (!portalTarget || !canModerate) return
    let timer = 0
    const panel = portalTarget.closest('.admin-console')?.querySelector('.admin-console-panel')
    if (!panel) return
    const observer = new MutationObserver((): void => {
      window.clearTimeout(timer)
      timer = window.setTimeout((): void => { void loadCounts() }, 280)
    })
    observer.observe(panel, { childList: true, subtree: true })
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [canModerate, loadCounts, portalTarget])

  if (!portalTarget || !canModerate) return null

  const editAndRelationshipCount = counts.edit_count + counts.relationship_change_count
  const preferredTab: 'requests' | 'edits' = counts.primary_count > 0 ? 'requests' : 'edits'

  return createPortal(
    <section className="admin-pending-overview" aria-label="إحصائيات الطلبات المعلقة">
      {counts.total_count > 0 ? (
        <div className="admin-pending-alert" role="status">
          <span className="admin-pending-alert-icon" aria-hidden="true">!</span>
          <div>
            <strong>يوجد {counts.total_count} طلبًا بانتظار المراجعة</strong>
            <small>تشمل الطلبات الأساسية والتعديلات والانتماءات ضمن صلاحياتك.</small>
          </div>
          <button type="button" onClick={() => openAdminModeration(preferredTab)}>مراجعة الآن</button>
        </div>
      ) : (
        <div className="admin-pending-clear" role="status">
          <span aria-hidden="true">✓</span>
          <div><strong>لا توجد طلبات معلقة</strong><small>كل الطلبات الواقعة ضمن صلاحياتك تمت مراجعتها.</small></div>
        </div>
      )}

      <div className="admin-pending-stats">
        <button type="button" onClick={() => openAdminModeration('requests')}>
          <span>الطلبات الأساسية</span>
          <strong>{loading ? '…' : counts.primary_count}</strong>
          <small>أشخاص، عائلات، مناسبات وربط حساب</small>
        </button>
        <button type="button" onClick={() => openAdminModeration('edits')}>
          <span>التعديلات</span>
          <strong>{loading ? '…' : editAndRelationshipCount}</strong>
          <small>{counts.relationship_change_count ? `${counts.edit_count} تعديل سجل + ${counts.relationship_change_count} صلة قرابة` : 'تعديلات السجلات المنشورة'}</small>
        </button>
        <button type="button" onClick={() => openAdminModeration('edits')}>
          <span>الانتماءات</span>
          <strong>{loading ? '…' : counts.membership_count}</strong>
          <small>طلبات الانتماء للعائلات</small>
        </button>
        <button type="button" className="total" onClick={() => openAdminModeration(preferredTab)}>
          <span>إجمالي المعلّق</span>
          <strong>{loading ? '…' : counts.total_count}</strong>
          <small>كل ما يحتاج إجراءً الآن</small>
        </button>
      </div>
    </section>,
    portalTarget,
  )
}
