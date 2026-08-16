import './android-apk-install'
import './feedback-auto-dismiss'
import './home-shortcut-enhancements'

const SECTIONS_SCREEN = 'menu'

const sectionsIcon = `
<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="3.5" y="3.5" width="5" height="5" rx="1" />
  <rect x="9.5" y="3.5" width="5" height="5" rx="1" />
  <rect x="15.5" y="3.5" width="5" height="5" rx="1" />
  <rect x="3.5" y="9.5" width="5" height="5" rx="1" />
  <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
  <rect x="15.5" y="9.5" width="5" height="5" rx="1" />
  <rect x="3.5" y="15.5" width="5" height="5" rx="1" />
  <rect x="9.5" y="15.5" width="5" height="5" rx="1" />
  <rect x="15.5" y="15.5" width="5" height="5" rx="1" />
</svg>`

let enhanceFrame = 0
let refreshRetryTimer = 0

function currentScreen() {
  return new URL(window.location.href).searchParams.get('screen')
}

function navButtons() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.mobile-bottom-nav > button'))
}

function buttonLabel(button: HTMLButtonElement) {
  const candidate = button.lastElementChild
  return candidate instanceof HTMLElement ? candidate : null
}

function normalizedButtonLabel(button: HTMLButtonElement) {
  return buttonLabel(button)?.textContent?.replace(/\s+/g, ' ').trim() || ''
}

function findSectionsButton() {
  return document.querySelector<HTMLButtonElement>('.mobile-bottom-nav .mobile-sections-nav')
}

function candidateSectionsButton() {
  const buttons = navButtons()
  const existing = findSectionsButton()
  if (existing) return existing

  // The fifth mobile slot used to be الإدارة for moderators and حسابي/دخول for members.
  // Prefer matching that semantic slot explicitly, then fall back to the final nav button.
  const legacySlot = buttons.find((button) => {
    const label = normalizedButtonLabel(button)
    return label === 'الإدارة' || label === 'حسابي' || label === 'دخول' || label === 'الأقسام'
  })

  return legacySlot || buttons[buttons.length - 1] || null
}

function visibleTreePage() {
  const page = document.querySelector<HTMLElement>('.family-tree-page')
  return Boolean(page && page.getClientRects().length > 0)
}

function syncVisiblePrimaryState(sectionsButton: HTMLButtonElement) {
  if (currentScreen() === SECTIONS_SCREEN) return
  if (!visibleTreePage()) return

  const treeButton = navButtons().find((button) => normalizedButtonLabel(button) === 'الشجرة')
  if (!treeButton) return

  // FamilyTreeScreen can stay mounted for navigation caching. Base the active tab
  // on the page that is actually visible so the bottom bar always matches the screen.
  navButtons().forEach((item) => item.classList.toggle('active', item === treeButton))
  sectionsButton.classList.remove('active')
}

function syncExclusiveSectionsState(button: HTMLButtonElement) {
  const isSections = currentScreen() === SECTIONS_SCREEN
  if (isSections) {
    navButtons().forEach((item) => item.classList.toggle('active', item === button))
  } else {
    button.classList.remove('active')
    syncVisiblePrimaryState(button)
  }
}

function enhanceMobileSectionsButton() {
  const button = candidateSectionsButton()
  if (!button) return false

  button.classList.add('mobile-sections-nav')
  button.setAttribute('aria-label', 'الأقسام')
  button.setAttribute('title', 'الأقسام')

  const icon = button.querySelector<HTMLElement>('.mobile-nav-icon')
  if (icon && icon.dataset.sectionsIcon !== 'true') {
    icon.dataset.sectionsIcon = 'true'
    icon.innerHTML = sectionsIcon
  }

  const label = buttonLabel(button)
  if (label && label.textContent?.trim() !== 'الأقسام') label.textContent = 'الأقسام'

  syncExclusiveSectionsState(button)
  return true
}

function scheduleEnhance() {
  // Coalesce DOM mutations instead of cancelling/restarting the frame. During a hard refresh
  // React can render several auth/profile states quickly; repeatedly cancelling the frame could
  // leave the legacy الإدارة label visible until the mutation burst finishes.
  if (enhanceFrame) return
  enhanceFrame = window.requestAnimationFrame(() => {
    enhanceFrame = 0
    enhanceMobileSectionsButton()
  })
}

function installInitialSectionsGuard() {
  if (document.getElementById('mobile-sections-initial-guard')) return

  const style = document.createElement('style')
  style.id = 'mobile-sections-initial-guard'
  style.textContent = `
    @media (max-width: 900px) {
      .mobile-bottom-nav > button:last-child:not(.mobile-sections-nav) {
        position: relative;
      }

      .mobile-bottom-nav > button:last-child:not(.mobile-sections-nav) > span {
        visibility: hidden !important;
      }

      .mobile-bottom-nav > button:last-child:not(.mobile-sections-nav)::before {
        content: '▦';
        display: block;
        font-size: 24px;
        line-height: 1;
        color: currentColor;
      }

      .mobile-bottom-nav > button:last-child:not(.mobile-sections-nav)::after {
        content: 'الأقسام';
        display: block;
        margin-top: 4px;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.2;
        color: currentColor;
      }
    }
  `
  document.head.appendChild(style)
}

function startRefreshRetryWindow() {
  window.clearInterval(refreshRetryTimer)

  const startedAt = Date.now()
  refreshRetryTimer = window.setInterval(() => {
    enhanceMobileSectionsButton()
    if (Date.now() - startedAt >= 3500) {
      window.clearInterval(refreshRetryTimer)
      refreshRetryTimer = 0
    }
  }, 100)
}

function notifySectionsHost() {
  const signal = document.createElement('i')
  signal.hidden = true
  signal.dataset.sectionsNavigationSignal = 'true'
  document.body.appendChild(signal)
  signal.remove()
}

function clearSectionsScreen() {
  const url = new URL(window.location.href)
  if (url.searchParams.get('screen') !== SECTIONS_SCREEN) return
  url.searchParams.delete('screen')
  window.history.replaceState(window.history.state, '', url.toString())
}

function openSections() {
  const url = new URL(window.location.href)
  if (url.searchParams.get('screen') !== SECTIONS_SCREEN) {
    url.searchParams.set('screen', SECTIONS_SCREEN)
    window.history.pushState(window.history.state, '', url.toString())
  }

  enhanceMobileSectionsButton()
  notifySectionsHost()
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
  window.requestAnimationFrame(notifySectionsHost)
}

if (typeof document !== 'undefined') {
  installInitialSectionsGuard()

  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const navButton = target.closest<HTMLButtonElement>('.mobile-bottom-nav > button')
    if (!navButton) return

    // Re-enhance before deciding so a freshly rendered legacy الإدارة/حسابي button
    // is converted even if React replaced the DOM node immediately before the tap.
    enhanceMobileSectionsButton()

    if (navButton.classList.contains('mobile-sections-nav')) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      openSections()
      return
    }

    clearSectionsScreen()
    window.setTimeout(scheduleEnhance, 0)
  }, true)

  const boot = () => {
    enhanceMobileSectionsButton()
    scheduleEnhance()
    startRefreshRetryWindow()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()

  const observer = new MutationObserver(scheduleEnhance)
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] })

  window.addEventListener('popstate', scheduleEnhance)
  window.addEventListener('hashchange', scheduleEnhance)
  window.addEventListener('pageshow', () => {
    enhanceMobileSectionsButton()
    startRefreshRetryWindow()
  })
}

export {}
