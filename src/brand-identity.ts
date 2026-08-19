const svgIcon = (body: string): string => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

const icons = {
  home: svgIcon('<path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.8 10.2V20h12.4v-9.8"/><path d="M9.5 20v-5.6h5V20"/>'),
  people: svgIcon('<circle cx="12" cy="7.8" r="3"/><circle cx="5.5" cy="10" r="2.2"/><circle cx="18.5" cy="10" r="2.2"/><path d="M6.5 20c.6-4.6 2.4-6.8 5.5-6.8s4.9 2.2 5.5 6.8"/><path d="M1.5 19c.4-3.4 1.8-5 4.2-5 1.3 0 2.4.4 3.1 1.1M22.5 19c-.4-3.4-1.8-5-4.2-5-1.3 0-2.4.4-3.1 1.1"/>'),
  add: svgIcon('<path d="M12 5v14M5 12h14"/>'),
  tree: svgIcon('<circle cx="12" cy="5.2" r="2.2"/><circle cx="6" cy="17.8" r="2.2"/><circle cx="18" cy="17.8" r="2.2"/><path d="M12 7.4v4.1M6 15.6v-2.2h12v2.2"/>'),
  admin: svgIcon('<rect x="4" y="4" width="6" height="6" rx="1.4"/><rect x="14" y="4" width="6" height="6" rx="1.4"/><rect x="4" y="14" width="6" height="6" rx="1.4"/><rect x="14" y="14" width="6" height="6" rx="1.4"/>'),
  account: svgIcon('<circle cx="12" cy="8" r="3.4"/><path d="M5.3 20c.9-4.1 3.1-6.1 6.7-6.1s5.8 2 6.7 6.1"/>'),
}

const APPROVED_LOGO_URL = `${import.meta.env.BASE_URL}brand/sila-approved-v4.jpg?v=10`
const APPROVED_LOGO_FALLBACK_URL = `${import.meta.env.BASE_URL}icons/icon-approved-v4-192.jpg?v=10`

function enhanceBrandMark(): void {
  const mark = document.querySelector<HTMLElement>('.brand-mark')
  if (!mark) return

  const current = mark.querySelector<HTMLImageElement>('img')
  if (current?.dataset.silaApprovedLogo === '1' && current.complete && current.naturalWidth > 0) return

  const image = document.createElement('img')
  image.src = APPROVED_LOGO_URL
  image.alt = ''
  image.decoding = 'async'
  image.loading = 'eager'
  image.className = 'sila-brand-image'
  image.dataset.silaApprovedLogo = '1'

  let triedFallback = false
  image.addEventListener('error', () => {
    if (!triedFallback) {
      triedFallback = true
      image.src = APPROVED_LOGO_FALLBACK_URL
      return
    }
    mark.replaceChildren(document.createTextNode('ص'))
    mark.dataset.silaBrand = 'fallback'
  })

  mark.replaceChildren(image)
  mark.dataset.silaBrand = '10'
}

function enhanceBrandName(): void {
  document.querySelectorAll<HTMLElement>('.brand strong').forEach((title) => {
    if (title.textContent !== 'صلة القرابة') title.textContent = 'صلة القرابة'
  })
  if (document.title !== 'صلة القرابة') document.title = 'صلة القرابة'
}

function enhanceMobileNavigation(): void {
  const nav = document.querySelector<HTMLElement>('.mobile-bottom-nav')
  if (!nav) return

  nav.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    const icon = button.querySelector<HTMLElement>('.mobile-nav-icon')
    if (!icon || icon.dataset.silaIcon === '1') return

    const label = button.textContent?.trim() ?? ''
    let markup = icons.account
    if (label.includes('الرئيسية')) markup = icons.home
    else if (label.includes('الأفراد') || label.includes('الدليل')) markup = icons.people
    else if (label.includes('إضافة')) markup = icons.add
    else if (label.includes('الشجرة')) markup = icons.tree
    else if (label.includes('الإدارة')) markup = icons.admin

    icon.innerHTML = markup
    icon.dataset.silaIcon = '1'
  })
}

function applyBrandIdentity(): void {
  enhanceBrandMark()
  enhanceBrandName()
  enhanceMobileNavigation()
}

let scheduled = false
function scheduleBrandIdentity(): void {
  if (scheduled) return
  scheduled = true
  window.setTimeout((): void => {
    scheduled = false
    applyBrandIdentity()
  }, 0)
}

const observer = new MutationObserver((): void => scheduleBrandIdentity())
observer.observe(document.documentElement, { childList: true, subtree: true })
window.addEventListener('hashchange', scheduleBrandIdentity)
window.addEventListener('popstate', scheduleBrandIdentity)
scheduleBrandIdentity()
