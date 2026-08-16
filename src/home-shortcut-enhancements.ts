import { supabase } from './lib/supabase'

const ORDER_STYLE_ID = 'home-shortcut-order-style'
const DESKTOP_STYLE_ID = 'desktop-sections-news-grid-style'
const ANCESTOR_CACHE_MS = 5 * 60 * 1000

let ancestorCount: string | null = null
let ancestorLoadedAt = 0
let ancestorLoading: Promise<void> | null = null
let syncFrame = 0

function normalizedText(element: Element | null) {
  return element?.textContent?.replace(/\s+/g, ' ').trim() || ''
}

function installShortcutOrderStyle() {
  if (document.getElementById(ORDER_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = ORDER_STYLE_ID
  style.textContent = `
    .app-services.unified-home-stats.home-icon-menu > .home-hub-tile[data-hub-action="ancestors"] {
      order: 1 !important;
    }

    .app-services.unified-home-stats.home-icon-menu > .home-hub-tile[data-hub-action="people"] {
      order: 2 !important;
    }

    .app-services.unified-home-stats.home-icon-menu > .home-hub-tile[data-hub-action="families"] {
      display: grid !important;
      order: 3 !important;
    }

    .app-services.unified-home-stats.home-icon-menu > .home-hub-tile[data-hub-action="news"] {
      order: 4 !important;
    }
  `
  document.head.appendChild(style)
}

function installDesktopExperienceStyle() {
  if (document.getElementById(DESKTOP_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = DESKTOP_STYLE_ID
  style.textContent = `
    @media (min-width: 901px) {
      .desktop-nav > button.desktop-sections-nav {
        position: relative;
        font-size: 0 !important;
      }

      .desktop-nav > button.desktop-sections-nav::after {
        content: 'الأقسام';
        font-size: .82rem;
        font-weight: 800;
        line-height: 1.2;
      }
    }

    @media (min-width: 761px) {
      main .section-block.soft {
        overflow: visible !important;
      }

      main .section-block.soft .cards-grid.event-grid,
      main .section-block.soft .event-grid {
        display: grid !important;
        width: 100% !important;
        max-width: 100% !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        align-items: stretch !important;
        gap: 18px !important;
        margin: 0 !important;
        padding: 4px 0 10px !important;
        overflow: visible !important;
        scroll-snap-type: none !important;
      }

      main .section-block.soft .cards-grid.event-grid > .event-card,
      main .section-block.soft .event-grid > .event-card {
        width: 100% !important;
        max-width: none !important;
        min-width: 0 !important;
        min-height: 390px !important;
        flex: none !important;
        scroll-snap-align: none !important;
      }
    }

    @media (min-width: 1100px) {
      main .section-block.soft .cards-grid.event-grid,
      main .section-block.soft .event-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        gap: 20px !important;
      }
    }
  `
  document.head.appendChild(style)
}

function ancestorShortcutIcon(stats: HTMLElement) {
  return stats
    .querySelector<HTMLButtonElement>('.home-hub-tile[data-hub-action="ancestors"]')
    ?.querySelector<HTMLElement>('.home-hub-icon') || null
}

function applyAncestorBadge(stats: HTMLElement) {
  const icon = ancestorShortcutIcon(stats)
  if (!icon || ancestorCount === null) return

  let badge = icon.querySelector<HTMLElement>('.home-hub-count')
  if (!badge) {
    badge = document.createElement('small')
    badge.className = 'home-hub-count'
    icon.appendChild(badge)
  }

  if (badge.textContent !== ancestorCount) badge.textContent = ancestorCount
}

async function loadAncestorCount(force = false) {
  if (!supabase) return
  if (!force && ancestorCount !== null && Date.now() - ancestorLoadedAt < ANCESTOR_CACHE_MS) return
  if (ancestorLoading) return ancestorLoading

  ancestorLoading = (async () => {
    const { data, error } = await supabase.rpc('get_public_top_ancestors')
    if (!error && Array.isArray(data)) {
      ancestorCount = String(data.length)
      ancestorLoadedAt = Date.now()
      scheduleSync()
    }
  })().finally(() => {
    ancestorLoading = null
  })

  return ancestorLoading
}

function openDesktopSections() {
  const url = new URL(window.location.href)
  if (url.searchParams.get('screen') !== 'menu') {
    url.searchParams.set('screen', 'menu')
    window.history.pushState(window.history.state, '', url.toString())
  }
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
}

function syncDesktopSectionsButton() {
  const nav = document.querySelector<HTMLElement>('.desktop-nav')
  if (!nav) return

  let button = nav.querySelector<HTMLButtonElement>(':scope > .desktop-sections-nav')
  if (!button) {
    const adminButton = Array.from(nav.querySelectorAll<HTMLButtonElement>(':scope > button'))
      .find((candidate) => normalizedText(candidate) === 'الإدارة')

    if (adminButton) {
      button = adminButton
      button.classList.add('desktop-sections-nav')
      button.dataset.sectionsReplacesAdmin = 'true'
    } else {
      button = document.createElement('button')
      button.type = 'button'
      button.textContent = 'الأقسام'
      button.className = 'desktop-sections-nav desktop-sections-created'
      nav.appendChild(button)
    }
  }

  button.setAttribute('aria-label', 'الأقسام')
  button.setAttribute('title', 'الأقسام')
  const menuActive = new URL(window.location.href).searchParams.get('screen') === 'menu'
  button.classList.toggle('active', menuActive)
}

function syncHomeShortcuts() {
  installShortcutOrderStyle()
  installDesktopExperienceStyle()
  syncDesktopSectionsButton()

  const stats = document.querySelector<HTMLElement>('.app-services.unified-home-stats.home-icon-menu')
  if (!stats) return

  applyAncestorBadge(stats)
  void loadAncestorCount()
}

function scheduleSync() {
  if (syncFrame) return
  syncFrame = window.requestAnimationFrame(() => {
    syncFrame = 0
    syncHomeShortcuts()
  })
}

if (typeof document !== 'undefined') {
  const boot = () => {
    installShortcutOrderStyle()
    installDesktopExperienceStyle()
    scheduleSync()
    void loadAncestorCount()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()

  const observer = new MutationObserver(scheduleSync)
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] })

  document.addEventListener('click', (event) => {
    if (!event.isTrusted) return
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest<HTMLButtonElement>('.desktop-nav > button.desktop-sections-nav')
    if (!button) return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    openDesktopSections()
    window.setTimeout(scheduleSync, 0)
  }, true)

  window.addEventListener('popstate', scheduleSync)
  window.addEventListener('hashchange', scheduleSync)
  window.addEventListener('pageshow', () => {
    scheduleSync()
    void loadAncestorCount(true)
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    scheduleSync()
    void loadAncestorCount()
  })
}

export {}
