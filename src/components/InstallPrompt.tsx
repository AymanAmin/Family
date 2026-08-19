import { useEffect, useMemo, useRef, useState } from 'react'

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string }
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}
type RelatedInstalledApp = { platform?: string; id?: string; url?: string }
type NavigatorWithPwaInstall = Navigator & {
  standalone?: boolean
  install?: () => Promise<unknown>
  getInstalledRelatedApps?: () => Promise<RelatedInstalledApp[]>
}
type WindowWithInstallPrompt = Window & typeof globalThis & {
  __silaInstallPrompt?: BeforeInstallPromptEvent | null
}
type InstallStatus = 'idle' | 'opening' | 'pending' | 'confirmed' | 'failed'

const PROMPT_DELAY_MS = 500
const VERIFY_INTERVAL_MS = 2000
const VERIFY_ATTEMPTS = 24

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as NavigatorWithPwaInstall).standalone)
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

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

export default function InstallPrompt() {
  const installWindow = window as WindowWithInstallPrompt
  const pwaNavigator = navigator as NavigatorWithPwaInstall
  const verifyRunningRef = useRef(false)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(() => installWindow.__silaInstallPrompt ?? null)
  const [visible, setVisible] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [iosHelp, setIosHelp] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [homeActive, setHomeActive] = useState(false)
  const [installStatus, setInstallStatus] = useState<InstallStatus>('idle')

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

  async function isInstalledPwa() {
    if (isStandaloneMode()) return true
    if (!pwaNavigator.getInstalledRelatedApps) return false

    try {
      const apps = await pwaNavigator.getInstalledRelatedApps()
      return apps.some((app) => app.platform === 'webapp' && String(app.url || '').includes('manifest.webmanifest'))
    } catch (error) {
      console.warn('Could not query installed related apps.', error)
      return false
    }
  }

  async function verifyAndroidInstallation() {
    if (!isChromeAndroid || verifyRunningRef.current) return

    verifyRunningRef.current = true
    setInstallStatus('pending')
    setVisible(true)

    try {
      for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt += 1) {
        if (await isInstalledPwa()) {
          setInstallStatus('confirmed')
          window.setTimeout(() => {
            setInstalled(true)
            setVisible(false)
          }, 4200)
          return
        }
        await sleep(VERIFY_INTERVAL_MS)
      }

      setInstallStatus('failed')
      setVisible(true)
    } finally {
      verifyRunningRef.current = false
    }
  }

  useEffect(() => {
    if (isStandaloneMode()) {
      setInstalled(true)
      return undefined
    }

    const syncStoredPrompt = () => {
      const stored = installWindow.__silaInstallPrompt
      if (stored) {
        setInstallEvent(stored)
        if (installStatus === 'failed') setInstallStatus('idle')
      }
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      const promptEvent = event as BeforeInstallPromptEvent
      installWindow.__silaInstallPrompt = promptEvent
      setInstallEvent(promptEvent)
      if (installStatus === 'failed') setInstallStatus('idle')
    }

    const onInstalled = () => {
      installWindow.__silaInstallPrompt = null
      setInstallEvent(null)
      setPanelOpen(false)
      setIosHelp(false)
      if (isChromeAndroid) {
        void verifyAndroidInstallation()
      } else {
        setInstalled(true)
        setVisible(false)
      }
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
  }, [installWindow, installStatus, isChromeAndroid])

  useEffect(() => {
    if (!isChromeAndroid || isStandaloneMode()) return undefined

    let cancelled = false
    void isInstalledPwa().then((alreadyInstalled) => {
      if (cancelled || !alreadyInstalled) return
      setInstalled(true)
      setVisible(false)
    })

    return () => {
      cancelled = true
    }
  }, [isChromeAndroid])

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
  }

  async function install() {
    if (isAndroid && !isChromeAndroid) {
      setIosHelp(false)
      setPanelOpen(true)
      return
    }

    if (isChromeAndroid) {
      if (installStatus === 'opening' || installStatus === 'pending' || installStatus === 'confirmed') return

      if (typeof pwaNavigator.install === 'function') {
        setInstallStatus('opening')
        try {
          await pwaNavigator.install()
          await verifyAndroidInstallation()
          return
        } catch (error) {
          console.warn('Web Install API was available but could not complete installation.', error)
          setInstallStatus('idle')
        }
      }

      const promptEvent = installEvent ?? installWindow.__silaInstallPrompt ?? null
      if (!promptEvent) {
        setInstallStatus('failed')
        return
      }

      setInstallStatus('opening')
      try {
        await promptEvent.prompt()
        const choice = await promptEvent.userChoice
        installWindow.__silaInstallPrompt = null
        setInstallEvent(null)

        if (choice.outcome === 'accepted') {
          await verifyAndroidInstallation()
        } else {
          setInstallStatus('idle')
        }
      } catch (error) {
        console.warn('PWA install prompt could not be opened.', error)
        installWindow.__silaInstallPrompt = null
        setInstallEvent(null)
        setInstallStatus('failed')
      }
      return
    }

    if (isIos) {
      setIosHelp(true)
      setPanelOpen(true)
    }
  }

  if (installed || !homeActive || !visible || !supportedMobileBrowser) return null

  const showingChromeRedirect = isAndroid && !isChromeAndroid && !iosHelp
  const title = iosHelp ? 'تثبيت صلة على iPhone / iPad' : 'فتح صلة في Google Chrome'
  const subtitle = iosHelp
    ? 'أضف صلة إلى الشاشة الرئيسية من قائمة المشاركة.'
    : 'التثبيت المباشر يعمل من Google Chrome. افتح نفس الصفحة في Chrome للمتابعة.'

  const buttonLabel = installStatus === 'opening'
    ? 'جارٍ فتح التثبيت…'
    : installStatus === 'pending'
      ? 'جارٍ تثبيت صلة…'
      : installStatus === 'confirmed'
        ? 'تم تثبيت صلة ✓'
        : installStatus === 'failed'
          ? 'إعادة محاولة التثبيت'
          : 'تثبيت التطبيق'

  const statusMessage = installStatus === 'pending'
    ? 'تم قبول التثبيت من Chrome. Android ينشئ تطبيق صلة الآن؛ قد يستغرق ذلك عدة ثوانٍ.'
    : installStatus === 'confirmed'
      ? 'تم تثبيت صلة بنجاح. ستجده في قائمة التطبيقات وعلى الشاشة الرئيسية.'
      : installStatus === 'failed'
        ? 'لم يؤكد Android اكتمال التثبيت بعد. اضغط «إعادة محاولة التثبيت» للمحاولة مرة أخرى.'
        : ''

  return (
    <>
      {!panelOpen ? (
        <button
          className="pwa-install-fab"
          type="button"
          onClick={() => void install()}
          disabled={installStatus === 'opening' || installStatus === 'pending' || installStatus === 'confirmed'}
          aria-label="تثبيت تطبيق صلة"
          style={{ insetInlineStart: 'auto', insetInlineEnd: 'auto', left: '16px', right: 'auto', zIndex: 1495 }}
        >
          <span className="pwa-install-fab-icon" aria-hidden="true">↓</span>
          <span>{buttonLabel}</span>
        </button>
      ) : null}

      {statusMessage && !panelOpen ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            zIndex: 1496,
            left: '16px',
            bottom: 'calc(224px + env(safe-area-inset-bottom, 0px))',
            width: 'min(310px, calc(100vw - 32px))',
            padding: '10px 12px',
            border: '1px solid rgba(215, 188, 139, .92)',
            borderRadius: '16px',
            color: installStatus === 'confirmed' ? '#176b50' : '#6f551e',
            background: 'rgba(255, 249, 238, .98)',
            boxShadow: '0 12px 30px rgba(126, 79, 8, .18)',
            fontSize: '.62rem',
            fontWeight: 800,
            lineHeight: 1.8,
          }}
        >
          {statusMessage}
        </div>
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
            <img src={`${import.meta.env.BASE_URL}brand/sila-approved-v4.jpg?v=16`} alt="" aria-hidden="true" />
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
