import { supabase } from './lib/supabase'

const ORDER_STYLE_ID = 'home-shortcut-order-style'
const ANCESTOR_CACHE_MS = 5 * 60 * 1000

let ancestorCount: string | null = null
let ancestorLoadedAt = 0
let ancestorLoading: Promise<void> | null = null
let syncFrame = 0

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

function syncHomeShortcuts() {
  installShortcutOrderStyle()

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
    scheduleSync()
    void loadAncestorCount()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()

  const observer = new MutationObserver(scheduleSync)
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })

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
