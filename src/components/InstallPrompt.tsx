import { useEffect, useMemo, useState } from 'react'

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string }
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}
type NavigatorWithStandalone = Navigator & { standalone?: boolean }
type WindowWithInstallPrompt = Window & typeof globalThis & {
  __silaInstallPrompt?: BeforeInstallPromptEvent | null
}

const PROMPT_DELAY_MS = 500

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as NavigatorWithStandalone).standalone)
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

export default function InstallPrompt() {
  const installWindow = window as WindowWithInstallPrompt
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(() => installWindow.__silaInstallPrompt ?? null)
  const [visible, setVisible] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [iosHelp, setIosHelp] = useState(false)
  const [manualHelp, setManualHelp] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [homeActive, setHomeActive] = useState(false)

  const isIos = useMemo(() => {
    const ua = navigator.userAgent
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  }, [])
  const isAndroid = useMemo(() => /Android/i.test(navigator.userAgent), [])
  const isSamsungInternet = useMemo(() => /SamsungBrowser/i.test(navigator.userAgent), [])
  const supportedMobileBrowser = isAndroid || isIos || isSamsungInternet

  useEffect(() => {
    if (isStandaloneMode()) {
      setInstalled(true)
      return undefined
    }

    const syncStoredPrompt = () => {
      const stored = installWindow.__silaInstallPrompt
      if (stored && !isSamsungInternet) setInstallEvent(stored)
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      const promptEvent = event as BeforeInstallPromptEvent
      installWindow.__silaInstallPrompt = promptEvent
      if (!isSamsungInternet) setInstallEvent(promptEvent)
    }

    const onInstalled = () => {
      installWindow.__silaInstallPrompt = null
      setInstalled(true)
      setVisible(false)
      setPanelOpen(false)
      setIosHelp(false)
      setManualHelp(false)
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
  }, [installWindow, isSamsungInternet])

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
    setManualHelp(false)
  }

  async function install() {
    if (isSamsungInternet) {
      openCurrentPageInChrome()
      return
    }

    if (installEvent) {
      setInstalling(true)
      try {
        await installEvent.prompt()
        const choice = await installEvent.userChoice
        installWindow.__silaInstallPrompt = null
        setInstallEvent(null)
        if (choice.outcome === 'accepted') {
          setVisible(false)
          setPanelOpen(false)
          return
        }
      } catch (error) {
        console.warn('PWA install prompt could not be opened.', error)
        installWindow.__silaInstallPrompt = null
        setInstallEvent(null)
      } finally {
        setInstalling(false)
      }
    }

    if (isIos) {
      setIosHelp(true)
      setManualHelp(false)
    } else {
      setManualHelp(true)
      setIosHelp(false)
    }
    setPanelOpen(true)
  }

  if (installed || !homeActive || !visible || !supportedMobileBrowser) return null

  const showingSamsungHelp = isSamsungInternet && !iosHelp
  const title = iosHelp
    ? 'تثبيت صلة على iPhone / iPad'
    : showingSamsungHelp
      ? 'تثبيت صلة على Samsung'
      : manualHelp
        ? 'تثبيت صلة من Google Chrome'
        : 'تثبيت تطبيق صلة'
  const subtitle = iosHelp
    ? 'أضف صلة إلى الشاشة الرئيسية من قائمة المشاركة.'
    : showingSamsungHelp
      ? 'افتح صلة في Google Chrome ثم ثبّته من المتصفح.'
      : manualHelp
        ? 'إذا لم يظهر مربع التثبيت تلقائيًا، استخدم قائمة Chrome.'
        : 'ثبّت صلة كتطبيق للوصول السريع والإشعارات.'

  return (
    <>
      {!panelOpen ? (
        <button
          className="pwa-install-fab"
          type="button"
          onClick={() => void install()}
          disabled={installing}
          aria-label="تثبيت تطبيق صلة"
        >
          <span className="pwa-install-fab-icon" aria-hidden="true">↓</span>
          <span>{installing ? 'جارٍ التثبيت…' : 'تثبيت التطبيق'}</span>
        </button>
      ) : null}

      {panelOpen ? (
        <aside className={`pwa-install-prompt ${iosHelp ? 'is-ios-help' : ''}`} role="dialog" aria-label="تثبيت تطبيق صلة">
          <button className="pwa-install-close" type="button" onClick={closePanel} aria-label="إغلاق تعليمات التثبيت">×</button>

          <div className="pwa-install-brand">
            <img src={`${import.meta.env.BASE_URL}brand/sila-approved-v4.jpg?v=12`} alt="" aria-hidden="true" />
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
            <div className="pwa-ios-steps">
              <span><b>1</b> اضغط قائمة Chrome <strong aria-hidden="true">⋮</strong> أعلى الشاشة.</span>
              <span><b>2</b> اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</span>
            </div>
          )}

          <div className="pwa-install-actions">
            {showingSamsungHelp ? (
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
