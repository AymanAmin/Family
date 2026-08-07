import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)))
}

function deviceLabel() {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone / iPad'
  if (/Android/i.test(ua)) return 'Android'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Macintosh/i.test(ua)) return 'Mac'
  return 'جهاز ويب'
}

export default function PushNotificationSettings() {
  const [session, setSession] = useState<Session | null>(null)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [permission, setPermission] = useState<NotificationPermission>(() => typeof Notification === 'undefined' ? 'denied' : Notification.permission)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('family-push-prompt-dismissed') === '1')

  const supported = useMemo(() => (
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  ), [])

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => authSubscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supported) return
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((current) => setSubscription(current))
      .catch((): void => {})
  }, [supported])

  async function invoke(action: string, extra: Record<string, unknown> = {}) {
    if (!supabase) throw new Error('تعذر الاتصال بخدمة الإشعارات.')
    const { data, error } = await supabase.functions.invoke('push-notifications', { body: { action, ...extra } })
    if (error) throw error
    return data as Record<string, unknown>
  }

  async function enablePush() {
    if (!supported || !session || !supabase) return
    setBusy(true)
    setMessage('')
    try {
      const nextPermission = await Notification.requestPermission()
      setPermission(nextPermission)
      if (nextPermission !== 'granted') throw new Error('لم يتم السماح بالإشعارات من المتصفح.')

      const keyResponse = await invoke('public-key')
      const publicKey = String(keyResponse.publicKey || '')
      if (!publicKey) throw new Error('مفتاح الإشعارات غير مهيأ بعد في الخادم.')

      const registration = await navigator.serviceWorker.ready
      let current = await registration.pushManager.getSubscription()
      if (!current) {
        current = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
      }

      const json = current.toJSON()
      const keys = json.keys
      if (!keys?.p256dh || !keys.auth) throw new Error('تعذر قراءة مفاتيح اشتراك الجهاز.')

      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: session.user.id,
        endpoint: current.endpoint,
        p256dh: keys.p256dh,
        auth_key: keys.auth,
        user_agent: navigator.userAgent,
        device_label: deviceLabel(),
        is_active: true,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' })
      if (error) throw error

      setSubscription(current)
      localStorage.removeItem('family-push-prompt-dismissed')
      setDismissed(false)
      setMessage('تم تفعيل الإشعارات على هذا الجهاز.')
      setOpen(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر تفعيل الإشعارات.')
      setOpen(true)
    } finally {
      setBusy(false)
    }
  }

  async function disablePush() {
    if (!supabase || !session) return
    setBusy(true)
    setMessage('')
    try {
      const registration = await navigator.serviceWorker.ready
      const current = await registration.pushManager.getSubscription()
      if (current) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', current.endpoint)
        await current.unsubscribe()
      }
      setSubscription(null)
      setMessage('تم إيقاف الإشعارات على هذا الجهاز.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر إيقاف الإشعارات.')
    } finally {
      setBusy(false)
    }
  }

  async function testPush() {
    setBusy(true)
    setMessage('')
    try {
      const result = await invoke('self-test')
      const sent = Number(result.sent || 0)
      setMessage(sent > 0 ? 'تم إرسال إشعار تجريبي إلى هذا الجهاز.' : 'لم نجد اشتراكًا نشطًا لإرسال الاختبار.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر إرسال الإشعار التجريبي.')
    } finally {
      setBusy(false)
    }
  }

  function dismissPrompt() {
    localStorage.setItem('family-push-prompt-dismissed', '1')
    setDismissed(true)
  }

  if (!session || !supported) return null

  const active = permission === 'granted' && Boolean(subscription)
  const showPrompt = !active && permission === 'default' && !dismissed

  return (
    <>
      {showPrompt && (
        <aside className="push-permission-prompt" role="dialog" aria-label="تفعيل إشعارات صلة">
          <div className="push-prompt-icon">🔔</div>
          <div className="push-prompt-copy">
            <strong>لا تفوّت نتيجة طلبك</strong>
            <span>فعّل إشعارات صلة ليصلك الاعتماد أو الرفض حتى لو كان التطبيق مغلقًا.</span>
          </div>
          <div className="push-prompt-actions">
            <button type="button" className="push-enable" disabled={busy} onClick={() => void enablePush()}>{busy ? 'جارٍ التفعيل…' : 'تفعيل الإشعارات'}</button>
            <button type="button" className="push-later" onClick={dismissPrompt}>لاحقًا</button>
          </div>
        </aside>
      )}

      <button className={`push-floating-button ${active ? 'active' : ''}`} type="button" aria-label="إعدادات الإشعارات" onClick={() => setOpen((value) => !value)}>
        <span>🔔</span>
        <i aria-hidden="true" />
      </button>

      {open && (
        <aside className="push-settings-sheet" role="dialog" aria-label="إعدادات الإشعارات">
          <div className="push-sheet-head">
            <div><strong>إشعارات الجهاز</strong><span>{active ? 'مفعّلة على هذا الجهاز' : permission === 'denied' ? 'محظورة من إعدادات المتصفح' : 'غير مفعّلة'}</span></div>
            <button type="button" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className={`push-status-row ${active ? 'on' : 'off'}`}><span>{active ? '●' : '○'}</span><strong>{active ? 'الإشعارات تعمل' : 'الإشعارات متوقفة'}</strong></div>
          {message && <p className="push-message">{message}</p>}
          <div className="push-sheet-actions">
            {active ? <>
              <button type="button" className="push-test" disabled={busy} onClick={() => void testPush()}>إرسال اختبار</button>
              <button type="button" className="push-disable" disabled={busy} onClick={() => void disablePush()}>إيقاف على هذا الجهاز</button>
            </> : permission !== 'denied' ? (
              <button type="button" className="push-enable full" disabled={busy} onClick={() => void enablePush()}>تفعيل الإشعارات</button>
            ) : <p className="push-browser-note">اسمح بالإشعارات من إعدادات المتصفح أو إعدادات التطبيق ثم افتح هذه الشاشة مجددًا.</p>}
          </div>
        </aside>
      )}
    </>
  )
}
