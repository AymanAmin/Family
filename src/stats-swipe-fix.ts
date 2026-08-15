type HubAction = 'ancestors' | 'families' | 'people' | 'search' | 'news' | 'tree' | 'kinship' | 'add' | 'account' | 'admin'

type HubItem = {
  action: HubAction
  label: string
  description: string
  icon: string
  optional?: boolean
}

const HOME_SHORTCUTS: HubItem[] = [
  { action: 'ancestors', label: 'الأجداد الأعلى', description: 'أصول النسب', icon: 'ancestors' },
  { action: 'families', label: 'الأسر', description: 'دليل الأسر', icon: 'families' },
  { action: 'people', label: 'الأفراد', description: 'دليل الأشخاص', icon: 'people' },
  { action: 'search', label: 'المزيد', description: 'كل الأقسام', icon: 'more' },
]

const HUB_ITEMS: HubItem[] = [
  { action: 'ancestors', label: 'الأجداد الأعلى', description: 'الأصول المعتمدة وفروعها', icon: 'ancestors' },
  { action: 'search', label: 'البحث في الدليل', description: 'ابحث في جميع السجلات', icon: 'search' },
  { action: 'families', label: 'الأسر', description: 'استعراض الأسر', icon: 'families' },
  { action: 'people', label: 'الأفراد', description: 'استعراض الأشخاص', icon: 'people' },
  { action: 'news', label: 'الأخبار والمناسبات', description: 'آخر أخبار العائلة', icon: 'news' },
  { action: 'tree', label: 'شجرة العائلة', description: 'استكشف الفروع والأجيال', icon: 'tree' },
  { action: 'kinship', label: 'صلة القرابة', description: 'اعرف صلة شخص بآخر', icon: 'kinship' },
  { action: 'add', label: 'إضافة', description: 'أضف شخصًا أو أسرة أو مناسبة', icon: 'add' },
  { action: 'account', label: 'حسابي', description: 'الملف والربط الشخصي', icon: 'account' },
  { action: 'admin', label: 'الإدارة', description: 'طلبات الاعتماد والإعدادات', icon: 'admin', optional: true },
]

const enhancedStats = new WeakSet<HTMLElement>()
let hubScreen: HTMLElement | null = null
let hubActive = false
let refreshGuardObserver: MutationObserver | null = null
let refreshGuardTimer = 0

function normalizedText(element: Element | null) {
  return element?.textContent?.replace(/\s+/g, ' ').trim() || ''
}

function svgIcon(name: string) {
  const common = 'viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'
  const icons: Record<string, string> = {
    ancestors: `<svg ${common}><circle cx="16" cy="7" r="3.2"/><path d="M16 10.2v5.2M9 15.4h14M9 15.4v4.2M23 15.4v4.2"/><circle cx="9" cy="23" r="3.2"/><circle cx="23" cy="23" r="3.2"/></svg>`,
    families: `<svg ${common}><circle cx="11" cy="12" r="3.4"/><circle cx="21" cy="12" r="3.4"/><path d="M5.5 24c.7-4 2.7-6 5.5-6s4.8 2 5.5 6M15.5 24c.5-3.4 2.3-5.2 5.5-5.2 3 0 4.8 1.8 5.5 5.2"/></svg>`,
    people: `<svg ${common}><circle cx="16" cy="10" r="4"/><path d="M8.5 25c.8-5 3.2-7.5 7.5-7.5s6.7 2.5 7.5 7.5"/></svg>`,
    more: `<svg ${common}><rect x="5" y="5" width="6" height="6" rx="1.3"/><rect x="13" y="5" width="6" height="6" rx="1.3"/><rect x="21" y="5" width="6" height="6" rx="1.3"/><rect x="5" y="13" width="6" height="6" rx="1.3"/><rect x="13" y="13" width="6" height="6" rx="1.3"/><rect x="21" y="13" width="6" height="6" rx="1.3"/><rect x="5" y="21" width="6" height="6" rx="1.3"/><rect x="13" y="21" width="6" height="6" rx="1.3"/><rect x="21" y="21" width="6" height="6" rx="1.3"/></svg>`,
    search: `<svg ${common}><circle cx="14" cy="14" r="7"/><path d="m19.5 19.5 6 6"/></svg>`,
    news: `<svg ${common}><path d="M7 6h18v20H7z"/><path d="M11 11h10M11 16h10M11 21h6"/></svg>`,
    tree: `<svg ${common}><circle cx="16" cy="7" r="3"/><circle cx="8" cy="24" r="3"/><circle cx="24" cy="24" r="3"/><path d="M16 10v6M8 21v-5h16v5"/></svg>`,
    kinship: `<svg ${common}><circle cx="8" cy="9" r="3"/><circle cx="24" cy="9" r="3"/><circle cx="16" cy="23" r="3"/><path d="m10.5 11.5 4 8M21.5 11.5l-4 8M11 9h10"/></svg>`,
    add: `<svg ${common}><circle cx="16" cy="16" r="11"/><path d="M16 10v12M10 16h12"/></svg>`,
    account: `<svg ${common}><circle cx="16" cy="10" r="4"/><path d="M8 25c1-5 3.5-7.5 8-7.5s7 2.5 8 7.5"/></svg>`,
    admin: `<svg ${common}><path d="M7 7h7v7H7zM18 7h7v7h-7zM7 18h7v7H7zM18 18h7v7H18z"/></svg>`,
  }
  return icons[name] || icons.more
}

function findOriginalStat(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.unified-home-stats > .service-tile:not(.home-hub-tile)'))
    .find((button) => normalizedText(button.querySelector('strong')).includes(label)) || null
}

function readStatNumber(label: string) {
  const tile = findOriginalStat(label)
  const value = tile?.querySelector('.service-icon')?.textContent?.trim() || ''
  return /^\d+$/.test(value) ? value : ''
}

function findNavButton(...labels: string[]) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.desktop-nav button, .mobile-bottom-nav button'))
  return buttons.find((button) => {
    const text = normalizedText(button)
    return labels.some((label) => text === label || text.includes(label))
  }) || null
}

function clearHubQuery(replace = true) {
  const url = new URL(window.location.href)
  if (url.searchParams.get('screen') !== 'menu') return
  url.searchParams.delete('screen')
  if (replace) window.history.replaceState(window.history.state, '', url.toString())
}

function closeHub(replaceHistory = true) {
  hubActive = false
  document.body.classList.remove('home-navigation-hub-active')
  if (hubScreen?.isConnected) hubScreen.remove()
  hubScreen = null
  if (replaceHistory) clearHubQuery(true)
}

function clickWhenReady(getButton: () => HTMLButtonElement | null, attempts = 0) {
  const button = getButton()
  if (button) {
    button.click()
    return
  }
  if (attempts < 30) window.setTimeout(() => clickWhenReady(getButton, attempts + 1), 50)
}

function runAction(action: HubAction) {
  if (action === 'search' && hubActive) {
    closeHub(true)
    window.requestAnimationFrame(() => findNavButton('البحث')?.click())
    return
  }

  closeHub(true)
  window.requestAnimationFrame(() => {
    if (action === 'ancestors') {
      const button = document.querySelector<HTMLButtonElement>('.top-ancestors-home-tile, .top-ancestors-nav-button')
      if (button) button.click()
      else {
        const url = new URL(window.location.href)
        url.searchParams.set('screen', 'ancestors')
        window.history.pushState(window.history.state, '', url.toString())
        window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
      }
      return
    }
    if (action === 'families') return findOriginalStat('الأسر')?.click()
    if (action === 'people') return findOriginalStat('الأفراد')?.click()
    if (action === 'news') return (findOriginalStat('المناسبات') || findNavButton('الأخبار'))?.click()
    if (action === 'tree') return (findOriginalStat('شجرة العائلة') || findNavButton('شجرة العائلة', 'الشجرة'))?.click()
    if (action === 'kinship') return clickWhenReady(() => document.querySelector<HTMLButtonElement>('.home-kinship-shortcut-button'))
    if (action === 'add') return findNavButton('إضافة')?.click()
    if (action === 'account') {
      const accountTile = findOriginalStat('حسابي') || findOriginalStat('الدخول')
      return (accountTile || findNavButton('حسابي', 'دخول'))?.click()
    }
    if (action === 'admin') return findNavButton('الإدارة')?.click()
    return findNavButton('البحث')?.click()
  })
}

function makeShortcut(item: HubItem, isHome = false) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = isHome ? 'home-hub-tile' : 'home-navigation-hub-item'
  button.dataset.hubAction = item.action

  const icon = document.createElement('span')
  icon.className = 'home-hub-icon'
  icon.innerHTML = svgIcon(item.icon)

  if (isHome) {
    const countLabel = item.action === 'families' ? 'الأسر' : item.action === 'people' ? 'الأفراد' : ''
    const count = countLabel ? readStatNumber(countLabel) : ''
    if (count) {
      const badge = document.createElement('small')
      badge.className = 'home-hub-count'
      badge.textContent = count
      icon.appendChild(badge)
    }
  }

  const copy = document.createElement('span')
  copy.className = 'home-hub-copy'
  const label = document.createElement('strong')
  label.textContent = item.label
  copy.appendChild(label)

  if (!isHome) {
    const description = document.createElement('small')
    description.textContent = item.description
    copy.appendChild(description)
  }

  button.append(icon, copy)
  button.addEventListener('click', () => {
    if (isHome && item.label === 'المزيد') openHub(true)
    else runAction(item.action)
  })
  return button
}

function hasAdminNavigation() {
  return Boolean(findNavButton('الإدارة'))
}

function openHub(pushHistory = true) {
  if (hubActive) return

  const main = document.querySelector<HTMLElement>('.app-shell > main')
  if (!main) return

  hubActive = true
  if (pushHistory) {
    const url = new URL(window.location.href)
    url.searchParams.set('screen', 'menu')
    window.history.pushState(window.history.state, '', url.toString())
  }

  const screen = document.createElement('section')
  screen.className = 'home-navigation-hub-screen'
  screen.setAttribute('aria-label', 'كل أقسام المنصة')

  const header = document.createElement('header')
  header.className = 'home-navigation-hub-header'

  const back = document.createElement('button')
  back.type = 'button'
  back.className = 'home-navigation-hub-back'
  back.textContent = '→ العودة'
  back.addEventListener('click', () => {
    if (window.history.length > 1) window.history.back()
    else closeHub(true)
  })

  const heading = document.createElement('div')
  heading.innerHTML = '<span>التنقل السريع</span><h1>كل الأقسام</h1><p>اختر القسم الذي تريد الانتقال إليه مباشرة.</p>'
  header.append(back, heading)

  const grid = document.createElement('div')
  grid.className = 'home-navigation-hub-grid'
  HUB_ITEMS.filter((item) => !item.optional || hasAdminNavigation()).forEach((item) => grid.appendChild(makeShortcut(item)))

  screen.append(header, grid)
  main.appendChild(screen)
  hubScreen = screen
  document.body.classList.add('home-navigation-hub-active')
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
}

function enhanceStats(stats: HTMLElement) {
  if (enhancedStats.has(stats)) return
  enhancedStats.add(stats)
  stats.classList.add('home-icon-menu')

  const fragment = document.createDocumentFragment()
  HOME_SHORTCUTS.forEach((item) => fragment.appendChild(makeShortcut(item, true)))
  stats.prepend(fragment)
}

function requestedHashRoute() {
  const raw = window.location.hash
  if (!raw.startsWith('#/')) return ''
  return decodeURIComponent(raw.replace(/^#\/?/, '')).split('/')[0] || ''
}

function refreshNeedsGuard() {
  const screen = new URL(window.location.href).searchParams.get('screen')
  if (screen === 'menu' || screen === 'ancestors') return true
  const route = requestedHashRoute()
  return Boolean(route && route !== 'home')
}

function activeNavContains(...labels: string[]) {
  const active = Array.from(document.querySelectorAll<HTMLElement>('.desktop-nav .active, .mobile-bottom-nav .active'))
  return active.some((item) => {
    const text = normalizedText(item)
    return labels.some((label) => text === label || text.includes(label))
  })
}

function requestedRouteIsReady() {
  const screen = new URL(window.location.href).searchParams.get('screen')
  if (screen === 'menu') return Boolean(document.querySelector('.home-navigation-hub-screen'))
  if (screen === 'ancestors') return Boolean(document.querySelector('.top-ancestors-screen'))

  const route = requestedHashRoute()
  if (!route || route === 'home') return Boolean(document.querySelector('.home-search-hero'))
  if (route === 'person' || route === 'family') return Boolean(document.querySelector('.detail-page'))
  if (route === 'news') return activeNavContains('الأخبار')
  if (route === 'search') return activeNavContains('البحث', 'الأفراد')
  if (route === 'tree') return activeNavContains('شجرة العائلة', 'الشجرة')
  if (route === 'add') return activeNavContains('إضافة')
  if (route === 'admin') return activeNavContains('الإدارة')
  if (route === 'account') return Boolean(document.querySelector('.account-page'))
  return true
}

function finishRefreshGuard() {
  document.documentElement.classList.remove('family-route-refreshing')
  refreshGuardObserver?.disconnect()
  refreshGuardObserver = null
  if (refreshGuardTimer) window.clearTimeout(refreshGuardTimer)
  refreshGuardTimer = 0
}

function checkRefreshGuard() {
  if (!document.documentElement.classList.contains('family-route-refreshing')) return
  if (requestedRouteIsReady()) finishRefreshGuard()
}

function installRefreshGuard() {
  if (!refreshNeedsGuard()) return

  document.documentElement.classList.add('family-route-refreshing')

  const style = document.createElement('style')
  style.dataset.familyRouteRefreshGuard = 'true'
  style.textContent = `
    html.family-route-refreshing body { overflow: hidden !important; }
    html.family-route-refreshing #root { visibility: hidden !important; }
    html.family-route-refreshing body::before {
      content: 'جارٍ تحديث الصفحة…';
      position: fixed;
      z-index: 2147483647;
      inset: 0;
      display: grid;
      place-items: center;
      padding-top: 54px;
      background: #f7faf8;
      color: #456577;
      font-family: inherit;
      font-size: .88rem;
      font-weight: 700;
    }
    html.family-route-refreshing body::after {
      content: '';
      position: fixed;
      z-index: 2147483647;
      top: calc(50% - 25px);
      left: calc(50% - 16px);
      width: 30px;
      height: 30px;
      border: 3px solid rgba(49, 132, 119, .18);
      border-top-color: #318477;
      border-radius: 50%;
      animation: family-route-refresh-spin .7s linear infinite;
    }
    @keyframes family-route-refresh-spin { to { transform: rotate(360deg); } }
  `
  document.head.appendChild(style)

  refreshGuardObserver = new MutationObserver(checkRefreshGuard)
  refreshGuardObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })

  // Never leave the application hidden if a protected/deleted route cannot be restored.
  refreshGuardTimer = window.setTimeout(finishRefreshGuard, 9000)
}

function attachAll() {
  document.querySelectorAll<HTMLElement>('.app-services.unified-home-stats').forEach(enhanceStats)
  syncHubFromUrl()
  checkRefreshGuard()
}

function syncHubFromUrl() {
  const active = new URL(window.location.href).searchParams.get('screen') === 'menu'
  if (active && !hubActive) {
    openHub(false)
    return
  }
  if (!active && hubActive) closeHub(false)
}

if (typeof document !== 'undefined') {
  // Run before React mounts so a browser refresh never paints the home screen
  // while the application is restoring a different URL route.
  installRefreshGuard()

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attachAll, { once: true })
  else attachAll()

  const observer = new MutationObserver(attachAll)
  observer.observe(document.documentElement, { childList: true, subtree: true })

  window.addEventListener('popstate', () => {
    syncHubFromUrl()
    checkRefreshGuard()
  })

  document.addEventListener('click', (event) => {
    if (!hubActive) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('.home-navigation-hub-screen')) return
    if (target.closest('.desktop-nav button, .mobile-bottom-nav button, .brand')) closeHub(true)
  }, true)
}

export {}
