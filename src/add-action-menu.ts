import './add-action-menu.css'
import './mobile-sections-nav'

type AddMode = 'family' | 'person' | 'event' | 'relationship'

const MODE_STORAGE_KEY = 'sila_add_screen_mode'

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
let restoreMode: AddMode | null = window.location.hash.startsWith('#/add') ? readStoredMode() : null
let enhanceFrame = 0

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

function selectModeInReact(mode: AddMode, attempts = 0) {
  const control = findSegmentedControl()
  if (!control) {
    if (attempts < 45) window.setTimeout(() => selectModeInReact(mode, attempts + 1), 45)
    return
  }

  const button = Array.from(control.querySelectorAll<HTMLButtonElement>('button'))
    .find((item) => normalizedText(item) === segmentLabels[mode])

  if (button && !button.classList.contains('active')) button.click()
  else pendingMode = null
  storeMode(mode)
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
  triggerNativeAddNavigation()
  window.setTimeout(() => selectModeInReact(mode), 30)
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
  const control = findSegmentedControl()
  if (!control) return
  const section = control.closest<HTMLElement>('section.page-section')
  if (!section) return

  section.classList.add('add-standalone-screen')
  const mode = activeMode(control)
  const requestedMode = pendingMode || restoreMode

  if (requestedMode && requestedMode !== mode) {
    const target = Array.from(control.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => normalizedText(button) === segmentLabels[requestedMode])
    if (target) {
      target.click()
      return
    }
  }

  if (requestedMode === mode) {
    pendingMode = null
    restoreMode = null
  }

  storeMode(mode)
  let header = section.querySelector<HTMLElement>(':scope > .add-standalone-heading')
  if (!header) {
    header = makeStandaloneHeader(mode)
    section.prepend(header)
  } else {
    updateStandaloneHeader(header, mode)
  }
}

function scheduleEnhance() {
  window.cancelAnimationFrame(enhanceFrame)
  enhanceFrame = window.requestAnimationFrame(enhanceAddScreen)
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
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
}

export {}
