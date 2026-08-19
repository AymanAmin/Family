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
  const [installed, setInstalled] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [homeActive, setHomeActive] = useState(false)
  const [feedback, setFeedback] = useState('')

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
      if (stored) setInstallEvent(stored)
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      const promptEvent = event as BeforeInstallPromptEvent
      installWindow.__silaInstallPrompt = promptEvent
      setInstallEvent(promptEvent)
    }

    const onInstalled = () => {
      installWindow.__silaInstallPrompt = null
      setInstalled(true)
      setVisible(false)
      setPanelOpen(false)
      setIosHelp(false)
      setFeedback('')
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

  useEffect(() => {
    if (!feedback) return undefined
    const timer = window.setTimeout(() => setFeedback(''), 3200)
    return () => window.clearTimeout(timer)
  }, [feedback])

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
      const promptEvent = installEvent ?? installWindow.__silaInstallPrompt ?? null
      if (!promptEvent) {
        setFeedback('زر التثبيت جاهز، لكن Chrome لم يجهّز نافذة التثبيت بعد. حاول مرة أخرى بعد لحظات.')
        return
      }

      setInstalling(true)
      try {
        await promptEvent.prompt()
        const choice = await promptEvent.userChoice
        installWindow.__silaInstallPrompt = null
        setInstallEvent(null)
        if (choice.outcome === 'accepted') {
          setVisible(false)
          setPanelOpen(false)
          setFeedback('')
        }
      } catch (error) {
        console.warn('PWA install prompt could not be opened.', error)
        installWindow.__silaInstallPrompt = null
        setInstallEvent(null)
        setFeedback('تعذر فتح نافذة التثبيت الآن. حاول مرة أخرى بعد لحظات.')
      } finally {
        setInstalling(false)
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
          <span>تثبيت التطبيق</span>
        </button>
      ) : null}

      {feedback && !panelOpen ? (
        <div className="pwa-install-feedback" role="status" aria-live="polite">{feedback}</div>
      ) : null}

      {panelOpen ? (
        <aside className={`pwa-install-prompt ${iosHelp ? 'is-ios-help' : ''}`} role="dialog" aria-label="تثبيت تطبيق صلة">
          <button className="pwa-install-close" type="button" onClick={closePanel} aria-label="إغلاق تعليمات التثبيت">×</button>

          <div className="pwa-install-brand">
            <img src={`${import.meta.env.BASE_URL}brand/sila-approved-v4.jpg?v=13`} alt="" aria-hidden="true" />
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
