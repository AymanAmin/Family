import './android-apk-install.css'

const APK_URL = `${import.meta.env.BASE_URL}downloads/Family-1.0.1-release.apk?v=20260816-3`
const APK_FILE_NAME = 'Family.apk'

let syncFrame = 0

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent)
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

function removeApkItems() {
  document.querySelectorAll<HTMLElement>('[data-apk-download="true"]').forEach((item) => item.remove())
}

function ensureHubDownloadItem() {
  // The APK is an optional Android-only download and must live only inside
  // the أقسام screen. The normal browser/PWA install prompt remains separate.
  if (!isAndroidDevice()) {
    removeApkItems()
    return
  }

  const grid = document.querySelector<HTMLElement>('.home-navigation-hub-grid')
  if (!grid) {
    removeApkItems()
    return
  }

  if (grid.querySelector('[data-apk-download="true"]')) return

  const button = document.createElement('a')
  button.className = 'home-navigation-hub-item android-apk-hub-item'
  button.href = APK_URL
  button.download = APK_FILE_NAME
  button.dataset.apkDownload = 'true'
  button.setAttribute('aria-label', 'تنزيل تطبيق أندرويد APK')

  const icon = document.createElement('span')
  icon.className = 'home-hub-icon'
  icon.innerHTML = downloadIcon()

  const copy = document.createElement('span')
  copy.className = 'home-hub-copy'

  const label = document.createElement('strong')
  label.textContent = 'تطبيق أندرويد APK'

  const description = document.createElement('small')
  description.textContent = 'تنزيل نسخة أندرويد وتثبيتها يدويًا'

  copy.append(label, description)
  button.append(icon, copy)
  grid.appendChild(button)
}

function syncAndroidInstallUi() {
  // Intentionally no floating APK button on the home screen. Home uses the
  // browser's original PWA install experience through InstallPrompt.
  ensureHubDownloadItem()
}

function scheduleSync() {
  if (syncFrame) return
  syncFrame = window.requestAnimationFrame(() => {
    syncFrame = 0
    syncAndroidInstallUi()
  })
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
