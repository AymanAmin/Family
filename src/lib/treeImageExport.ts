type CaptureMode = 'network' | 'lineage'
type ExportFormat = 'png'

export type TreeImageExport = {
  blob: Blob
  fileName: string
  width: number
  height: number
  format: ExportFormat
}

type CaptureOptions = {
  mode: CaptureMode
  personName: string
  elements: HTMLElement[]
}

type ShareNode = { name: string; detail: string; badge?: string }
type ShareGroup = { title: string; nodes: ShareNode[] }
type LineageRow = { name: string; detail: string; spouses: string[]; depth: number }

const WIDTH = 1600
const PADDING = 64
const NAVY = '#203f68'
const BLUE = '#3d7897'
const TEAL = '#66b9b1'
const TEAL_LIGHT = '#e8f5f2'
const PAPER = '#fffdf9'
const MUTED = '#6b7e87'
const BORDER = '#dce7e7'
const SAND = '#f8efe3'
const GOLD = '#b87935'

function cleanFilePart(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 70) || 'tree'
}

function esc(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function text(root: ParentNode | null, selector: string) {
  return root?.querySelector<HTMLElement>(selector)?.textContent?.trim() || ''
}

function splitText(value: string, max = 32) {
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > max && current) {
      lines.push(current)
      current = word
    } else current = next
  }
  if (current) lines.push(current)
  return lines.slice(0, 2)
}

function svgText(x: number, y: number, value: string, size: number, fill: string, weight = 700, anchor: 'start' | 'middle' | 'end' = 'middle', max = 34) {
  const lines = splitText(value, max)
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" direction="rtl" unicode-bidi="plaintext" font-family="Tahoma,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : size * 1.25}">${esc(line)}</tspan>`).join('')}</text>`
}

function roundedRect(x: number, y: number, w: number, h: number, fill: string, stroke = BORDER, radius = 22) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
}

function nodeCard(x: number, y: number, w: number, node: ShareNode, highlighted = false) {
  const h = 88
  const circleX = x + w - 48
  const textX = x + w - 92
  return `${roundedRect(x, y, w, h, highlighted ? TEAL_LIGHT : '#ffffff', highlighted ? '#b7ddd6' : BORDER, 18)}
    <circle cx="${circleX}" cy="${y + 44}" r="25" fill="${highlighted ? NAVY : TEAL_LIGHT}"/>
    ${svgText(circleX, y + 52, node.name.trim().charAt(0) || '؟', 20, highlighted ? '#fff' : NAVY, 900)}
    ${svgText(textX, y + 34, node.name, 20, NAVY, 900, 'end', 29)}
    ${node.detail ? svgText(textX, y + 61, node.detail, 15, MUTED, 700, 'end', 32) : ''}
    ${node.badge ? `<rect x="${x + 14}" y="${y + 14}" width="84" height="28" rx="14" fill="#fff4d8" stroke="#ead7a1"/><text x="${x + 56}" y="${y + 34}" text-anchor="middle" direction="rtl" font-family="Tahoma,Arial,sans-serif" font-size="13" font-weight="800" fill="#80652d">${esc(node.badge)}</text>` : ''}`
}

function parseKinNode(element: Element): ShareNode {
  return {
    name: text(element, '.kin-copy strong') || text(element, 'strong') || 'غير محدد',
    detail: text(element, '.kin-copy small') || text(element, 'small'),
    badge: text(element, '.kin-auto') || undefined,
  }
}

function parseGroup(element: Element | null): ShareGroup | null {
  if (!element) return null
  const nodes = Array.from(element.querySelectorAll('.kin-node')).map(parseKinNode)
  if (!nodes.length) return null
  return { title: text(element, '.kin-group-title span') || 'صلة قرابة', nodes }
}

function groupHeight(group: ShareGroup, width: number) {
  const cols = width > 1200 ? 4 : width > 700 ? 3 : 2
  return 76 + Math.ceil(group.nodes.length / cols) * 104 + 12
}

function renderGroup(group: ShareGroup, x: number, y: number, width: number) {
  const cols = width > 1200 ? 4 : width > 700 ? 3 : 2
  const gap = 16
  const cardW = (width - 40 - gap * (cols - 1)) / cols
  const h = groupHeight(group, width)
  let out = `${roundedRect(x, y, width, h, '#fbfdfc', BORDER, 24)}${svgText(x + width - 26, y + 40, group.title, 22, NAVY, 900, 'end', 40)}`
  group.nodes.forEach((node, index) => {
    const row = Math.floor(index / cols)
    const col = index % cols
    const cardX = x + width - 20 - cardW - col * (cardW + gap)
    const cardY = y + 62 + row * 104
    out += nodeCard(cardX, cardY, cardW, node)
  })
  return { svg: out, height: h }
}

function svgShell(title: string, subtitle: string, subject: string, content: string, height: number) {
  const date = new Intl.DateTimeFormat('ar-SA', { dateStyle: 'long' }).format(new Date())
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
    <rect width="100%" height="100%" fill="${PAPER}"/>
    <circle cx="${WIDTH - 116}" cy="92" r="44" fill="${TEAL_LIGHT}" stroke="#cce4df" stroke-width="2"/>
    ${svgText(WIDTH - 116, 104, 'ص', 34, NAVY, 900)}
    ${svgText(WIDTH - 190, 72, title, 34, NAVY, 900, 'end', 36)}
    ${svgText(WIDTH - 190, 111, subtitle, 22, BLUE, 800, 'end', 36)}
    ${svgText(WIDTH - 190, 146, subject, 18, MUTED, 700, 'end', 42)}
    <line x1="${PADDING}" y1="178" x2="${WIDTH - PADDING}" y2="178" stroke="${BORDER}" stroke-width="2"/>
    ${content}
    <line x1="${PADDING}" y1="${height - 74}" x2="${WIDTH - PADDING}" y2="${height - 74}" stroke="${BORDER}"/>
    ${svgText(WIDTH - PADDING, height - 36, 'تم إنشاء الصورة من منصة صلة القرابة', 15, MUTED, 700, 'end', 44)}
    ${svgText(PADDING, height - 36, date, 15, MUTED, 700, 'start', 30)}
  </svg>`
}

function buildNetworkSvg(options: CaptureOptions) {
  const map = options.elements.find((item) => item.classList.contains('kinship-map')) || options.elements[0]
  const extended = options.elements.find((item) => item.classList.contains('kin-extended-panel')) || null
  const selfName = text(map, '.kin-self strong') || options.personName
  const parents = parseGroup(map?.querySelector('.kin-parent'))
  const siblings = parseGroup(map?.querySelector('.kin-sibling'))
  const spouses = parseGroup(map?.querySelector('.kin-spouse'))
  const children = parseGroup(map?.querySelector('.kin-child'))
  const extendedGroups = extended ? Array.from(extended.querySelectorAll('.kin-group')).map(parseGroup).filter((item): item is ShareGroup => Boolean(item)) : []

  let y = 216
  let content = ''
  const inner = WIDTH - PADDING * 2
  if (parents) {
    const rendered = renderGroup(parents, PADDING, y, inner)
    content += rendered.svg
    y += rendered.height + 34
  }

  const selfW = 560
  const selfX = (WIDTH - selfW) / 2
  content += `<line x1="${WIDTH / 2}" y1="${Math.max(190, y - 34)}" x2="${WIDTH / 2}" y2="${y}" stroke="#9bc9c1" stroke-width="4"/>`
  content += nodeCard(selfX, y, selfW, { name: selfName, detail: 'الشخص الحالي' }, true)
  const selfCenterY = y + 44
  y += 124

  if (siblings || spouses) {
    const gap = 26
    const sideW = (inner - gap) / 2
    const left = siblings ? renderGroup(siblings, PADDING, y, sideW) : null
    const right = spouses ? renderGroup(spouses, PADDING + sideW + gap, y, sideW) : null
    if (left) content += left.svg
    if (right) content += right.svg
    const rowH = Math.max(left?.height || 0, right?.height || 0)
    content += `<path d="M ${selfX} ${selfCenterY} H ${PADDING + sideW / 2}" stroke="#b8d8d2" stroke-width="3" fill="none"/><path d="M ${selfX + selfW} ${selfCenterY} H ${PADDING + sideW + gap + sideW / 2}" stroke="#b8d8d2" stroke-width="3" fill="none"/>`
    y += rowH + 34
  }

  if (children) {
    content += `<line x1="${WIDTH / 2}" y1="${y - 30}" x2="${WIDTH / 2}" y2="${y}" stroke="#9bc9c1" stroke-width="4"/>`
    const rendered = renderGroup(children, PADDING, y, inner)
    content += rendered.svg
    y += rendered.height + 42
  }

  if (extendedGroups.length) {
    content += `${svgText(WIDTH - PADDING, y + 20, 'القرابة الممتدة', 28, NAVY, 900, 'end', 30)}${svgText(WIDTH - PADDING, y + 51, 'علاقات مستنتجة من شبكة النسب المسجلة', 16, MUTED, 700, 'end', 42)}`
    y += 76
    const gap = 24
    const colW = (inner - gap) / 2
    for (let i = 0; i < extendedGroups.length; i += 2) {
      const first = renderGroup(extendedGroups[i], PADDING + colW + gap, y, colW)
      content += first.svg
      const secondGroup = extendedGroups[i + 1]
      const second = secondGroup ? renderGroup(secondGroup, PADDING, y, colW) : null
      if (second) content += second.svg
      y += Math.max(first.height, second?.height || 0) + 24
    }
  }

  const height = Math.max(980, y + 110)
  return { svg: svgShell('صلة القرابة', 'شبكة العلاقات', options.personName, content, height), width: WIDTH, height }
}

function parseLineageRows(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>('.lineage-expand-tree .lineage-expand-node')).flatMap((node): LineageRow[] => {
    const card = node.querySelector<HTMLElement>(':scope > .lineage-expand-card') || node.querySelector<HTMLElement>('.lineage-expand-card')
    const name = text(card, '.lineage-expand-copy strong')
    if (!name) return []
    let depth = 0
    let parent = node.parentElement
    while (parent && !parent.classList.contains('lineage-expand-tree')) {
      if (parent.classList.contains('lineage-expand-node')) depth += 1
      parent = parent.parentElement
    }
    const spouses = card ? Array.from(card.querySelectorAll<HTMLElement>('.lineage-spouse-rail button strong')).map((item) => item.textContent?.trim() || '').filter(Boolean) : []
    return [{ name, detail: text(card, '.lineage-expand-copy small'), spouses, depth }]
  })
}

function buildLineageSvg(options: CaptureOptions) {
  const root = options.elements[0]
  const rootName = text(root, '.lineage-root-node strong') || options.personName
  const lineageName = text(root, '.lineage-root-node em')
  const rootSpouses = Array.from(root.querySelectorAll<HTMLElement>('.lineage-root-spouses .lineage-spouse-rail button strong')).map((item) => item.textContent?.trim() || '').filter(Boolean)
  const stats = Array.from(root.querySelectorAll<HTMLElement>('.lineage-root-stats span')).map((item) => ({ value: text(item, 'b'), label: text(item, 'small') }))
  const path = Array.from(root.querySelectorAll<HTMLElement>('.lineage-focus-path button')).map((item) => item.textContent?.trim() || '').filter(Boolean)
  const branches = Array.from(root.querySelectorAll<HTMLElement>('.lineage-branch-strip > button')).map((item) => ({ name: text(item, 'strong'), detail: text(item, 'small') })).filter((item) => item.name)
  const rows = parseLineageRows(root)

  let y = 220
  let content = ''
  const rootW = 700
  const rootX = (WIDTH - rootW) / 2
  content += `${roundedRect(rootX, y, rootW, 142, TEAL_LIGHT, '#add8d0', 30)}${svgText(WIDTH / 2, y + 34, 'الجد الأعلى', 16, BLUE, 900)}${svgText(WIDTH / 2, y + 75, rootName, 28, NAVY, 900, 'middle', 34)}${lineageName ? svgText(WIDTH / 2, y + 111, lineageName, 17, MUTED, 700, 'middle', 40) : ''}`
  if (rootSpouses.length) content += svgText(WIDTH / 2, y + 133, `الزوج/الزوجة: ${rootSpouses.join(' · ')}`, 14, MUTED, 700, 'middle', 70)
  y += 176

  if (stats.length) {
    const statW = 250
    const total = stats.length * statW + (stats.length - 1) * 18
    let x = (WIDTH - total) / 2 + total - statW
    stats.forEach((stat) => {
      content += `${roundedRect(x, y, statW, 88, '#fff', BORDER, 18)}${svgText(x + statW / 2, y + 34, stat.value || '—', 26, NAVY, 900)}${svgText(x + statW / 2, y + 65, stat.label, 15, MUTED, 700)}`
      x -= statW + 18
    })
    y += 124
  }

  if (path.length) {
    content += svgText(WIDTH - PADDING, y + 18, 'مسار الشخص داخل النسب', 21, NAVY, 900, 'end', 35)
    y += 38
    const pillW = 300
    const gap = 14
    const perRow = 4
    path.forEach((name, index) => {
      const row = Math.floor(index / perRow)
      const col = index % perRow
      const x = WIDTH - PADDING - pillW - col * (pillW + gap)
      const yy = y + row * 62
      content += `${roundedRect(x, yy, pillW, 48, index === path.length - 1 ? TEAL_LIGHT : '#fff', BORDER, 24)}${svgText(x + pillW / 2, yy + 31, name, 15, NAVY, 800, 'middle', 29)}`
    })
    y += Math.ceil(path.length / perRow) * 62 + 24
  }

  if (branches.length) {
    content += `<line x1="${WIDTH / 2}" y1="${y - 22}" x2="${WIDTH / 2}" y2="${y + 16}" stroke="#9bc9c1" stroke-width="4"/>${svgText(WIDTH - PADDING, y + 22, 'الفروع المباشرة', 24, NAVY, 900, 'end', 32)}`
    y += 50
    const gap = 18
    const cardW = (WIDTH - PADDING * 2 - gap * 2) / 3
    branches.forEach((branch, index) => {
      const row = Math.floor(index / 3)
      const col = index % 3
      const x = WIDTH - PADDING - cardW - col * (cardW + gap)
      const yy = y + row * 118
      content += `${roundedRect(x, yy, cardW, 98, '#fff', BORDER, 20)}${svgText(x + cardW / 2, yy + 38, branch.name, 19, NAVY, 900, 'middle', 30)}${svgText(x + cardW / 2, yy + 70, branch.detail, 14, MUTED, 700, 'middle', 34)}`
    })
    y += Math.ceil(branches.length / 3) * 118 + 30
  }

  if (rows.length) {
    content += `${svgText(WIDTH - PADDING, y + 18, 'الفرع المفتوح حاليًا', 24, NAVY, 900, 'end', 34)}${svgText(WIDTH - PADDING, y + 48, 'الأجيال المفتوحة في الشاشة وقت إنشاء الصورة', 15, MUTED, 700, 'end', 44)}`
    y += 72
    rows.forEach((row) => {
      const indent = Math.min(row.depth, 7) * 62
      const x = PADDING + indent
      const w = WIDTH - PADDING * 2 - indent
      content += `<line x1="${WIDTH - PADDING - indent + 22}" y1="${y - 14}" x2="${WIDTH - PADDING - indent + 22}" y2="${y + 82}" stroke="#c7ded9" stroke-width="3"/>`
      content += `${roundedRect(x, y, w, 86, row.depth === 0 ? TEAL_LIGHT : '#fff', row.depth === 0 ? '#b7ddd6' : BORDER, 18)}${svgText(x + w - 32, y + 34, row.name, 20, NAVY, 900, 'end', 42)}${svgText(x + w - 32, y + 61, row.detail || (row.spouses.length ? `الزوج/الزوجة: ${row.spouses.join(' · ')}` : ''), 14, MUTED, 700, 'end', 60)}`
      y += 102
    })
  }

  const height = Math.max(980, y + 110)
  return { svg: svgShell('صلة القرابة', 'هيكل النسب', options.personName, content, height), width: WIDTH, height }
}

async function loadSvgImage(svg: string) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('تعذر تجهيز مخطط الشجرة.'))
      image.src = url
    })
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function canvasToPng(canvas: HTMLCanvasElement) {
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('تعذر إنشاء PNG.')), 'image/png', 0.96)
    })
    return blob
  } catch {
    const dataUrl = canvas.toDataURL('image/png', 0.96)
    return await fetch(dataUrl).then((response) => response.blob())
  }
}

export async function createTreeImage(options: CaptureOptions): Promise<TreeImageExport> {
  if (!options.elements.length) throw new Error('لا يوجد مخطط ظاهر يمكن تحويله إلى صورة.')
  const rendered = options.mode === 'network' ? buildNetworkSvg(options) : buildLineageSvg(options)
  const image = await loadSvgImage(rendered.svg)
  const scale = Math.max(0.5, Math.min(2, 4096 / rendered.width, 8192 / rendered.height))
  const outputWidth = Math.max(1, Math.round(rendered.width * scale))
  const outputHeight = Math.max(1, Math.round(rendered.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = outputWidth
  canvas.height = outputHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('تعذر تهيئة محرك الصور في هذا الجهاز.')
  context.fillStyle = PAPER
  context.fillRect(0, 0, outputWidth, outputHeight)
  context.drawImage(image, 0, 0, outputWidth, outputHeight)
  const blob = await canvasToPng(canvas)
  const kind = options.mode === 'network' ? 'relationship-network' : 'lineage-tree'
  return { blob, fileName: `sila-${kind}-${cleanFilePart(options.personName)}.png`, width: outputWidth, height: outputHeight, format: 'png' }
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
