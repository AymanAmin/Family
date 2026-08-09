type CaptureMode = 'network' | 'lineage'

export type TreeImageExport = {
  blob: Blob
  fileName: string
  width: number
  height: number
}

type CaptureOptions = {
  mode: CaptureMode
  personName: string
  elements: HTMLElement[]
}

const CAPTURE_WIDTH = 1400

function cleanFilePart(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 70) || 'tree'
}

function collectDocumentStyles() {
  let css = ''
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        const text = rule.cssText || ''
        if (!text || text.startsWith('@font-face') || text.startsWith('@import')) continue
        css += `${text}\n`
      }
    } catch {
      // Cross-origin styles are intentionally skipped. The capture has local fallback styles below.
    }
  }
  return css
}

function captureOverrides(mode: CaptureMode) {
  return `
    .tree-share-sheet, .tree-share-sheet * { box-sizing: border-box !important; font-family: Tahoma, Arial, sans-serif !important; }
    .tree-share-sheet { direction: rtl; color: #26445f; background: #fffdf9; }
    .tree-share-content { display: grid; gap: 28px; }
    .tree-share-content > * { max-width: 100% !important; }
    .tree-share-sheet button { cursor: default !important; }
    .tree-share-sheet .text-link,
    .tree-share-sheet .lineage-expand-profile,
    .tree-share-sheet .lineage-expand-guide,
    .tree-share-sheet .lineage-hierarchy-footnote,
    .tree-share-sheet .kinship-pan-hint { display: none !important; }
    .tree-share-sheet .kinship-map { width: 100% !important; min-width: 1080px !important; margin-inline: auto !important; }
    .tree-share-sheet .kinship-scroll { overflow: visible !important; }
    .tree-share-sheet .kin-extended-panel { margin-top: 0 !important; }
    .tree-share-sheet .lineage-hierarchy { width: 100% !important; max-width: none !important; margin: 0 !important; }
    .tree-share-sheet .lineage-branch-strip { overflow: visible !important; flex-wrap: wrap !important; }
    .tree-share-sheet .lineage-focus-path > div { overflow: visible !important; flex-wrap: wrap !important; }
    .tree-share-sheet .lineage-expand-tree { overflow: visible !important; }
    .tree-share-sheet .lineage-expand-households { overflow: visible !important; }
    ${mode === 'network' ? '.tree-share-sheet .kinship-map { padding: 30px !important; }' : ''}
  `
}

function addText(parent: HTMLElement, className: string, text: string) {
  const element = document.createElement('div')
  element.className = className
  element.textContent = text
  parent.appendChild(element)
  return element
}

function buildCaptureSheet(options: CaptureOptions) {
  const host = document.createElement('div')
  Object.assign(host.style, {
    position: 'fixed',
    insetInlineStart: '-20000px',
    top: '0',
    width: `${CAPTURE_WIDTH}px`,
    pointerEvents: 'none',
    zIndex: '-1',
    opacity: '1',
  })

  const sheet = document.createElement('div')
  sheet.className = `tree-share-sheet tree-share-sheet-${options.mode}`
  Object.assign(sheet.style, {
    width: `${CAPTURE_WIDTH}px`,
    padding: '52px 58px 42px',
    background: '#fffdf9',
    color: '#26445f',
    direction: 'rtl',
  })

  const header = document.createElement('header')
  header.className = 'tree-share-brand-header'
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '28px',
    paddingBottom: '28px',
    marginBottom: '32px',
    borderBottom: '2px solid #dce7e7',
  })

  const brandCopy = document.createElement('div')
  Object.assign(brandCopy.style, { display: 'grid', gap: '6px', textAlign: 'right' })
  const title = addText(brandCopy, 'tree-share-brand-title', 'صلة القرابة')
  Object.assign(title.style, { color: '#203f68', fontSize: '34px', fontWeight: '900' })
  const subtitle = addText(brandCopy, 'tree-share-brand-subtitle', options.mode === 'network' ? 'شبكة العلاقات' : 'هيكل النسب')
  Object.assign(subtitle.style, { color: '#3d7897', fontSize: '22px', fontWeight: '800' })
  const subject = addText(brandCopy, 'tree-share-brand-subject', options.personName)
  Object.assign(subject.style, { color: '#6b7e87', fontSize: '18px', fontWeight: '700' })

  const mark = document.createElement('div')
  mark.className = 'tree-share-brand-mark'
  mark.textContent = 'ص'
  Object.assign(mark.style, {
    display: 'grid',
    width: '82px',
    height: '82px',
    flex: '0 0 82px',
    placeItems: 'center',
    borderRadius: '28px',
    color: '#244a78',
    background: 'linear-gradient(145deg,#e7f4f1,#d6ece8)',
    border: '1px solid #cce4df',
    fontSize: '36px',
    fontWeight: '900',
  })

  header.append(brandCopy, mark)
  sheet.appendChild(header)

  const content = document.createElement('main')
  content.className = 'tree-share-content'
  options.elements.forEach((element) => {
    const clone = element.cloneNode(true) as HTMLElement
    clone.removeAttribute('style')
    content.appendChild(clone)
  })
  sheet.appendChild(content)

  const footer = document.createElement('footer')
  Object.assign(footer.style, {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '24px',
    marginTop: '34px',
    paddingTop: '22px',
    borderTop: '1px solid #e1e9e7',
    color: '#7c8d87',
    fontSize: '15px',
    fontWeight: '700',
  })
  const date = new Intl.DateTimeFormat('ar-SA', { dateStyle: 'long' }).format(new Date())
  addText(footer, 'tree-share-footer-source', 'تم إنشاء الصورة من منصة صلة القرابة')
  addText(footer, 'tree-share-footer-date', date)
  sheet.appendChild(footer)

  host.appendChild(sheet)
  document.body.appendChild(host)
  return { host, sheet }
}

function waitForLayout() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

async function loadSvgImage(svg: string) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const image = new Image()
  try {
    image.src = url
    if ('decode' in image) await image.decode()
    else await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('تعذر تجهيز صورة الشجرة.'))
    })
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function createTreeImage(options: CaptureOptions): Promise<TreeImageExport> {
  if (!options.elements.length) throw new Error('لا يوجد مخطط ظاهر يمكن تحويله إلى صورة.')

  if ('fonts' in document) {
    try { await document.fonts.ready } catch { /* continue with system fonts */ }
  }

  const { host, sheet } = buildCaptureSheet(options)
  try {
    await waitForLayout()
    const width = Math.ceil(Math.max(CAPTURE_WIDTH, sheet.scrollWidth))
    const height = Math.ceil(Math.max(420, sheet.scrollHeight))
    const styles = collectDocumentStyles()
    const serialized = new XMLSerializer().serializeToString(sheet)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${styles}\n${captureOverrides(options.mode)}</style>${serialized}</div></foreignObject></svg>`

    const image = await loadSvgImage(svg)
    const scale = Math.min(2, 4096 / width, 8192 / height)
    const outputWidth = Math.max(1, Math.round(width * scale))
    const outputHeight = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('تعذر تهيئة محرك الصور في هذا الجهاز.')
    context.fillStyle = '#fffdf9'
    context.fillRect(0, 0, outputWidth, outputHeight)
    context.drawImage(image, 0, 0, outputWidth, outputHeight)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('تعذر إنشاء ملف PNG.')), 'image/png', 0.96)
    })

    const kind = options.mode === 'network' ? 'relationship-network' : 'lineage-tree'
    const fileName = `sila-${kind}-${cleanFilePart(options.personName)}.png`
    return { blob, fileName, width: outputWidth, height: outputHeight }
  } finally {
    host.remove()
  }
}

export function downloadTreeImage(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1200)
}

export async function shareTreeImage(blob: Blob, fileName: string, title: string) {
  const file = new File([blob], fileName, { type: 'image/png', lastModified: Date.now() })
  const shareData: ShareData = { title, text: 'صورة من منصة صلة القرابة', files: [file] }
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean }

  if (!navigator.share || (nav.canShare && !nav.canShare(shareData))) return false
  await navigator.share(shareData)
  return true
}
