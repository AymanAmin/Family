import { useEffect, useMemo, useState } from 'react'

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string }
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}
type RelatedInstalledApp = { platform?: string; id?: string; url?: string }
type NavigatorWithPwaApis = Navigator & {
  standalone?: boolean
  getInstalledRelatedApps?: () => Promise<RelatedInstalledApp[]>
}
type WindowWithInstallPrompt = Window & typeof globalThis & {
  __silaInstallPrompt?: BeforeInstallPromptEvent | null
}

const PROMPT_DELAY_MS = 500
const INSTALL_REEVALUATE_KEY = 'sila-pwa-install-reevaluate-v14'
const INSTALL_REEVALUATE_PARAM = 'pwa-install-check'

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as NavigatorWithPwaApis).standalone)
}

function homeScreenIsVisible() {
  if (document.body.classList.contains('home-navigation-hub-active')) return false

  const marker = document.querySelector<HTMLElement>(
    '.app-services.unified-home-stats, .family-welcome-card, [data-screen="home"]',
  )
  const markerVisible = Boolean(marker && marker.getClientRects().length > 0)
  const hash = window.location.hash.toLowerCase()
  const routeLooksHome = !hash || hash === '#' || hash === '#/' || hash.startsWith('#/home') || hash.startsWith('#home')

  return markerVisible || routeLooksHome
}

function openCurrentPageInChrome() {
  const current = new URL(window.location.href)
  const scheme = current.protocol.replace(':', '')
  const target = `${current.host}${current.pathname}${current.search}${current.hash}`
  const chromeStoreUrl = 'https://play.google.com/store/apps/details?id=com.android.chrome'
  const intentUrl = `intent://${target}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(chromeStoreUrl)};end`
  window.location.href = intentUrl
}

function removeInstallCheckParam() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(INSTALL_REEVALUATE_PARAM)) return
  url.searchParams.delete(INSTALL_REEVALUATE_PARAM)
  window.history.replaceState(window.history.state, '', url.toString())
}

export default function InstallPrompt() {
  const installWindow = window as WindowWithInstallPrompt
  const pwaNavigator = navigator as NavigatorWithPwaApis
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(() => installWindow.__silaInstallPrompt ?? null)
  const [visible, setVisible] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [iosHelp, setIosHelp] = useState(false)
  const [chromeFallback, setChromeFallback] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [homeActive, setHomeActive] = useState(false)

  const userAgent = useMemo(() => navigator.userAgent, [])
  const isIos = useMemo(() => {
    return /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  }, [userAgent])
  const isAndroid = useMemo(() => /Android/i.test(userAgent), [userAgent])
  const isSamsungInternet = useMemo(() => /SamsungBrowser/i.test(userAgent), [userAgent])
  const isChromeAndroid = useMemo(() => {
    return isAndroid && /Chrome\//i.test(userAgent) && !isSamsungInternet && !/EdgA\//i.test(userAgent) && !/OPR\//i.test(userAgent)
  }, [isAndroid, isSamsungInternet, userAgent])
  const supportedMobileBrowser = isAndroid || isIos

  useEffect(() => {
    if (isStandaloneMode()) {
      setInstalled(true)
      return undefined
    }

    const syncStoredPrompt = () => {
      const stored = installWindow.__silaInstallPrompt
      if (!stored) return
      setInstallEvent(stored)
      sessionStorage.removeItem(INSTALL_REEVALUATE_KEY)
      removeInstallCheckParam()
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      const promptEvent = event as BeforeInstallPromptEvent
      installWindow.__silaInstallPrompt = promptEvent
      setInstallEvent(promptEvent)
      setChromeFallback(false)
      setPanelOpen(false)
      sessionStorage.removeItem(INSTALL_REEVALUATE_KEY)
      removeInstallCheckParam()
    }

    const onInstalled = () => {
      installWindow.__silaInstallPrompt = null
      sessionStorage.removeItem(INSTALL_REEVALUATE_KEY)
      removeInstallCheckParam()
      setInstalled(true)
      setVisible(false)
      setPanelOpen(false)
      setIosHelp(false)
      setChromeFallback(false)
      setInstallEvent(null)
    }

    syncStoredPrompt()
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('sila:install-prompt-ready', syncStoredPrompt)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('sila:install-prompt-ready', syncStoredPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [installWindow])

  useEffect(() => {
    if (!isChromeAndroid || !pwaNavigator.getInstalledRelatedApps || isStandaloneMode()) return undefined

    let cancelled = false
    pwaNavigator.getInstalledRelatedApps()
      .then((apps) => {
        if (cancelled) return
        const selfInstalled = apps.some((app) => app.platform === 'webapp' && String(app.url || '').includes('manifest.webmanifest'))
        if (selfInstalled) {
          sessionStorage.removeItem(INSTALL_REEVALUATE_KEY)
          removeInstallCheckParam()
          setInstalled(true)
          setVisible(false)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [isChromeAndroid, pwaNavigator])

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
    if (installed || !homeActive || !supportedMobileBrowser) {
      setVisible(false)
      return undefined
    }

    const timer = window.setTimeout(() => setVisible(true), PROMPT_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [homeActive, installed, supportedMobileBrowser])

  function closePanel() {
    setPanelOpen(false)
    setIosHelp(false)
    setChromeFallback(false)
  }

  async function detectInstalledPwa() {
    if (!isChromeAndroid || !pwaNavigator.getInstalledRelatedApps) return false
    try {
      const apps = await pwaNavigator.getInstalledRelatedApps()
      return apps.some((app) => app.platform === 'webapp' && String(app.url || '').includes('manifest.webmanifest'))
    } catch {
      return false
    }
  }

  async function forceChromeInstallabilityRecheck() {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready
        await registration.update().catch(() => undefined)

        if (!navigator.serviceWorker.controller) {
          await new Promise<void>((resolve) => {
            let finished = false
            const finish = () => {
              if (finished) return
              finished = true
              navigator.serviceWorker.removeEventListener('controllerchange', finish)
              resolve()
            }
            navigator.serviceWorker.addEventListener('controllerchange', finish)
            window.setTimeout(finish, 1200)
          })
        }
      }
    } catch (error) {
      console.warn('PWA service worker readiness check failed.', error)
    }

    const storedPrompt = installWindow.__silaInstallPrompt
    if (storedPrompt) {
      setInstallEvent(storedPrompt)
      return false
    }

    if (sessionStorage.getItem(INSTALL_REEVALUATE_KEY) === '1') return false

    sessionStorage.setItem(INSTALL_REEVALUATE_KEY, '1')
    const url = new URL(window.location.href)
    url.searchParams.set(INSTALL_REEVALUATE_PARAM, '14')
    window.location.replace(url.toString())
    return true
  }

  async function install() {
    if (isAndroid && !isChromeAndroid) {
      setIosHelp(false)
      setChromeFallback(false)
      setPanelOpen(true)
      return
    }

    if (isChromeAndroid) {
      let promptEvent = installEvent ?? installWindow.__silaInstallPrompt ?? null

      if (!promptEvent) {
        setInstalling(true)
        const alreadyInstalled = await detectInstalledPwa()
        if (alreadyInstalled) {
          setInstalled(true)
          setVisible(false)
          setInstalling(false)
          return
        }

        const reloading = await forceChromeInstallabilityRecheck()
        if (reloading) return

        promptEvent = installWindow.__silaInstallPrompt ?? null
        setInstalling(false)

        if (!promptEvent) {
          setIosHelp(false)
          setChromeFallback(true)
          setPanelOpen(true)
          return
        }

        setInstallEvent(promptEvent)
      }

      setInstalling(true)
      try {
        await promptEvent.prompt()
        const choice = await promptEvent.userChoice
        installWindow.__silaInstallPrompt = null
        setInstallEvent(null)
        sessionStorage.removeItem(INSTALL_REEVALUATE_KEY)
        removeInstallCheckParam()
        if (choice.outcome === 'accepted') {
          setVisible(false)
          setPanelOpen(false)
        }
      } catch (error) {
        console.warn('PWA install prompt could not be opened.', error)
        installWindow.__silaInstallPrompt = null
        setInstallEvent(null)
        sessionStorage.removeItem(INSTALL_REEVALUATE_KEY)
        setChromeFallback(true)
        setPanelOpen(true)
      } finally {
        setInstalling(false)
      }
      return
    }

    if (isIos) {
      setIosHelp(true)
      setChromeFallback(false)
      setPanelOpen(true)
    }
  }

  if (installed || !homeActive || !visible || !supportedMobileBrowser) return null

  const showingChromeRedirect = isAndroid && !isChromeAndroid && !iosHelp
  const title = iosHelp
    ? 'تثبيت صلة على iPhone / iPad'
    : chromeFallback
      ? 'التثبيت من Google Chrome'
      : 'فتح صلة في Google Chrome'
  const subtitle = iosHelp
    ? 'أضف صلة إلى الشاشة الرئيسية من قائمة المشاركة.'
    : chromeFallback
      ? 'أعاد النظام فحص قابلية التثبيت، لكن Chrome لم يوفّر نافذة التثبيت البرمجية لهذا التبويب.'
      : 'التثبيت المباشر يعمل من Google Chrome. افتح نفس الصفحة في Chrome للمتابعة.'

  return (
    <>
      {!panelOpen ? (
        <button
          className="pwa-install-fab"
          type="button"
          onClick={() => void install()}
          disabled={installing}
          aria-label="تثبيت تطبيق صلة"
          style={{ insetInlineStart: 'auto', insetInlineEnd: 'auto', left: '16px', right: 'auto', zIndex: 1495 }}
        >
          <span className="pwa-install-fab-icon" aria-hidden="true">↓</span>
          <span>{installing ? 'فحص التثبيت…' : 'تثبيت التطبيق'}</span>
        </button>
      ) : null}

      {panelOpen ? (
        <aside
          className={`pwa-install-prompt ${iosHelp ? 'is-ios-help' : ''}`}
          role="dialog"
          aria-label="تثبيت تطبيق صلة"
          style={{ zIndex: 1520 }}
        >
          <button className="pwa-install-close" type="button" onClick={closePanel} aria-label="إغلاق تعليمات التثبيت">×</button>

          <div className="pwa-install-brand">
            <img src={`${import.meta.env.BASE_URL}brand/sila-approved-v4.jpg?v=14`} alt="" aria-hidden="true" />
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
          ) : showingChromeRedirect ? (
            <div className="pwa-ios-steps">
              <span><b>1</b> اضغط «فتح في Google Chrome».</span>
              <span><b>2</b> بعد فتح الصفحة في Chrome اضغط زر «تثبيت التطبيق» الظاهر فوق الجرس.</span>
            </div>
          ) : chromeFallback ? (
            <div className="pwa-ios-steps">
              <span><b>1</b> اضغط قائمة Chrome <strong aria-hidden="true">⋮</strong> أعلى الشاشة.</span>
              <span><b>2</b> اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</span>
            </div>
          ) : null}

          <div className="pwa-install-actions">
            {showingChromeRedirect ? (
              <button className="pwa-install-primary" type="button" onClick={openCurrentPageInChrome}>فتح في Google Chrome</button>
            ) : (
              <button className="pwa-install-primary" type="button" onClick={closePanel}>تم</button>
            )}
          </div>
        </aside>
      ) : null}
    </>
  )
}
