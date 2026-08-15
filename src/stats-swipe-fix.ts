import { supabase } from './lib/supabase'

type AdminScreen =
  | 'admin-requests'
  | 'admin-edits'
  | 'admin-activity'
  | 'admin-users'
  | 'admin-lineage-review'
  | 'admin-lineage-structure'
  | 'admin-scopes'
  | 'admin-backup'

type HubAction =
  | 'ancestors'
  | 'families'
  | 'people'
  | 'search'
  | 'news'
  | 'tree'
  | 'kinship'
  | 'add'
  | 'account'
  | AdminScreen

type AdminPermission = 'moderate' | 'active-admin' | 'primary-admin' | 'active-primary' | 'backup'

type HubItem = {
  action: HubAction
  label: string
  description: string
  icon: string
  permission?: AdminPermission
}

type HubAccess = {
  canModerate: boolean
  activeAdmin: boolean
  primaryAdmin: boolean
  activePrimary: boolean
  canBackup: boolean
}

type AdminScreenMeta = {
  title: string
  description: string
  tabLabel?: string
  selector?: string
  overlaySelector?: string
  panelClass?: string
}

const HOME_SHORTCUTS: HubItem[] = [
  { action: 'ancestors', label: 'الأجداد الأعلى', description: 'أصول النسب', icon: 'ancestors' },
  { action: 'families', label: 'الأسر', description: 'دليل الأسر', icon: 'families' },
  { action: 'people', label: 'الأفراد', description: 'دليل الأشخاص', icon: 'people' },
  { action: 'news', label: 'آخر الأخبار', description: 'الأخبار والمناسبات', icon: 'news' },
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
]

const ADMIN_HUB_ITEMS: HubItem[] = [
  { action: 'admin-requests', label: 'طلبات الاعتماد', description: 'الأشخاص والأسر والمناسبات المعلقة', icon: 'requests', permission: 'moderate' },
  { action: 'admin-edits', label: 'التعديلات والانتماءات', description: 'مراجعة تعديل السجلات وصلات القرابة', icon: 'edits', permission: 'moderate' },
  { action: 'admin-activity', label: 'النشاط والإحصائيات', description: 'نشاط المساهمين ومؤشرات المجتمع', icon: 'activity', permission: 'active-admin' },
  { action: 'admin-users', label: 'المستخدمون', description: 'إدارة الأدوار وصلاحيات الحسابات', icon: 'users-admin', permission: 'primary-admin' },
  { action: 'admin-lineage-review', label: 'مراجعة النسب', description: 'التعارضات والنواقص والتكرار المحتمل', icon: 'lineage-review', permission: 'active-admin' },
  { action: 'admin-lineage-structure', label: 'الأصول والفروع', description: 'اعتماد الأصول وهيكلة الفروع الرئيسية', icon: 'lineage-structure', permission: 'active-admin' },
  { action: 'admin-scopes', label: 'نطاقات الإشراف', description: 'تحديد الأسر والأنساب والفروع للمشرفين', icon: 'scopes', permission: 'active-primary' },
  { action: 'admin-backup', label: 'النسخ والاستعادة', description: 'تنزيل النسخة الاحتياطية واستعادتها', icon: 'backup', permission: 'backup' },
]

const ADMIN_SCREEN_META: Record<AdminScreen, AdminScreenMeta> = {
  'admin-requests': {
    title: 'طلبات الاعتماد',
    description: 'مراجعة الطلبات الأساسية التي تحتاج اعتمادًا أو رفضًا.',
    tabLabel: 'الطلبات',
  },
  'admin-edits': {
    title: 'التعديلات والانتماءات',
    description: 'مراجعة تعديلات السجلات والانتماءات وتغييرات صلات القرابة.',
    tabLabel: 'التعديلات والانتماءات',
  },
  'admin-activity': {
    title: 'النشاط والإحصائيات',
    description: 'متابعة نشاط المساهمين ومؤشرات جودة البيانات.',
    tabLabel: 'النشاط والإحصائيات',
    panelClass: 'external-activity-active',
  },
  'admin-users': {
    title: 'المستخدمون',
    description: 'إدارة المستخدمين والأدوار والصلاحيات.',
    tabLabel: 'المستخدمون',
  },
  'admin-lineage-review': {
    title: 'مراجعة النسب',
    description: 'معالجة التعارضات والنواقص في بيانات النسب.',
    selector: '.lineage-review-admin-tab',
    overlaySelector: '.lineage-review-overlay',
  },
  'admin-lineage-structure': {
    title: 'الأصول والفروع',
    description: 'اعتماد الأصول الأعلى والفروع المباشرة.',
    selector: '.lineage-structure-admin-tab',
    overlaySelector: '.lineage-structure-overlay',
  },
  'admin-scopes': {
    title: 'نطاقات الإشراف',
    description: 'تحديد نطاق الصلاحية لكل مسؤول أو مشرف.',
    selector: '.scope-admin-tab',
    overlaySelector: '.scope-admin-overlay',
  },
  'admin-backup': {
    title: 'النسخ والاستعادة',
    description: 'إدارة النسخ الاحتياطية الكاملة للمنصة.',
    selector: '.admin-backup-tab',
    panelClass: 'admin-backup-active',
  },
}

let hubScreen: HTMLElement | null = null
let hubActive = false
let attachFrame = 0
let adminNavigationRequested = false
let activatingAdminScreen = ''
let activationTimer = 0

function normalizedText(element: Element | null) {
  return element?.textContent?.replace(/\s+/g, ' ').trim() || ''
}

function isAdminScreen(value: string | null): value is AdminScreen {
  return Boolean(value && Object.prototype.hasOwnProperty.call(ADMIN_SCREEN_META, value))
}

function currentScreen() {
  return new URL(window.location.href).searchParams.get('screen')
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
    requests: `<svg ${common}><rect x="7" y="5" width="18" height="22" rx="3"/><path d="M12 11h8M12 16h8M12 21h5"/><path d="m21 20 2 2 4-5"/></svg>`,
    edits: `<svg ${common}><path d="M7 25h5l13-13-5-5L7 20v5Z"/><path d="m17 10 5 5M8 7h7M8 12h5"/></svg>`,
    activity: `<svg ${common}><path d="M6 25V14M13 25V8M20 25V17M27 25V5"/><path d="M5 25h23"/></svg>`,
    'users-admin': `<svg ${common}><circle cx="12" cy="11" r="4"/><path d="M5 25c.8-5 3-7.5 7-7.5s6.2 2.5 7 7.5"/><path d="M23 12v8M19 16h8"/></svg>`,
    'lineage-review': `<svg ${common}><circle cx="11" cy="9" r="3"/><circle cx="22" cy="22" r="3"/><path d="M11 12v5h11v2"/><path d="m7 23 2 2 4-5"/></svg>`,
    'lineage-structure': `<svg ${common}><circle cx="16" cy="6" r="3"/><path d="M16 9v6M7 15h18M7 15v6M25 15v6"/><circle cx="7" cy="24" r="3"/><circle cx="25" cy="24" r="3"/></svg>`,
    scopes: `<svg ${common}><circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="5"/><path d="M16 2v5M16 25v5M2 16h5M25 16h5"/></svg>`,
    backup: `<svg ${common}><ellipse cx="16" cy="8" rx="9" ry="4"/><path d="M7 8v8c0 2.2 4 4 9 4s9-1.8 9-4V8"/><path d="M7 16v8c0 2.2 4 4 9 4 2.2 0 4.2-.4 5.8-1.1"/><path d="m23 22 3 3 4-6"/></svg>`,
  }
  return icons[name] || icons.more
}

function originalStatIn(stats: HTMLElement, label: string) {
  return Array.from(stats.querySelectorAll<HTMLButtonElement>(':scope > .service-tile:not(.home-hub-tile)'))
    .find((button) => normalizedText(button.querySelector('strong')).includes(label)) || null
}

function findOriginalStat(label: string) {
  const stats = document.querySelector<HTMLElement>('.app-services.unified-home-stats')
  return stats ? originalStatIn(stats, label) : null
}

function readStatNumber(stats: HTMLElement, label: string) {
  const value = originalStatIn(stats, label)?.querySelector('.service-icon')?.textContent?.trim() || ''
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

function clearAdminScreenQuery(replace = true) {
  const url = new URL(window.location.href)
  if (!isAdminScreen(url.searchParams.get('screen'))) return
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

async function resolveHubAccess(): Promise<HubAccess> {
  const fallback: HubAccess = {
    canModerate: Boolean(findNavButton('الإدارة')),
    activeAdmin: false,
    primaryAdmin: false,
    activePrimary: false,
    canBackup: false,
  }

  if (!supabase) return fallback

  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) return fallback

  const { data, error } = await supabase
    .from('profiles')
    .select('role,account_status,is_primary_admin')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return fallback

  const role = String(data.role || '')
  const active = data.account_status === 'active'
  const primary = data.is_primary_admin === true
  const moderateRole = ['family_moderator', 'content_moderator', 'admin', 'super_admin'].includes(role)
  const activeAdmin = active && ['admin', 'super_admin'].includes(role)

  return {
    canModerate: Boolean(findNavButton('الإدارة')) || moderateRole,
    activeAdmin,
    primaryAdmin: primary,
    activePrimary: active && primary,
    canBackup: active && primary && role === 'super_admin',
  }
}

function permissionAllowed(permission: AdminPermission | undefined, access: HubAccess) {
  if (!permission) return true
  if (permission === 'moderate') return access.canModerate
  if (permission === 'active-admin') return access.activeAdmin
  if (permission === 'primary-admin') return access.primaryAdmin
  if (permission === 'active-primary') return access.activePrimary
  if (permission === 'backup') return access.canBackup
  return false
}

function openAdminScreen(screen: AdminScreen) {
  closeHub(false)

  const url = new URL(window.location.href)
  url.searchParams.set('screen', screen)
  window.history.pushState(window.history.state, '', url.toString())
  adminNavigationRequested = true

  const adminButton = findNavButton('الإدارة')
  if (adminButton) adminButton.click()
  window.setTimeout(attachAll, 0)
}

function runAction(action: HubAction) {
  if (isAdminScreen(action)) {
    openAdminScreen(action)
    return
  }

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

function syncShortcutCount(stats: HTMLElement, action: 'families' | 'people', label: string) {
  const shortcut = stats.querySelector<HTMLButtonElement>(`.home-hub-tile[data-hub-action="${action}"]`)
  const icon = shortcut?.querySelector<HTMLElement>('.home-hub-icon')
  if (!icon) return

  const value = readStatNumber(stats, label)
  const existing = icon.querySelector<HTMLElement>('.home-hub-count')

  if (!value) {
    existing?.remove()
    return
  }

  if (existing) {
    if (existing.textContent !== value) existing.textContent = value
    return
  }

  const badge = document.createElement('small')
  badge.className = 'home-hub-count'
  badge.textContent = value
  icon.appendChild(badge)
}

function syncShortcutCounts(stats: HTMLElement) {
  syncShortcutCount(stats, 'families', 'الأسر')
  syncShortcutCount(stats, 'people', 'الأفراد')
}

function openHub(updateHistory = true) {
  if (hubActive) return

  const main = document.querySelector<HTMLElement>('.app-shell > main')
  if (!main) return

  hubActive = true
  if (updateHistory) {
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
  HUB_ITEMS.forEach((item) => grid.appendChild(makeShortcut(item)))

  screen.append(header, grid)
  main.appendChild(screen)
  hubScreen = screen
  document.body.classList.add('home-navigation-hub-active')
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })

  void resolveHubAccess().then((access) => {
    if (!hubActive || hubScreen !== screen || !grid.isConnected) return
    const adminItems = ADMIN_HUB_ITEMS.filter((item) => permissionAllowed(item.permission, access))
    if (!adminItems.length) return

    const groupTitle = document.createElement('div')
    groupTitle.className = 'home-navigation-hub-group-title'
    groupTitle.innerHTML = '<span>الإدارة</span><strong>أدوات الإدارة المتاحة لك</strong>'
    grid.appendChild(groupTitle)
    adminItems.forEach((item) => grid.appendChild(makeShortcut(item)))
  })
}

function enhanceStats(stats: HTMLElement) {
  stats.classList.add('home-icon-menu')

  if (!stats.querySelector(':scope > .home-hub-tile')) {
    const fragment = document.createDocumentFragment()
    HOME_SHORTCUTS.forEach((item) => fragment.appendChild(makeShortcut(item, true)))
    stats.prepend(fragment)
  }

  syncShortcutCounts(stats)
}

function findAdminSectionButton(meta: AdminScreenMeta) {
  if (meta.selector) return document.querySelector<HTMLButtonElement>(meta.selector)
  if (!meta.tabLabel) return null
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.admin-console-tabs button'))
    .find((button) => normalizedText(button).includes(meta.tabLabel!)) || null
}

function adminSectionIsReady(meta: AdminScreenMeta, button: HTMLButtonElement | null) {
  if (meta.overlaySelector && document.querySelector(meta.overlaySelector)) return true
  const panel = document.querySelector<HTMLElement>('.admin-console-panel')
  if (meta.panelClass && panel?.classList.contains(meta.panelClass)) return true
  if (button?.getAttribute('aria-selected') === 'true') return true
  if (button?.classList.contains('active')) return true
  return false
}

function returnToHubFromAdmin() {
  clearAdminScreenQuery(true)
  cleanupAdminStandalone()
  const homeButton = findNavButton('الرئيسية')
  homeButton?.click()

  let attempts = 0
  const openWhenReady = () => {
    attempts += 1
    if (document.querySelector('.app-services.unified-home-stats')) {
      openHub(true)
      return
    }
    if (attempts < 30) window.setTimeout(openWhenReady, 50)
  }
  window.setTimeout(openWhenReady, 20)
}

function ensureAdminStandaloneHeader(consoleElement: HTMLElement, meta: AdminScreenMeta) {
  const panel = consoleElement.querySelector<HTMLElement>('.admin-console-panel')
  if (!panel) return

  let header = consoleElement.querySelector<HTMLElement>(':scope > .admin-standalone-header')
  if (!header) {
    header = document.createElement('header')
    header.className = 'admin-standalone-header'
    consoleElement.insertBefore(header, panel)
  }

  if (header.dataset.title === meta.title) return
  header.dataset.title = meta.title
  header.replaceChildren()

  const copy = document.createElement('div')
  const eyebrow = document.createElement('span')
  eyebrow.textContent = 'الإدارة'
  const title = document.createElement('h1')
  title.textContent = meta.title
  const description = document.createElement('p')
  description.textContent = meta.description
  copy.append(eyebrow, title, description)

  const back = document.createElement('button')
  back.type = 'button'
  back.textContent = '→ كل الأقسام'
  back.addEventListener('click', returnToHubFromAdmin)
  header.append(copy, back)
}

function cleanupAdminStandalone() {
  document.body.classList.remove('admin-standalone-active', 'admin-standalone-external')
  document.querySelector('.admin-standalone-header')?.remove()
  activatingAdminScreen = ''
  window.clearTimeout(activationTimer)
}

function activateAdminStandalone(screen: AdminScreen) {
  const meta = ADMIN_SCREEN_META[screen]
  document.body.classList.add('admin-standalone-active')
  document.body.classList.toggle('admin-standalone-external', Boolean(meta.overlaySelector))

  if (!window.location.hash.startsWith('#/admin')) {
    if (adminNavigationRequested || findNavButton('الإدارة')) {
      adminNavigationRequested = true
      findNavButton('الإدارة')?.click()
    }
    return
  }

  const consoleElement = document.querySelector<HTMLElement>('.admin-console')
  if (!consoleElement) return
  adminNavigationRequested = false
  ensureAdminStandaloneHeader(consoleElement, meta)

  const button = findAdminSectionButton(meta)
  if (!button || adminSectionIsReady(meta, button)) {
    activatingAdminScreen = ''
    return
  }

  if (activatingAdminScreen === screen) return
  activatingAdminScreen = screen
  button.click()
  window.clearTimeout(activationTimer)
  activationTimer = window.setTimeout(() => {
    if (activatingAdminScreen === screen) activatingAdminScreen = ''
    attachAll()
  }, 420)
}

function syncAdminStandaloneFromUrl() {
  const screen = currentScreen()
  if (!isAdminScreen(screen)) {
    cleanupAdminStandalone()
    return
  }
  activateAdminStandalone(screen)
}

function attachAllNow() {
  document.querySelectorAll<HTMLElement>('.app-services.unified-home-stats').forEach(enhanceStats)

  const screen = currentScreen()
  const menuRequested = screen === 'menu'
  if (menuRequested && !hubActive) openHub(false)
  if (!menuRequested && hubActive) closeHub(false)

  syncAdminStandaloneFromUrl()
}

function attachAll() {
  window.cancelAnimationFrame(attachFrame)
  attachFrame = window.requestAnimationFrame(attachAllNow)
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attachAll, { once: true })
  else attachAll()

  const observer = new MutationObserver(attachAll)
  observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true })

  window.addEventListener('popstate', () => {
    const screen = currentScreen()
    if (isAdminScreen(screen) && !window.location.hash.startsWith('#/admin')) {
      const url = new URL(window.location.href)
      url.searchParams.set('screen', 'menu')
      window.history.replaceState(window.history.state, '', url.toString())
      cleanupAdminStandalone()
    }
    attachAll()
  })

  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const activeScreen = currentScreen()
    const overlayClose = target.closest('.lineage-review-close, .lineage-structure-close, .scope-admin-header > button')
    if (overlayClose && isAdminScreen(activeScreen)) {
      window.setTimeout(returnToHubFromAdmin, 0)
      return
    }

    const navigationTarget = target.closest('.desktop-nav button, .mobile-bottom-nav button, .brand')
    if (navigationTarget) {
      const text = normalizedText(navigationTarget)
      if (isAdminScreen(activeScreen)) {
        if (!text.includes('الإدارة')) {
          clearAdminScreenQuery(true)
          cleanupAdminStandalone()
        }
      } else if (text.includes('الإدارة') && activeScreen !== 'menu') {
        const url = new URL(window.location.href)
        url.searchParams.set('screen', 'admin-requests')
        window.history.replaceState(window.history.state, '', url.toString())
        adminNavigationRequested = true
      }
    }

    if (!hubActive) return
    if (target.closest('.home-navigation-hub-screen')) return
    if (navigationTarget) closeHub(true)
  }, true)
}

export {}
