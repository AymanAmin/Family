import './separate-directory-screens.css'

type DirectoryMode = 'people' | 'families'

const SCREEN_PARAM = 'screen'
const SCREEN_VALUES: Record<DirectoryMode, string> = {
  people: 'directory-people',
  families: 'directory-families',
}

let pendingMode: DirectoryMode | null = null
let enhanceFrame = 0

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

function updateDirectoryCopy(page: HTMLElement, mode: DirectoryMode) {
  if (page.dataset.separateDirectoryMode === mode) return
  page.dataset.separateDirectoryMode = mode
  page.classList.toggle('directory-people-screen', mode === 'people')
  page.classList.toggle('directory-families-screen', mode === 'families')

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

function syncMobileActiveState(mode: DirectoryMode | null, page: HTMLElement | null) {
  if (!page) return
  const peopleButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.mobile-bottom-nav > button'))
    .find((button) => normalizedText(button).includes('الأفراد'))
  if (!peopleButton) return

  if (mode === 'people') peopleButton.classList.add('active')
  else if (mode === 'families') peopleButton.classList.remove('active')
}

function enhanceNow() {
  const page = document.querySelector<HTMLElement>('.directory-v2-page')
  if (!page) return

  if (pendingMode) {
    writeMode(pendingMode)
    pendingMode = null
  }

  const mode = modeFromUrl()
  if (!mode) {
    resetDirectoryCopy(page)
    syncMobileActiveState(null, page)
    return
  }

  updateDirectoryCopy(page, mode)
  const tab = findDirectoryTab(page, mode)
  if (tab && !tab.classList.contains('active')) {
    tab.click()
    return
  }
  syncMobileActiveState(mode, page)
}

function scheduleEnhance() {
  window.cancelAnimationFrame(enhanceFrame)
  enhanceFrame = window.requestAnimationFrame(enhanceNow)
}

function requestMode(mode: DirectoryMode) {
  pendingMode = mode
  scheduleEnhance()
  window.setTimeout(scheduleEnhance, 0)
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
}

export {}
