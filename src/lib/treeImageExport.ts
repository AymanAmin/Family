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

const WIDTH = 1200
const PADDING = 54
const INNER = WIDTH - PADDING * 2
const NAVY = '#203f68'
const BLUE = '#3d7897'
const TEAL = '#66b9b1'
const TEAL_LIGHT = '#e8f5f2'
const PAPER = '#fffdf9'
const MUTED = '#6b7e87'
const BORDER = '#dce7e7'
const SOFT = '#f8fbfa'
const SAND = '#fff8ee'

function cleanFilePart(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 70) || 'tree'
}

function esc(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function text(root: ParentNode | null, selector: string) {
  return root?.querySelector<HTMLElement>(selector)?.textContent?.trim() || ''
}

function splitText(value: string, max = 28) {
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

function svgText(x: number, y: number, value: string, size: number, fill: string, weight = 700, max = 30) {
  const lines = splitText(value, max)
  return `<text x="${x}" y="${y}" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="Tahoma,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : size * 1.22}">${esc(line)}</tspan>`).join('')}</text>`
}

function roundedRect(x: number, y: number, w: number, h: number, fill: string, stroke = BORDER, radius = 20) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
}

function nodeCard(x: number, y: number, w: number, node: ShareNode, highlighted = false) {
  const h = 92
  const center = x + w / 2
  const nameY = y + 35
  const detailY = y + 66
  return `${roundedRect(x, y, w, h, highlighted ? TEAL_LIGHT : '#fff', highlighted ? '#abd8d0' : BORDER, 18)}
    ${svgText(center, nameY, node.name, 19, NAVY, 900, Math.max(18, Math.floor(w / 12)))}
    ${node.detail ? svgText(center, detailY, node.detail, 14, MUTED, 700, Math.max(20, Math.floor(w / 10))) : ''}
    ${node.badge ? `<rect x="${x + 14}" y="${y + 10}" width="70" height="24" rx="12" fill="#fff4d8" stroke="#ead7a1"/><text x="${x + 49}" y="${y + 27}" text-anchor="middle" direction="rtl" font-family="Tahoma,Arial,sans-serif" font-size="11" font-weight="800" fill="#80652d">${esc(node.badge.replace('✦', '').trim())}</text>` : ''}`
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

function renderCardsSection(title: string, nodes: ShareNode[], y: number, accent = false, maxCols = 3) {
  const cols = Math.max(1, Math.min(maxCols, nodes.length))
  const gap = 14
  const cardW = (INNER - 36 - gap * (cols - 1)) / cols
  const rows = Math.ceil(nodes.length / cols)
  const height = 62 + rows * 106 + 18
  let svg = `${roundedRect(PADDING, y, INNER, height, accent ? '#f2faf8' : SOFT, accent ? '#c6e5df' : BORDER, 24)}${svgText(WIDTH / 2, y + 35, title, 21, NAVY, 900, 34)}`
  nodes.forEach((node, index) => {
    const row = Math.floor(index / cols)
    const col = index % cols
    const rowCount = Math.min(cols, nodes.length - row * cols)
    const rowWidth = rowCount * cardW + (rowCount - 1) * gap
    const rowStart = (WIDTH - rowWidth) / 2
    const x = rowStart + col * (cardW + gap)
    const yy = y + 54 + row * 106
    svg += nodeCard(x, yy, cardW, node)
  })
  return { svg, height }
}

function shell(subtitle: string, subject: string, content: string, height: number) {
  const date = new Intl.DateTimeFormat('ar-SA', { dateStyle: 'long' }).format(new Date())
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
    <rect width="100%" height="100%" fill="${PAPER}"/>
    <circle cx="${WIDTH / 2}" cy="68" r="31" fill="${TEAL_LIGHT}" stroke="#cce4df" stroke-width="2"/>
    ${svgText(WIDTH / 2, 78, 'ص', 25, NAVY, 900, 4)}
    ${svgText(WIDTH / 2, 122, 'صلة القرابة', 29, NAVY, 900, 20)}
    ${svgText(WIDTH / 2, 157, subtitle, 20, BLUE, 800, 24)}
    ${svgText(WIDTH / 2, 187, subject, 16, MUTED, 700, 38)}
    <line x1="${PADDING}" y1="210" x2="${WIDTH - PADDING}" y2="210" stroke="${BORDER}" stroke-width="2"/>
    ${content}
    <line x1="${PADDING}" y1="${height - 66}" x2="${WIDTH - PADDING}" y2="${height - 66}" stroke="${BORDER}"/>
    ${svgText(WIDTH / 2, height - 36, `صلة القرابة · ${date}`, 13, MUTED, 700, 44)}
  </svg>`
}

function buildNetworkSvg(options: CaptureOptions) {
  const map = options.elements.find((item) => item.classList.contains('kinship-map')) || options.elements[0]
  const extended = options.elements.find((item) => item.classList.contains('kin-extended-panel')) || null
  const selfName = text(map, '.kin-self strong') || options.personName
  const groups: ShareGroup[] = []
  const parents = parseGroup(map?.querySelector('.kin-parent'))
  const siblings = parseGroup(map?.querySelector('.kin-sibling'))
  const spouses = parseGroup(map?.querySelector('.kin-spouse'))
  const children = parseGroup(map?.querySelector('.kin-child'))
  if (parents) groups.push(parents)
  if (siblings) groups.push(siblings)
  if (spouses) groups.push(spouses)
  if (children) groups.push(children)

  let y = 242
  let content = ''
  if (parents) {
    const rendered = renderCardsSection(parents.title, parents.nodes, y, true)
    content += rendered.svg
    y += rendered.height + 24
    groups.shift()
  }

  content += `<line x1="${WIDTH / 2}" y1="${y - 20}" x2="${WIDTH / 2}" y2="${y + 5}" stroke="#9bc9c1" stroke-width="4"/>`
  const selfW = 510
  content += nodeCard((WIDTH - selfW) / 2, y, selfW, { name: selfName, detail: 'الشخص الحالي' }, true)
  y += 122

  for (const group of groups) {
    const rendered = renderCardsSection(group.title, group.nodes, y, group.title.includes('الأبناء'))
    content += rendered.svg
    y += rendered.height + 22
  }

  if (extended) {
    const extendedGroups = Array.from(extended.querySelectorAll('.kin-group')).map(parseGroup).filter((item): item is ShareGroup => Boolean(item))
    if (extendedGroups.length) {
      y += 8
      content += `${svgText(WIDTH / 2, y + 24, 'القرابة الممتدة', 25, NAVY, 900, 28)}${svgText(WIDTH / 2, y + 52, 'علاقات مستنتجة من شبكة النسب المسجلة', 14, MUTED, 700, 42)}`
      y += 74
      for (const group of extendedGroups) {
        const rendered = renderCardsSection(group.title, group.nodes, y, false)
        content += rendered.svg
        y += rendered.height + 18
      }
    }
  }

  const height = Math.max(900, y + 95)
  return { svg: shell('شبكة العلاقات', options.personName, content, height), width: WIDTH, height }
}

function parseLineageRows(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>('.lineage-expand-tree .lineage-expand-node')).flatMap((node): LineageRow[] => {
    const card = node.querySelector<HTMLElement>(':scope > .lineage-expand-card') || node.querySelector<HTMLElement>('.lineage-expand-card')
    const name = text(card, '.lineage-expand-copy strong')
    if (!name) return []
    let depth = 0
    let parent = node.parentElement
    while (parent && !parent.classList.contains('lineage-expand-tree')) {
      if (parent.classList.contains('lineage-expand-households')) depth += 1
      parent = parent.parentElement
    }
    const spouses = card ? Array.from(card.querySelectorAll<HTMLElement>('.lineage-spouse-rail button strong')).map((item) => item.textContent?.trim() || '').filter(Boolean) : []
    return [{ name, detail: text(card, '.lineage-expand-copy small'), spouses, depth }]
  })
}

function lineageNode(row: LineageRow): ShareNode {
  const spouse = row.spouses.length ? ` · زوج/زوجة: ${row.spouses.join('، ')}` : ''
  return { name: row.name, detail: `${row.detail || ''}${spouse}`.trim() }
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

  let y = 242
  let content = ''
  const rootW = 620
  const rootX = (WIDTH - rootW) / 2
  content += `${roundedRect(rootX, y, rootW, 132, TEAL_LIGHT, '#add8d0', 26)}${svgText(WIDTH / 2, y + 31, 'الجد الأعلى', 15, BLUE, 900, 18)}${svgText(WIDTH / 2, y + 68, rootName, 25, NAVY, 900, 32)}${lineageName ? svgText(WIDTH / 2, y + 98, lineageName, 15, MUTED, 700, 38) : ''}${rootSpouses.length ? svgText(WIDTH / 2, y + 120, `الزوج/الزوجة: ${rootSpouses.join('، ')}`, 12, MUTED, 700, 58) : ''}`
  y += 157

  if (stats.length) {
    const gap = 14
    const cols = Math.min(3, stats.length)
    const cardW = (720 - gap * (cols - 1)) / cols
    const startX = (WIDTH - (cardW * cols + gap * (cols - 1))) / 2
    stats.slice(0, 3).forEach((stat, index) => {
      const x = startX + index * (cardW + gap)
      content += `${roundedRect(x, y, cardW, 78, '#fff', BORDER, 16)}${svgText(x + cardW / 2, y + 31, stat.value || '—', 23, NAVY, 900, 10)}${svgText(x + cardW / 2, y + 59, stat.label, 13, MUTED, 700, 18)}`
    })
    y += 104
  }

  if (path.length) {
    const nodes = path.map((name, index) => ({ name, detail: index === path.length - 1 ? 'الشخص الحالي' : 'ضمن مسار النسب' }))
    const rendered = renderCardsSection('مسار الشخص داخل النسب', nodes, y, true, 3)
    content += rendered.svg
    y += rendered.height + 22
  }

  if (branches.length) {
    const rendered = renderCardsSection('الفروع المباشرة', branches.map((branch) => ({ name: branch.name, detail: branch.detail })), y, false, 3)
    content += rendered.svg
    y += rendered.height + 22
  }

  if (rows.length) {
    content += `${svgText(WIDTH / 2, y + 24, 'الفرع المفتوح حاليًا', 25, NAVY, 900, 30)}${svgText(WIDTH / 2, y + 53, 'ترتيب الأفراد حسب الأجيال المفتوحة في الشاشة', 14, MUTED, 700, 44)}`
    y += 76
    const byDepth = new Map<number, LineageRow[]>()
    for (const row of rows) {
      const bucket = byDepth.get(row.depth) ?? []
      bucket.push(row)
      byDepth.set(row.depth, bucket)
    }
    const depths = [...byDepth.keys()].sort((a, b) => a - b)
    for (const depth of depths) {
      const generationRows = byDepth.get(depth) ?? []
      const title = depth === 0 ? 'بداية الفرع' : `الجيل ${depth + 1}`
      const rendered = renderCardsSection(title, generationRows.map(lineageNode), y, depth === 0, 3)
      content += rendered.svg
      y += rendered.height + 20
    }
  }

  const height = Math.max(900, y + 95)
  return { svg: shell('هيكل النسب', options.personName, content, height), width: WIDTH, height }
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
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('تعذر إنشاء PNG.')), 'image/png', 0.96)
    })
  } catch {
    const dataUrl = canvas.toDataURL('image/png', 0.96)
    return await fetch(dataUrl).then((response) => response.blob())
  }
}

export async function createTreeImage(options: CaptureOptions): Promise<TreeImageExport> {
  if (!options.elements.length) throw new Error('لا يوجد مخطط ظاهر يمكن تحويله إلى صورة.')
  const rendered = options.mode === 'network' ? buildNetworkSvg(options) : buildLineageSvg(options)
  const image = await loadSvgImage(rendered.svg)
  const scale = Math.min(1.6, 3600 / rendered.width, 12000 / rendered.height)
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
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export async function shareTreeImage(blob: Blob, fileName: string, title: string) {
  const file = new File([blob], fileName, { type: 'image/png', lastModified: Date.now() })
  const shareData: ShareData = { title, text: 'صورة من منصة صلة القرابة', files: [file] }
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean }
  if (!navigator.share || (nav.canShare && !nav.canShare(shareData))) return false
  await navigator.share(shareData)
  return true
}
