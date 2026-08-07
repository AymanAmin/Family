import { useEffect, useMemo, useState } from 'react'

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string }
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean }

const DISMISS_KEY = 'sila_pwa_install_dismissed_at'
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as NavigatorWithStandalone).standalone)
}

function recentlyDismissed() {
  const raw = window.localStorage.getItem(DISMISS_KEY)
  if (!raw) return false
  const timestamp = Number(raw)
  return Number.isFinite(timestamp) && Date.now() - timestamp < DISMISS_COOLDOWN_MS
}

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [iosHelp, setIosHelp] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [installing, setInstalling] = useState(false)

  const isIos = useMemo(() => {
    const ua = navigator.userAgent
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  }, [])

  useEffect(() => {
    if (isStandaloneMode()) {
      setInstalled(true)
      return undefined
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
      if (!recentlyDismissed()) window.setTimeout(() => setVisible(true), 1200)
    }

    const onInstalled = () => {
      setInstalled(true)
      setVisible(false)
      setInstallEvent(null)
      window.localStorage.removeItem(DISMISS_KEY)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)

    let iosTimer: number | undefined
    if (isIos && !recentlyDismissed()) {
      iosTimer = window.setTimeout(() => setVisible(true), 2200)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      if (iosTimer) window.clearTimeout(iosTimer)
    }
  }, [isIos])

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
    setIosHelp(false)
  }

  async function install() {
    if (installEvent) {
      setInstalling(true)
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      setInstalling(false)
      setInstallEvent(null)
      if (choice.outcome === 'accepted') {
        setVisible(false)
        return
      }
      dismiss()
      return
    }

    if (isIos) setIosHelp(true)
  }

  if (installed || !visible || (!installEvent && !isIos)) return null

  return (
    <aside className="pwa-install-prompt" role="dialog" aria-label="تثبيت تطبيق صلة المنطقة">
      <button className="pwa-install-close" type="button" onClick={dismiss} aria-label="إغلاق اقتراح التثبيت">×</button>
      <div className="pwa-install-brand">
        <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" aria-hidden="true" />
        <div>
          <span>تطبيق صلة المنطقة</span>
          <strong>ثبّت صلة على جهازك</strong>
          <small>وصول أسرع للشجرة والدليل والمناسبات من الشاشة الرئيسية.</small>
        </div>
      </div>

      <div className="pwa-install-benefits" aria-label="مزايا التثبيت">
        <span>◉ تطبيق مستقل</span>
        <span>⌁ وصول سريع</span>
        <span>◌ يعمل أفضل مع الشبكة الضعيفة</span>
      </div>

      {iosHelp ? (
        <div className="pwa-ios-steps">
          <strong>التثبيت على iPhone / iPad</strong>
          <span>1. افتح الصفحة في Safari.</span>
          <span>2. اضغط زر المشاركة ⎋.</span>
          <span>3. اختر «إضافة إلى الشاشة الرئيسية» ثم «إضافة».</span>
        </div>
      ) : null}

      <div className="pwa-install-actions">
        <button className="pwa-install-primary" type="button" onClick={() => void install()} disabled={installing}>
          {installing ? 'جارٍ التثبيت…' : installEvent ? 'تثبيت التطبيق' : 'طريقة التثبيت'}
        </button>
        <button className="pwa-install-later" type="button" onClick={dismiss}>ليس الآن</button>
      </div>
    </aside>
  )
}
