import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import AdminContributorStats from './AdminContributorStats'
import '../admin-activity-access.css'

type AdminProfile = {
  role: string | null
  account_status: string | null
  is_primary_admin: boolean | null
}

export default function AdminActivityAccess() {
  const [allowed, setAllowed] = useState(false)
  const [primaryAdmin, setPrimaryAdmin] = useState(false)
  const [active, setActive] = useState(false)
  const [tabsTarget, setTabsTarget] = useState<HTMLElement | null>(null)
  const [panelTarget, setPanelTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!supabase) return
    let mounted = true

    async function resolveAccess() {
      const { data: sessionData } = await supabase!.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) {
        if (mounted) {
          setAllowed(false)
          setPrimaryAdmin(false)
          setActive(false)
        }
        return
      }

      const { data } = await supabase!
        .from('profiles')
        .select('role,account_status,is_primary_admin')
        .eq('id', userId)
        .maybeSingle()

      if (!mounted) return
      const profile = data as AdminProfile | null
      const isAdministrator = profile?.account_status === 'active' && ['admin', 'super_admin'].includes(profile?.role ?? '')
      setAllowed(Boolean(isAdministrator))
      setPrimaryAdmin(Boolean(profile?.is_primary_admin))
      if (!isAdministrator || profile?.is_primary_admin) setActive(false)
    }

    void resolveAccess()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { void resolveAccess() })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!allowed || primaryAdmin) {
      setTabsTarget(null)
      setPanelTarget(null)
      setActive(false)
      return
    }

    function locateTargets() {
      const tabs = document.querySelector<HTMLElement>('.admin-console-tabs')
      const panel = document.querySelector<HTMLElement>('.admin-console-panel')
      setTabsTarget(tabs)
      setPanelTarget(panel)
      if (!tabs || !panel) setActive(false)
    }

    locateTargets()
    const observer = new MutationObserver(locateTargets)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [allowed, primaryAdmin])

  useEffect(() => {
    const tabs = tabsTarget
    if (!tabs) return

    function handleTabClick(event: Event) {
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest('button')
      if (button && !button.classList.contains('admin-activity-all-tab')) setActive(false)
    }

    tabs.addEventListener('click', handleTabClick)
    return () => tabs.removeEventListener('click', handleTabClick)
  }, [tabsTarget])

  useEffect(() => {
    const panel = panelTarget
    if (!panel) return
    panel.classList.toggle('external-activity-active', active)
    return () => panel.classList.remove('external-activity-active')
  }, [panelTarget, active])

  if (!allowed || primaryAdmin || !tabsTarget || !panelTarget) return null

  return (
    <>
      {createPortal(
        <button
          type="button"
          role="tab"
          aria-selected={active}
          className={`admin-activity-all-tab ${active ? 'active' : ''}`}
          onClick={() => setActive(true)}
        >
          النشاط والإحصائيات
        </button>,
        tabsTarget,
      )}

      {active && createPortal(
        <div className="admin-activity-external-host admin-activity-readonly">
          <AdminContributorStats active />
        </div>,
        panelTarget,
      )}
    </>
  )
}
