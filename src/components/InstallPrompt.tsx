import { useEffect, useMemo, useState } from 'react'

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string }
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}
type NavigatorWithStandalone = Navigator & { standalone?: boolean }

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as NavigatorWithStandalone).standalone)
}

function isHomeVisible() {
  if (document.body.classList.contains('home-navigation-hub-active')) return false

  const marker = document.querySelector<HTMLElement>(
    '.app-services.unified-home-stats, .family-welcome-card, [data-screen="home"]',
  )
  if (marker && marker.getClientRects().length > 0) return true

  const hash = window.location.hash.toLowerCase()
  return !hash || hash === '#' || hash === '#/' || hash.startsWith('#/home') || hash.startsWith('#home')
}

function openInChrome() {
  const current = new URL(window.location.href)
  const scheme = current.protocol.replace(':', '')
  const target = `${current.host}${current.pathname}${current.search}${current.hash}`
  const fallback = 'https://play.google.com/store/apps/details?id=com.android.chrome'
  window.location.href = `intent://${target}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(fallback)};end`
}

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => isStandaloneMode())
  const [homeVisible, setHomeVisible] = useState(() => isHomeVisible())
  const [panel, setPanel] = useState<'none' | 'chrome' | 'ios' | 'waiting'>('none')

  const userAgent = useMemo(() => navigator.userAgent, [])
  const isAndroid = useMemo(() => /Android/i.test(userAgent), [userAgent])
  const isIos = useMemo(() => /iPad|iPhone|iPod/i.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), [userAgent])
  const isChromeAndroid = useMemo(() => (
    isAndroid
    && /Chrome\//i.test(userAgent)
    && !/SamsungBrowser|EdgA|OPR\//i.test(userAgent)
  ), [isAndroid, userAgent])

  useEffect(() => {
    if (isStandaloneMode()) {
      setInstalled(true)
      return undefined
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
      setPanel('none')
    }

    const onInstalled = () => {
      setInstallEvent(null)
      setInstalled(true)
      setPanel('none')
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  useEffect(() => {
    const sync = () => setHomeVisible(isHomeVisible())
    sync()

    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    })

    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    window.addEventListener('pageshow', sync)
    window.addEventListener('sila:history-navigation', sync)

    return () => {
      observer.disconnect()
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
      window.removeEventListener('pageshow', sync)
      window.removeEventListener('sila:history-navigation', sync)
    }
  }, [])

  async function requestInstall() {
    if (isAndroid && !isChromeAndroid) {
      setPanel('chrome')
      return
    }

    if (isIos) {
      setPanel('ios')
      return
    }

    if (!isChromeAndroid) return

    if (!installEvent) {
      setPanel('waiting')
      return
    }

    try {
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      setInstallEvent(null)
      if (choice.outcome === 'dismissed') setPanel('none')
    } catch (error) {
      console.warn('Unable to open Chrome PWA install prompt.', error)
      setInstallEvent(null)
    }
  }

  if (installed || !homeVisible || (!isAndroid && !isIos)) return null

  return (
    <>
      <button className="pwa-install-fab" type="button" onClick={() => void requestInstall()} aria-label="تثبيت تطبيق صلة">
        <span className="pwa-install-fab-icon" aria-hidden="true">↓</span>
        <span>تثبيت التطبيق</span>
      </button>

      {panel !== 'none' ? (
        <aside className="pwa-install-panel" role="dialog" aria-label="تثبيت تطبيق صلة">
          <button className="pwa-install-close" type="button" onClick={() => setPanel('none')} aria-label="إغلاق">×</button>
          <img src={`${import.meta.env.BASE_URL}brand/sila-approved-v4.jpg`} alt="" aria-hidden="true" />
          <div className="pwa-install-panel-copy">
            {panel === 'chrome' ? (
              <>
                <strong>افتح صلة في Google Chrome</strong>
                <span>التثبيت المباشر على Android يتم من Chrome.</span>
                <button type="button" onClick={openInChrome}>فتح في Google Chrome</button>
              </>
            ) : panel === 'ios' ? (
              <>
                <strong>تثبيت صلة على iPhone / iPad</strong>
                <span>من Safari اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية».</span>
              </>
            ) : (
              <>
                <strong>Chrome يجهز خيار التثبيت</strong>
                <span>بمجرد أن يصبح التطبيق قابلًا للتثبيت سيعمل نفس الزر مباشرة.</span>
              </>
            )}
          </div>
        </aside>
      ) : null}
    </>
  )
}
