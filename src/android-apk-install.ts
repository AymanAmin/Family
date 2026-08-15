import './android-apk-install.css'

const APK_URL = `${import.meta.env.BASE_URL}downloads/Family.apk?v=20260816-2`
const APK_FILE_NAME = 'Family.apk'

let floatingButton: HTMLAnchorElement | null = null
let syncFrame = 0

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches
}

function isAndroidWebView() {
  const ua = navigator.userAgent
  return /;\s*wv\)/i.test(ua) || /\bwv\b/i.test(ua) || /Version\/4\.0.*Chrome/i.test(ua)
}

function isAndroidBrowser() {
  return /Android/i.test(navigator.userAgent) && !isStandaloneMode() && !isAndroidWebView()
}

function visibleHomeStats() {
  const stats = document.querySelector<HTMLElement>('.app-services.unified-home-stats')
  if (!stats || document.body.classList.contains('home-navigation-hub-active')) return false
  return stats.getClientRects().length > 0
}

function downloadIcon() {
  return `
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="8" y="3.5" width="16" height="25" rx="3.5" />
      <path d="M16 8v10" />
      <path d="m12.5 14.5 3.5 3.5 3.5-3.5" />
      <path d="M13 23.5h6" />
    </svg>`
}

function ensureHubDownloadItem() {
  const grid = document.querySelector<HTMLElement>('.home-navigation-hub-grid')
  if (!grid || grid.querySelector('[data-apk-download="true"]')) return

  const button = document.createElement('a')
  button.className = 'home-navigation-hub-item android-apk-hub-item'
  button.href = APK_URL
  button.download = APK_FILE_NAME
  button.dataset.apkDownload = 'true'
  button.setAttribute('aria-label', 'تنزيل تطبيق أندرويد')

  const icon = document.createElement('span')
  icon.className = 'home-hub-icon'
  icon.innerHTML = downloadIcon()

  const copy = document.createElement('span')
  copy.className = 'home-hub-copy'

  const label = document.createElement('strong')
  label.textContent = 'تطبيق أندرويد'

  const description = document.createElement('small')
  description.textContent = 'تنزيل التطبيق وتثبيته على الهاتف'

  copy.append(label, description)
  button.append(icon, copy)
  grid.appendChild(button)
}

function ensureFloatingDownload() {
  if (!isAndroidBrowser()) {
    floatingButton?.remove()
    floatingButton = null
    document.body.classList.remove('android-apk-browser')
    return
  }

  document.body.classList.add('android-apk-browser')

  if (!floatingButton?.isConnected) {
    const link = document.createElement('a')
    link.className = 'android-apk-floating'
    link.href = APK_URL
    link.download = APK_FILE_NAME
    link.setAttribute('aria-label', 'تنزيل وتثبيت تطبيق Family على أندرويد')
    link.innerHTML = `${downloadIcon()}<span>تثبيت التطبيق</span>`
    document.body.appendChild(link)
    floatingButton = link
  }

  floatingButton.hidden = !visibleHomeStats()
}

function syncAndroidInstallUi() {
  ensureHubDownloadItem()
  ensureFloatingDownload()
}

function scheduleSync() {
  window.cancelAnimationFrame(syncFrame)
  syncFrame = window.requestAnimationFrame(syncAndroidInstallUi)
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleSync, { once: true })
  else scheduleSync()

  const observer = new MutationObserver(scheduleSync)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden'],
  })

  window.addEventListener('popstate', scheduleSync)
  window.addEventListener('hashchange', scheduleSync)
  window.addEventListener('pageshow', scheduleSync)
  window.addEventListener('sila:history-navigation', scheduleSync)
}

export {}
