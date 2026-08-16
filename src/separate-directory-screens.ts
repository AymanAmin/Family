import './separate-directory-screens.css'

type DirectoryMode = 'people' | 'families'

const SCREEN_PARAM = 'screen'
const SCREEN_VALUES: Record<DirectoryMode, string> = {
  people: 'directory-people',
  families: 'directory-families',
}

let pendingMode: DirectoryMode | null = null
let enhanceFrame = 0
let retryTimer = 0

function normalizedText(element: Element | null) {
  return element?.textContent?.replace(/\s+/g, ' ').trim() || ''
}

function modeFromUrl(): DirectoryMode | null {
  const value = new URL(window.location.href).searchParams.get(SCREEN_PARAM)
  if (value === SCREEN_VALUES.people) return 'people'
  if (value === SCREEN_VALUES.families) return 'families'
  return null
}

function writeMode(mode: DirectoryMode | null) {
  const url = new URL(window.location.href)
  const current = url.searchParams.get(SCREEN_PARAM)
  const next = mode ? SCREEN_VALUES[mode] : null
  if (current === next) return

  if (next) url.searchParams.set(SCREEN_PARAM, next)
  else if (current === SCREEN_VALUES.people || current === SCREEN_VALUES.families) url.searchParams.delete(SCREEN_PARAM)
  else return

  window.history.replaceState(window.history.state, '', url.toString())
}

function findDirectoryTab(page: HTMLElement, mode: DirectoryMode) {
  const expected = mode === 'people' ? 'الأشخاص' : 'الأسر'
  return Array.from(page.querySelectorAll<HTMLButtonElement>('.directory-tabs button'))
    .find((button) => normalizedText(button).startsWith(expected)) || null
}

function forceSeparateLayout(page: HTMLElement, mode: DirectoryMode) {
  page.dataset.separateDirectoryMode = mode
  page.classList.toggle('directory-people-screen', mode === 'people')
  page.classList.toggle('directory-families-screen', mode === 'families')

  // Keep the shared React directory implementation internally, but never expose
  // its combined tabs when the user entered the dedicated People/Family screen.
  const tabs = page.querySelector<HTMLElement>('.directory-tabs')
  if (tabs) tabs.style.setProperty('display', 'none', 'important')
}

function updateDirectoryCopy(page: HTMLElement, mode: DirectoryMode) {
  forceSeparateLayout(page, mode)

  const kicker = page.querySelector<HTMLElement>('.directory-kicker')
  const title = page.querySelector<HTMLElement>('.directory-v2-heading h1')
  const description = page.querySelector<HTMLElement>('.directory-v2-heading p')
  const input = page.querySelector<HTMLInputElement>('.directory-search-box input')

  if (mode === 'people') {
    if (kicker) kicker.textContent = 'دليل الأفراد'
    if (title) title.textContent = 'الأفراد'
    if (description) description.textContent = 'استعرض الأشخاص المعتمدين وابحث بالاسم للوصول إلى الملف الشخصي مباشرة.'
    if (input) {
      input.placeholder = 'ابحث باسم شخص…'
      input.setAttribute('aria-label', 'البحث في دليل الأفراد')
    }
  } else {
    if (kicker) kicker.textContent = 'دليل الأسر'
    if (title) title.textContent = 'الأسر'
    if (description) description.textContent = 'استعرض الأسر المعتمدة وابحث باسم الأسرة للوصول إلى سجلها مباشرة.'
    if (input) {
      input.placeholder = 'ابحث باسم أسرة…'
      input.setAttribute('aria-label', 'البحث في دليل الأسر')
    }
  }
}

function resetDirectoryCopy(page: HTMLElement) {
  if (!page.dataset.separateDirectoryMode) return
  delete page.dataset.separateDirectoryMode
  page.classList.remove('directory-people-screen', 'directory-families-screen')

  const tabs = page.querySelector<HTMLElement>('.directory-tabs')
  if (tabs) tabs.style.removeProperty('display')

  const kicker = page.querySelector<HTMLElement>('.directory-kicker')
  const title = page.querySelector<HTMLElement>('.directory-v2-heading h1')
  const description = page.querySelector<HTMLElement>('.directory-v2-heading p')
  const input = page.querySelector<HTMLInputElement>('.directory-search-box input')

  if (kicker) kicker.textContent = 'دليل صلة'
  if (title) title.textContent = 'اعثر على الشخص أو الأسرة بسرعة'
  if (description) description.textContent = 'الأسر تُنشأ تلقائيًا من الزواج المعتمد، ويُجمع تعدد الزوجات في ملف أسرة واحد باسم الزوج.'
  if (input) {
    input.placeholder = 'ابحث باسم شخص أو أسرة…'
    input.setAttribute('aria-label', 'البحث في دليل الأشخاص والأسر')
  }
}

function syncMobileActiveState(mode: DirectoryMode | null) {
  const peopleButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.mobile-bottom-nav > button'))
    .find((button) => normalizedText(button).includes('الأفراد'))
  if (!peopleButton) return

  if (mode === 'people') peopleButton.classList.add('active')
  else if (mode === 'families') peopleButton.classList.remove('active')
}

function enhanceNow() {
  enhanceFrame = 0

  if (pendingMode && modeFromUrl() !== pendingMode) writeMode(pendingMode)

  const page = document.querySelector<HTMLElement>('.directory-v2-page')
  if (!page) {
    if (pendingMode) scheduleRetry()
    return
  }

  const mode = pendingMode || modeFromUrl()
  if (!mode) {
    resetDirectoryCopy(page)
    syncMobileActiveState(null)
    return
  }

  // Re-assert the URL after React navigation so refresh/back preserves the
  // dedicated destination instead of falling back to the combined directory.
  writeMode(mode)
  updateDirectoryCopy(page, mode)

  const tab = findDirectoryTab(page, mode)
  if (tab && !tab.classList.contains('active')) {
    tab.click()
    forceSeparateLayout(page, mode)
    scheduleRetry()
    return
  }

  pendingMode = null
  syncMobileActiveState(mode)
}

function scheduleEnhance() {
  // Coalesce mutation bursts. Cancelling every animation frame can starve the
  // enhancer while React is mounting the directory after a hard navigation.
  if (enhanceFrame) return
  enhanceFrame = window.requestAnimationFrame(enhanceNow)
}

function scheduleRetry() {
  window.clearTimeout(retryTimer)
  retryTimer = window.setTimeout(scheduleEnhance, 35)
}

function requestMode(mode: DirectoryMode) {
  pendingMode = mode
  writeMode(mode)
  scheduleEnhance()
  scheduleRetry()
}

function clearSeparatedMode() {
  pendingMode = null
  writeMode(null)
  scheduleEnhance()
}

function directoryModeFromTarget(target: Element): DirectoryMode | null {
  const hubAction = target.closest<HTMLElement>('[data-hub-action]')?.dataset.hubAction
  if (hubAction === 'people') return 'people'
  if (hubAction === 'families') return 'families'

  const service = target.closest<HTMLElement>('.app-services.unified-home-stats .service-tile')
  const serviceLabel = normalizedText(service?.querySelector('strong'))
  if (serviceLabel === 'الأفراد') return 'people'
  if (serviceLabel === 'الأسر') return 'families'

  const mobileButton = target.closest<HTMLButtonElement>('.mobile-bottom-nav > button')
  if (mobileButton && normalizedText(mobileButton).includes('الأفراد')) return 'people'

  return null
}

function isExplicitGeneralSearch(target: Element) {
  const hubAction = target.closest<HTMLElement>('[data-hub-action]')?.dataset.hubAction
  if (hubAction === 'search') return true

  const desktopButton = target.closest<HTMLButtonElement>('.desktop-nav button')
  if (desktopButton && normalizedText(desktopButton) === 'البحث') return true

  return Boolean(target.closest('.home-search-bar'))
}

function isUnrelatedPrimaryNavigation(target: Element) {
  const button = target.closest<HTMLButtonElement>('.desktop-nav button, .mobile-bottom-nav button, .brand')
  if (!button) return false
  const text = normalizedText(button)
  if (text.includes('الأفراد')) return false
  if (text === 'البحث') return false
  return ['الرئيسية', 'الأخبار', 'شجرة العائلة', 'الشجرة', 'إضافة', 'الأقسام', 'الإدارة', 'حسابي', 'دخول'].some((label) => text.includes(label))
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const mode = directoryModeFromTarget(target)
    if (mode) {
      requestMode(mode)
      return
    }

    if (isExplicitGeneralSearch(target) || isUnrelatedPrimaryNavigation(target)) clearSeparatedMode()
  }, true)

  document.addEventListener('submit', (event) => {
    const form = event.target
    if (form instanceof Element && form.matches('.home-search-bar')) clearSeparatedMode()
  }, true)

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleEnhance, { once: true })
  else scheduleEnhance()

  const observer = new MutationObserver(scheduleEnhance)
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] })

  window.addEventListener('popstate', () => {
    pendingMode = null
    scheduleEnhance()
  })
  window.addEventListener('hashchange', scheduleEnhance)
  window.addEventListener('pageshow', scheduleEnhance)
  window.addEventListener('sila:history-navigation', scheduleEnhance)
}

export {}
