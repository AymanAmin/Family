const svgIcon = (body: string): string => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

const icons = {
  home: svgIcon('<path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.8 10.2V20h12.4v-9.8"/><path d="M9.5 20v-5.6h5V20"/>'),
  search: svgIcon('<circle cx="10.8" cy="10.8" r="6.2"/><path d="m15.4 15.4 4.7 4.7"/>'),
  add: svgIcon('<path d="M12 5v14M5 12h14"/>'),
  tree: svgIcon('<circle cx="12" cy="5.2" r="2.2"/><circle cx="6" cy="17.8" r="2.2"/><circle cx="18" cy="17.8" r="2.2"/><path d="M12 7.4v4.1M6 15.6v-2.2h12v2.2"/>'),
  admin: svgIcon('<rect x="4" y="4" width="6" height="6" rx="1.4"/><rect x="14" y="4" width="6" height="6" rx="1.4"/><rect x="4" y="14" width="6" height="6" rx="1.4"/><rect x="14" y="14" width="6" height="6" rx="1.4"/>'),
  account: svgIcon('<circle cx="12" cy="8" r="3.4"/><path d="M5.3 20c.9-4.1 3.1-6.1 6.7-6.1s5.8 2 6.7 6.1"/>'),
}

function enhanceBrandMark(): void {
  const mark = document.querySelector<HTMLElement>('.brand-mark')
  if (!mark || mark.dataset.silaBrand === '1') return

  const image = document.createElement('img')
  image.src = `${import.meta.env.BASE_URL}brand/sila-mark.svg`
  image.alt = ''
  image.decoding = 'async'
  mark.replaceChildren(image)
  mark.dataset.silaBrand = '1'
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
    else if (label.includes('الدليل')) markup = icons.search
    else if (label.includes('إضافة')) markup = icons.add
    else if (label.includes('الشجرة')) markup = icons.tree
    else if (label.includes('الإدارة')) markup = icons.admin

    icon.innerHTML = markup
    icon.dataset.silaIcon = '1'
  })
}

function applyBrandIdentity(): void {
  enhanceBrandMark()
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
scheduleBrandIdentity()
