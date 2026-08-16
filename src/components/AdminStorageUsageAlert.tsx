import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import '../storage-usage-alert.css'

type StorageSeverity = 'normal' | 'warning' | 'danger' | 'critical'

type StorageUsage = {
  bucket: string
  used_bytes: number
  file_count: number
  quota_bytes: number
  used_percent: number
  remaining_bytes: number
  estimated_remaining_photos_at_50kb: number
  max_photo_bytes: number
  severity: StorageSeverity
  checked_at: string
}

type CachedUsage = {
  savedAt: number
  usage: StorageUsage
}

const CACHE_KEY = 'family:person-photo-storage-usage'
const DISMISS_KEY = 'family:person-photo-storage-alert-dismissed'
const CACHE_TTL = 6 * 60 * 60 * 1000

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

function readCachedUsage(): StorageUsage | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as CachedUsage
    if (!cached?.usage || !cached.savedAt || Date.now() - cached.savedAt > CACHE_TTL) return null
    return cached.usage
  } catch {
    return null
  }
}

function writeCachedUsage(usage: StorageUsage) {
  try {
    const cached: CachedUsage = { savedAt: Date.now(), usage }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
  } catch {
    // Storage usage remains available for the current render even if localStorage is unavailable.
  }
}

function severityCopy(severity: StorageSeverity) {
  if (severity === 'critical') return { icon: '⚠', title: 'مساحة صور الأشخاص حرجة' }
  if (severity === 'danger') return { icon: '!', title: 'مساحة صور الأشخاص تقترب من الامتلاء' }
  return { icon: 'i', title: 'تنبيه مبكر لمساحة صور الأشخاص' }
}

export default function AdminStorageUsageAlert() {
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [dismissedSeverity, setDismissedSeverity] = useState(() => sessionStorage.getItem(DISMISS_KEY) || '')

  useEffect(() => {
    let cancelled = false

    async function load(force = false) {
      if (!supabase) return

      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) {
        if (!cancelled) setUsage(null)
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role,account_status')
        .eq('id', userId)
        .maybeSingle()

      const isAdmin = !profileError
        && profile?.account_status === 'active'
        && (profile?.role === 'admin' || profile?.role === 'super_admin')

      if (!isAdmin) {
        if (!cancelled) setUsage(null)
        return
      }

      if (!force) {
        const cached = readCachedUsage()
        if (cached) {
          if (!cancelled) setUsage(cached)
          return
        }
      }

      const { data, error } = await supabase.functions.invoke('admin-storage-usage', { body: {} })
      if (cancelled || error || !data || data.error) return

      const next = data as StorageUsage
      writeCachedUsage(next)
      setUsage(next)
    }

    void load()

    const authListener = supabase?.auth.onAuthStateChange(() => {
      localStorage.removeItem(CACHE_KEY)
      void load(true)
    })

    const onStorageChanged = () => {
      localStorage.removeItem(CACHE_KEY)
      void load(true)
    }

    window.addEventListener('family:person-photo-storage-changed', onStorageChanged)

    return () => {
      cancelled = true
      authListener?.data.subscription.unsubscribe()
      window.removeEventListener('family:person-photo-storage-changed', onStorageChanged)
    }
  }, [])

  if (!usage || usage.severity === 'normal' || dismissedSeverity === usage.severity) return null

  const copy = severityCopy(usage.severity)
  const percent = Math.min(100, Math.max(0, usage.used_percent))

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, usage?.severity || '')
    setDismissedSeverity(usage?.severity || '')
  }

  return (
    <aside className={`admin-storage-alert admin-storage-alert--${usage.severity}`} role="status" aria-live="polite">
      <span className="admin-storage-alert-icon" aria-hidden="true">{copy.icon}</span>
      <div className="admin-storage-alert-copy">
        <strong>{copy.title}</strong>
        <span>
          تم استخدام {percent.toFixed(1)}% ({formatBytes(usage.used_bytes)} من {formatBytes(usage.quota_bytes)}).
          {' '}المتبقي يقارب {usage.estimated_remaining_photos_at_50kb.toLocaleString('ar-SA')} صورة بحد 50KB.
        </span>
        <div className="admin-storage-alert-meter" aria-label={`استخدام مساحة الصور ${percent.toFixed(1)}%`}>
          <i style={{ inlineSize: `${percent}%` }} />
        </div>
        <small>{usage.file_count.toLocaleString('ar-SA')} صورة محفوظة · المتبقي {formatBytes(usage.remaining_bytes)}</small>
      </div>
      <button type="button" onClick={dismiss} aria-label="إخفاء تنبيه مساحة الصور">×</button>
    </aside>
  )
}
