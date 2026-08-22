import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type VisitorStats = {
  unique_visitors: number
  total_views: number
  visitors_24h: number
}

const VISITOR_KEY_STORAGE = 'sila_visitor_key'

function createVisitorKey(): string {
  return window.crypto.randomUUID()
}

function getVisitorKey(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY_STORAGE)
    if (existing) return existing
    const created = createVisitorKey()
    window.localStorage.setItem(VISITOR_KEY_STORAGE, created)
    return created
  } catch {
    return createVisitorKey()
  }
}

export default function AdminVisitorStat() {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [stats, setStats] = useState<VisitorStats | null>(null)

  const refreshAdminStats = useCallback(async (activeSession: Session | null) => {
    if (!supabase || !activeSession?.user) {
      setStats(null)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role,account_status')
      .eq('id', activeSession.user.id)
      .maybeSingle()

    if (!profile || profile.account_status !== 'active' || !['admin', 'super_admin'].includes(profile.role)) {
      setStats(null)
      return
    }

    const { data, error } = await supabase.rpc('get_admin_visitor_stats', { p_period_days: null })
    if (error) {
      setStats(null)
      return
    }

    const row = Array.isArray(data) ? data[0] : null
    setStats((row as VisitorStats | undefined) ?? null)
  }, [])

  useEffect(() => {
    const syncTarget = () => {
      const next = document.querySelector<HTMLElement>('.unified-home-stats')
      setTarget((current) => current === next ? current : next)
    }

    syncTarget()
    const observer = new MutationObserver(syncTarget)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!supabase) return

    let mounted = true
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      const visitorKey = getVisitorKey()
      await supabase.rpc('record_site_visit', { p_visitor_key: visitorKey })
      if (mounted) await refreshAdminStats(data.session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) void refreshAdminStats(nextSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [refreshAdminStats])

  if (!target || !stats) return null

  return createPortal(
    <div className="service-tile stat-service-tile admin-visitor-stat" role="status" aria-label={`عدد الزوار ${stats.unique_visitors}`}>
      <span className="service-icon">{stats.unique_visitors.toLocaleString('ar-SA')}</span>
      <span>
        <strong>الزوار</strong>
        <small>{stats.total_views.toLocaleString('ar-SA')} مشاهدة · {stats.visitors_24h.toLocaleString('ar-SA')} خلال ٢٤ ساعة</small>
      </span>
    </div>,
    target,
  )
}
