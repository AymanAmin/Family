import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import '../lineage-sync-health.css'

type SyncIssue = {
  lineage_id: string
  lineage_name: string
  root_name: string
  anchor_name: string
  note: string | null
}

type SyncHealth = {
  total_lineages: number
  synced_lineages: number
  needs_review: number
  auto_sync_enabled: number
  last_synced_at: string | null
  issues: SyncIssue[] | null
}

function safeIssues(value: SyncIssue[] | null | undefined) {
  return Array.isArray(value) ? value : []
}

export default function AdminLineageSyncStatus() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [health, setHealth] = useState<SyncHealth | null>(null)
  const [loading, setLoading] = useState(false)

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
      setTarget(null)
      return
    }

    function locateTarget() {
      setTarget(document.querySelector<HTMLElement>('.lineage-structure-body'))
    }

    locateTarget()
    const observer = new MutationObserver(locateTarget)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [isAdmin])

  useEffect(() => {
    if (!supabase || !isAdmin || !target) return
    let active = true
    setLoading(true)

    void supabase.rpc('get_lineage_sync_health').then(({ data, error }) => {
      if (!active) return
      setLoading(false)
      if (error) {
        setHealth(null)
        return
      }
      setHealth((((data ?? [])[0] ?? null) as SyncHealth | null))
    })

    return () => { active = false }
  }, [isAdmin, target])

  if (!isAdmin || !target) return null

  const issues = safeIssues(health?.issues)
  const hasReview = Boolean(health && health.needs_review > 0)

  return createPortal(
    <section className={`lineage-sync-health ${hasReview ? 'warning' : 'safe'}`} aria-live="polite">
      <span className="lineage-sync-health-icon" aria-hidden="true">{hasReview ? '!' : '↻'}</span>
      <div className="lineage-sync-health-copy">
        <strong>{loading ? 'جارٍ التحقق من المزامنة…' : hasReview ? `${health?.needs_review ?? 0} أصل يحتاج مراجعة` : 'المزامنة التلقائية مفعّلة'}</strong>
        <p>{hasReview
          ? 'لم يغيّر النظام هذه الأصول تلقائيًا لأن مسار الأب الأعلى متعارض أو يتقاطع مع أصل آخر.'
          : 'عند إضافة أب أو جد أعلى واضح، يتحدث الأصل والفروع تلقائيًا بدون إعادة الاعتماد.'}</p>
        {issues.length > 0 && (
          <div className="lineage-sync-health-issues">
            {issues.slice(0, 4).map((issue) => (
              <span key={issue.lineage_id}><b>{issue.lineage_name}</b>{issue.note ? ` · ${issue.note}` : ''}</span>
            ))}
          </div>
        )}
      </div>
      {health && <small className="lineage-sync-health-count">{health.synced_lineages}/{health.total_lineages}</small>}
    </section>,
    target,
  )
}
