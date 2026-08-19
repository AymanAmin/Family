import { useEffect, useMemo, useState } from 'react'

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string }
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}
type NavigatorWithStandalone = Navigator & { standalone?: boolean }

const DISMISS_KEY = 'sila_pwa_install_dismissed_at'
const VISIT_COUNT_KEY = 'sila_pwa_visit_count'
const VISIT_SESSION_KEY = 'sila_pwa_visit_counted'
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
const PROMPT_DELAY_MS = 4_000
const MIN_VISITS_BEFORE_PROMPT = 2

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as NavigatorWithStandalone).standalone)
}

function recentlyDismissed() {
  const raw = window.localStorage.getItem(DISMISS_KEY)
  if (!raw) return false
  const timestamp = Number(raw)
  return Number.isFinite(timestamp) && Date.now() - timestamp < DISMISS_COOLDOWN_MS
}

function registerVisit() {
  const current = Number(window.localStorage.getItem(VISIT_COUNT_KEY) || '0')
  if (window.sessionStorage.getItem(VISIT_SESSION_KEY) === '1') return Number.isFinite(current) ? current : 0

  const next = Number.isFinite(current) ? current + 1 : 1
  window.localStorage.setItem(VISIT_COUNT_KEY, String(next))
  window.sessionStorage.setItem(VISIT_SESSION_KEY, '1')
  return next
}

function homeScreenIsVisible() {
  const stats = document.querySelector<HTMLElement>('.app-services.unified-home-stats')
  if (!stats || document.body.classList.contains('home-navigation-hub-active')) return false
  return stats.getClientRects().length > 0
}

function openCurrentPageInChrome() {
  const current = new URL(window.location.href)
  const scheme = current.protocol.replace(':', '')
  const target = `${current.host}${current.pathname}${current.search}`
  const chromeStoreUrl = 'https://play.google.com/store/apps/details?id=com.android.chrome'
  const intentUrl = `intent://${target}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(chromeStoreUrl)};end`
  window.location.href = intentUrl
}

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [iosHelp, setIosHelp] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [eligible, setEligible] = useState(false)
  const [homeActive, setHomeActive] = useState(false)

  const isIos = useMemo(() => {
    const ua = navigator.userAgent
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  }, [])

  const isSamsungInternet = useMemo(() => /SamsungBrowser/i.test(navigator.userAgent), [])

  useEffect(() => {
    if (isStandaloneMode()) {
      setInstalled(true)
      return undefined
    }

    const visitCount = registerVisit()
    setEligible(visitCount >= MIN_VISITS_BEFORE_PROMPT && !recentlyDismissed())

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()

      // Samsung Internet may package the PWA using a WebAPK path that newer
      // Play Protect versions can flag. Keep the old browser-install experience,
      // but route Samsung Internet users to Chrome instead of the APK installer.
      if (isSamsungInternet) {
        setInstallEvent(null)
        return
      }

      setInstallEvent(event as BeforeInstallPromptEvent)
    }

    const onInstalled = () => {
      setInstalled(true)
      setVisible(false)
      setEligible(false)
      setIosHelp(false)
      setInstallEvent(null)
      window.localStorage.removeItem(DISMISS_KEY)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [isSamsungInternet])

  useEffect(() => {
    const syncHome = () => setHomeActive(homeScreenIsVisible())
    syncHome()

    const observer = new MutationObserver(syncHome)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    })

    window.addEventListener('popstate', syncHome)
    window.addEventListener('hashchange', syncHome)
    window.addEventListener('pageshow', syncHome)
    window.addEventListener('sila:history-navigation', syncHome)

    return () => {
      observer.disconnect()
      window.removeEventListener('popstate', syncHome)
      window.removeEventListener('hashchange', syncHome)
      window.removeEventListener('pageshow', syncHome)
      window.removeEventListener('sila:history-navigation', syncHome)
    }
  }, [])

  useEffect(() => {
    if (installed || !eligible || !homeActive || (!installEvent && !isIos && !isSamsungInternet)) {
      setVisible(false)
      return undefined
    }

    const timer = window.setTimeout(() => setVisible(true), PROMPT_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [eligible, homeActive, installEvent, installed, isIos, isSamsungInternet])

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setEligible(false)
    setVisible(false)
    setIosHelp(false)
  }

  async function install() {
    if (isSamsungInternet) {
      openCurrentPageInChrome()
      return
    }

    if (installEvent) {
      setInstalling(true)
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      setInstalling(false)
      setInstallEvent(null)
      if (choice.outcome === 'accepted') {
        setVisible(false)
        setEligible(false)
        return
      }
      dismiss()
      return
    }

    if (isIos) setIosHelp(true)
  }

  if (installed || !homeActive || !visible || (!installEvent && !isIos && !isSamsungInternet)) return null

  const showingSamsungHelp = isSamsungInternet && !iosHelp
  const title = iosHelp
    ? 'تثبيت صلة على iPhone / iPad'
    : showingSamsungHelp
      ? 'تثبيت صلة على Samsung'
      : 'استخدم صلة كتطبيق'
  const subtitle = iosHelp
    ? 'خطوتان فقط من قائمة المشاركة.'
    : showingSamsungHelp
      ? 'افتح صلة في Google Chrome ثم استخدم تثبيت التطبيق من المتصفح.'
      : 'أضفه إلى الشاشة الرئيسية للوصول السريع والتنبيهات.'

  return (
    <aside className={`pwa-install-prompt ${iosHelp ? 'is-ios-help' : ''}`} role="dialog" aria-label="تثبيت تطبيق صلة">
      <button className="pwa-install-close" type="button" onClick={dismiss} aria-label="إغلاق اقتراح التثبيت">×</button>

      <div className="pwa-install-brand">
        <img src={`${import.meta.env.BASE_URL}icons/icon-approved-v4-192.jpg?v=7`} alt="" aria-hidden="true" />
        <div>
          <span>صلة</span>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </div>
      </div>

      {iosHelp ? (
        <div className="pwa-ios-steps">
          <span><b>1</b> اضغط زر المشاركة <strong aria-hidden="true">↑</strong> في Safari.</span>
          <span><b>2</b> اختر «إضافة إلى الشاشة الرئيسية» ثم «إضافة».</span>
        </div>
      ) : showingSamsungHelp ? (
        <div className="pwa-ios-steps">
          <span><b>1</b> اضغط «فتح في Google Chrome» أدناه.</span>
          <span><b>2</b> في Chrome اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</span>
        </div>
      ) : (
        <div className="pwa-install-benefits" aria-label="مزايا التثبيت">
          <span>◉ تطبيق مستقل</span>
          <span>⌁ وصول سريع</span>
          <span>🔔 إشعارات حتى عند الإغلاق</span>
        </div>
      )}

      <div className="pwa-install-actions">
        {!iosHelp ? (
          <button className="pwa-install-primary" type="button" onClick={() => void install()} disabled={installing}>
            {showingSamsungHelp ? 'فتح في Google Chrome' : installing ? 'جارٍ التثبيت…' : 'تثبيت'}
          </button>
        ) : (
          <button className="pwa-install-primary" type="button" onClick={() => setIosHelp(false)}>رجوع</button>
        )}
        <button className="pwa-install-later" type="button" onClick={dismiss}>ليس الآن</button>
      </div>
    </aside>
  )
}
