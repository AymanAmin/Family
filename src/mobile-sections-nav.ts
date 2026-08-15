import './android-apk-install'

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

function currentScreen() {
  return new URL(window.location.href).searchParams.get('screen')
}

function navButtons() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.mobile-bottom-nav > button'))
}

function findSectionsButton() {
  return document.querySelector<HTMLButtonElement>('.mobile-bottom-nav .mobile-sections-nav')
}

function candidateSectionsButton() {
  const buttons = navButtons()
  return findSectionsButton() || buttons.at(-1) || null
}

function syncExclusiveSectionsState(button: HTMLButtonElement) {
  const isSections = currentScreen() === SECTIONS_SCREEN
  if (isSections) {
    navButtons().forEach((item) => item.classList.toggle('active', item === button))
  } else {
    button.classList.remove('active')
  }
}

function enhanceMobileSectionsButton() {
  const button = candidateSectionsButton()
  if (!button) return

  button.classList.add('mobile-sections-nav')
  button.setAttribute('aria-label', 'الأقسام')

  const icon = button.querySelector<HTMLElement>('.mobile-nav-icon')
  if (icon && icon.dataset.sectionsIcon !== 'true') {
    icon.dataset.sectionsIcon = 'true'
    icon.innerHTML = sectionsIcon
  }

  const label = button.querySelector<HTMLElement>(':scope > span:last-child')
  if (label && label.textContent !== 'الأقسام') label.textContent = 'الأقسام'

  syncExclusiveSectionsState(button)
}

function scheduleEnhance() {
  window.cancelAnimationFrame(enhanceFrame)
  enhanceFrame = window.requestAnimationFrame(enhanceMobileSectionsButton)
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
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const navButton = target.closest<HTMLButtonElement>('.mobile-bottom-nav > button')
    if (!navButton) return

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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleEnhance, { once: true })
  else scheduleEnhance()

  const observer = new MutationObserver(scheduleEnhance)
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] })

  window.addEventListener('popstate', scheduleEnhance)
  window.addEventListener('hashchange', scheduleEnhance)
}

export {}
