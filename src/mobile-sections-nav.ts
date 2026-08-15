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

function normalizedText(element: Element | null) {
  return element?.textContent?.replace(/\s+/g, ' ').trim() || ''
}

function currentScreen() {
  return new URL(window.location.href).searchParams.get('screen')
}

function findSectionsButton() {
  return document.querySelector<HTMLButtonElement>('.mobile-bottom-nav .mobile-sections-nav')
}

function enhanceMobileSectionsButton() {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.mobile-bottom-nav > button'))
  const button = findSectionsButton() || buttons.find((item) => normalizedText(item).includes('الإدارة')) || null
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

  button.classList.toggle('active', currentScreen() === SECTIONS_SCREEN)
}

function scheduleEnhance() {
  window.cancelAnimationFrame(enhanceFrame)
  enhanceFrame = window.requestAnimationFrame(enhanceMobileSectionsButton)
}

function notifySectionsHost() {
  // stats-swipe-fix owns the actual "كل الأقسام" screen. Triggering a tiny DOM
  // mutation makes its observer immediately re-read the screen query without a
  // page reload or a detour through the home screen.
  const signal = document.createElement('i')
  signal.hidden = true
  signal.dataset.sectionsNavigationSignal = 'true'
  document.body.appendChild(signal)
  signal.remove()
}

function openSections() {
  const url = new URL(window.location.href)
  if (url.searchParams.get('screen') !== SECTIONS_SCREEN) {
    url.searchParams.set('screen', SECTIONS_SCREEN)
    window.history.pushState(window.history.state, '', url.toString())
  }
  enhanceMobileSectionsButton()
  notifySectionsHost()
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest<HTMLButtonElement>('.mobile-bottom-nav .mobile-sections-nav')
    if (!button) return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    openSections()
  }, true)

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleEnhance, { once: true })
  else scheduleEnhance()

  const observer = new MutationObserver(scheduleEnhance)
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })

  window.addEventListener('popstate', scheduleEnhance)
}

export {}
