import './add-action-menu.css'
import './mobile-sections-nav'

type AddMode = 'family' | 'person' | 'event' | 'relationship'

const MODE_STORAGE_KEY = 'sila_add_screen_mode'
const SCREEN_PARAM = 'screen'
const SCREEN_VALUES: Record<AddMode, string> = {
  person: 'add-person',
  family: 'add-family',
  event: 'add-event',
  relationship: 'add-relationship',
}

const modeMeta: Record<AddMode, { label: string; title: string; description: string; icon: string }> = {
  person: {
    label: 'شخص جديد',
    title: 'إضافة شخص',
    description: 'أنشئ ملف شخص جديد وأكمل بياناته وصلته بالعائلة.',
    icon: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="10" r="4"/><path d="M8 26c.8-5.2 3.5-8 8-8s7.2 2.8 8 8"/></svg>',
  },
  family: {
    label: 'عائلة جديدة',
    title: 'إضافة عائلة',
    description: 'أنشئ سجل عائلة جديد ليظهر في دليل الأسر بعد الاعتماد.',
    icon: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="10" cy="11" r="3.4"/><circle cx="22" cy="11" r="3.4"/><path d="M4.5 25c.7-4.6 2.6-7 5.5-7s4.8 2.4 5.5 7M16.5 25c.7-4.3 2.5-6.6 5.5-6.6s4.8 2.3 5.5 6.6"/></svg>',
  },
  event: {
    label: 'مناسبة جديدة',
    title: 'إضافة مناسبة',
    description: 'أضف خبرًا أو مناسبة عائلية واربطها بالأشخاص والعائلة المعنية.',
    icon: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="8" width="20" height="18" rx="4"/><path d="M10 5v6M22 5v6M6 14h20M11 19h4M18 19h3"/></svg>',
  },
  relationship: {
    label: 'صلة قرابة',
    title: 'إضافة صلة قرابة',
    description: 'اربط شخصين بصلة قرابة مباشرة ليتم توثيق العلاقة داخل الشجرة.',
    icon: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="8" cy="9" r="3"/><circle cx="24" cy="9" r="3"/><circle cx="16" cy="24" r="3"/><path d="M10.5 11.5 14.5 21M21.5 11.5 17.5 21M11 9h10"/></svg>',
  },
}

const segmentLabels: Record<AddMode, string> = {
  family: 'عائلة',
  person: 'شخص',
  event: 'مناسبة',
  relationship: 'صلة قرابة',
}

let pickerLayer: HTMLElement | null = null
let sourceButton: HTMLButtonElement | null = null
let bypassAddClick = false
let pendingMode: AddMode | null = null
let restoreMode: AddMode | null = null
let enhanceFrame = 0
let retryTimer = 0

function normalizedText(element: Element | null) {
  return element?.textContent?.replace(/\s+/g, ' ').trim() || ''
}

function readStoredMode(): AddMode | null {
  try {
    const value = window.sessionStorage.getItem(MODE_STORAGE_KEY)
    return value === 'family' || value === 'person' || value === 'event' || value === 'relationship' ? value : null
  } catch {
    return null
  }
}

function storeMode(mode: AddMode) {
  try { window.sessionStorage.setItem(MODE_STORAGE_KEY, mode) } catch { /* storage can be disabled */ }
}

function modeFromUrl(): AddMode | null {
  const value = new URL(window.location.href).searchParams.get(SCREEN_PARAM)
  return (Object.keys(SCREEN_VALUES) as AddMode[]).find((mode) => SCREEN_VALUES[mode] === value) || null
}

function writeScreenMode(mode: AddMode | null) {
  const url = new URL(window.location.href)
  const current = url.searchParams.get(SCREEN_PARAM)
  const isCurrentAddScreen = (Object.values(SCREEN_VALUES) as string[]).includes(current || '')

  if (mode) {
    const next = SCREEN_VALUES[mode]
    if (current === next) return
    url.searchParams.set(SCREEN_PARAM, next)
  } else {
    if (!isCurrentAddScreen) return
    url.searchParams.delete(SCREEN_PARAM)
  }

  window.history.replaceState(window.history.state, '', url.toString())
}

function isAddRoute() {
  return window.location.hash.startsWith('#/add')
}

function isAddNavigationButton(button: HTMLButtonElement) {
  if (button.matches('.mobile-bottom-nav .add-nav-action')) return true
  return Boolean(button.closest('.desktop-nav') && normalizedText(button) === 'إضافة')
}

function currentAddButton() {
  if (sourceButton?.isConnected) return sourceButton
  const mobile = document.querySelector<HTMLButtonElement>('.mobile-bottom-nav .add-nav-action')
  if (mobile) return mobile
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.desktop-nav button'))
    .find((button) => normalizedText(button) === 'إضافة') || null
}

function closePicker() {
  pickerLayer?.remove()
  pickerLayer = null
  document.body.classList.remove('add-action-picker-open')
}

function openPicker(trigger: HTMLButtonElement) {
  closePicker()
  sourceButton = trigger

  const layer = document.createElement('div')
  layer.className = 'add-action-picker-layer'
  layer.setAttribute('role', 'dialog')
  layer.setAttribute('aria-modal', 'true')
  layer.setAttribute('aria-label', 'اختر نوع الإضافة')

  const backdrop = document.createElement('button')
  backdrop.type = 'button'
  backdrop.className = 'add-action-picker-backdrop'
  backdrop.setAttribute('aria-label', 'إغلاق خيارات الإضافة')
  backdrop.addEventListener('click', closePicker)

  const menu = document.createElement('div')
  menu.className = 'add-action-picker-menu'

  ;(['person', 'family', 'event', 'relationship'] as AddMode[]).forEach((mode, index) => {
    const meta = modeMeta[mode]
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `add-action-choice add-action-choice-${mode}`
    button.style.setProperty('--choice-index', String(index))
    button.innerHTML = `<span class="add-action-choice-label">${meta.label}</span><span class="add-action-choice-icon">${meta.icon}</span>`
    button.addEventListener('click', () => chooseMode(mode))
    menu.appendChild(button)
  })

  layer.append(backdrop, menu)
  document.body.appendChild(layer)
  pickerLayer = layer
  document.body.classList.add('add-action-picker-open')

  const rect = trigger.getBoundingClientRect()
  layer.style.setProperty('--add-trigger-x', `${Math.round(rect.left + rect.width / 2)}px`)
  layer.style.setProperty('--add-trigger-y', `${Math.round(rect.top)}px`)

  window.requestAnimationFrame(() => layer.classList.add('visible'))
}

function findSegmentedControl() {
  return Array.from(document.querySelectorAll<HTMLElement>('.segmented-control')).find((control) => {
    const labels = Array.from(control.querySelectorAll('button')).map((button) => normalizedText(button))
    return labels.includes('عائلة') && labels.includes('شخص') && labels.includes('مناسبة') && labels.includes('صلة قرابة')
  }) || null
}

function activeMode(control: HTMLElement): AddMode {
  const activeLabel = normalizedText(control.querySelector('button.active'))
  const found = (Object.keys(segmentLabels) as AddMode[]).find((mode) => segmentLabels[mode] === activeLabel)
  return found || 'family'
}

function forceStandaloneShell(section: HTMLElement, control: HTMLElement, mode: AddMode) {
  section.classList.add('add-standalone-screen')
  section.dataset.addStandaloneMode = mode
  control.style.setProperty('display', 'none', 'important')

  const pageHeading = section.querySelector<HTMLElement>(':scope > .page-heading')
  if (pageHeading) pageHeading.style.setProperty('display', 'none', 'important')
}

function selectModeInReact(mode: AddMode, attempts = 0) {
  const control = findSegmentedControl()
  if (!control) {
    if (attempts < 60) window.setTimeout(() => selectModeInReact(mode, attempts + 1), 40)
    return
  }

  const button = Array.from(control.querySelectorAll<HTMLButtonElement>('button'))
    .find((item) => normalizedText(item) === segmentLabels[mode])

  if (button && !button.classList.contains('active')) {
    button.click()
    window.setTimeout(() => selectModeInReact(mode, attempts + 1), 0)
    return
  }

  pendingMode = null
  restoreMode = null
  storeMode(mode)
  writeScreenMode(mode)
  scheduleEnhance()
}

function triggerNativeAddNavigation() {
  const button = currentAddButton()
  if (!button) return
  bypassAddClick = true
  button.click()
}

function chooseMode(mode: AddMode) {
  pendingMode = mode
  restoreMode = null
  storeMode(mode)
  closePicker()

  if (!isAddRoute()) triggerNativeAddNavigation()

  window.setTimeout(() => {
    writeScreenMode(mode)
    selectModeInReact(mode)
  }, 25)
}

function makeStandaloneHeader(mode: AddMode) {
  const meta = modeMeta[mode]
  const header = document.createElement('header')
  header.className = 'add-standalone-heading'
  header.dataset.mode = mode

  const copy = document.createElement('div')
  copy.innerHTML = `<span>إضافة جديدة</span><h1>${meta.title}</h1><p>${meta.description}</p>`

  const back = document.createElement('button')
  back.type = 'button'
  back.className = 'add-standalone-back'
  back.textContent = '→ العودة'
  back.addEventListener('click', () => {
    if (window.history.length > 1) window.history.back()
    else document.querySelector<HTMLButtonElement>('.brand')?.click()
  })

  header.append(copy, back)
  return header
}

function updateStandaloneHeader(header: HTMLElement, mode: AddMode) {
  if (header.dataset.mode === mode) return
  const meta = modeMeta[mode]
  header.dataset.mode = mode
  const copy = header.querySelector('div')
  if (copy) copy.innerHTML = `<span>إضافة جديدة</span><h1>${meta.title}</h1><p>${meta.description}</p>`
}

function enhanceAddScreen() {
  enhanceFrame = 0

  if (!isAddRoute()) {
    writeScreenMode(null)
    return
  }

  const control = findSegmentedControl()
  if (!control) {
    scheduleRetry()
    return
  }

  const section = control.closest<HTMLElement>('section.page-section')
  if (!section) {
    scheduleRetry()
    return
  }

  const requestedMode = pendingMode || modeFromUrl() || restoreMode || activeMode(control)
  const currentMode = activeMode(control)

  // Hide the shared selector immediately. It is only an internal React control now;
  // the user sees one dedicated destination per add type.
  forceStandaloneShell(section, control, requestedMode)

  if (requestedMode !== currentMode) {
    const target = Array.from(control.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => normalizedText(button) === segmentLabels[requestedMode])
    if (target) {
      target.click()
      forceStandaloneShell(section, control, requestedMode)
      scheduleRetry()
      return
    }
  }

  pendingMode = null
  restoreMode = null
  storeMode(requestedMode)
  writeScreenMode(requestedMode)

  let header = section.querySelector<HTMLElement>(':scope > .add-standalone-heading')
  if (!header) {
    header = makeStandaloneHeader(requestedMode)
    section.prepend(header)
  } else {
    updateStandaloneHeader(header, requestedMode)
  }
}

function scheduleEnhance() {
  // Coalesce mutation bursts so React cannot starve the enhancer while mounting.
  if (enhanceFrame) return
  enhanceFrame = window.requestAnimationFrame(enhanceAddScreen)
}

function scheduleRetry() {
  window.clearTimeout(retryTimer)
  retryTimer = window.setTimeout(scheduleEnhance, 35)
}

function clearAddScreenWhenLeaving(target: Element) {
  const primary = target.closest<HTMLButtonElement>('.desktop-nav button, .mobile-bottom-nav button, .brand')
  if (!primary || isAddNavigationButton(primary)) return
  writeScreenMode(null)
  pendingMode = null
  restoreMode = null
}

if (typeof document !== 'undefined') {
  restoreMode = isAddRoute() ? (modeFromUrl() || readStoredMode()) : null

  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    clearAddScreenWhenLeaving(target)

    const button = target.closest<HTMLButtonElement>('button')
    if (!button || !isAddNavigationButton(button)) return

    if (bypassAddClick) {
      bypassAddClick = false
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    if (pickerLayer) closePicker()
    else openPicker(button)
  }, true)

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && pickerLayer) closePicker()
  })

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleEnhance, { once: true })
  else scheduleEnhance()

  const observer = new MutationObserver(scheduleEnhance)
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })

  window.addEventListener('popstate', () => {
    pendingMode = null
    restoreMode = isAddRoute() ? (modeFromUrl() || readStoredMode()) : null
    scheduleEnhance()
  })

  window.addEventListener('hashchange', () => {
    if (!isAddRoute()) {
      writeScreenMode(null)
      pendingMode = null
      restoreMode = null
    } else {
      restoreMode = modeFromUrl() || readStoredMode()
    }
    scheduleEnhance()
  })

  window.addEventListener('pageshow', () => {
    restoreMode = isAddRoute() ? (modeFromUrl() || readStoredMode()) : null
    scheduleEnhance()
  })

  window.addEventListener('sila:history-navigation', scheduleEnhance)
}

export {}
