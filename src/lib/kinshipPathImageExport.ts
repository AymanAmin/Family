import type { KinshipPathStep } from '../components/KinshipPathGraph'
import { kinshipStepLabel } from '../components/KinshipPathGraph'

export type KinshipPathImageSummary = {
  fromName: string
  toName: string
  relationshipLabel: string
  relationshipDetail: string
  degree: number | null
  viaMarriage: boolean
  isBloodRelation: boolean
  path: KinshipPathStep[]
  shareUrl: string
}

export type KinshipPathImageExport = {
  blob: Blob
  fileName: string
  width: number
  height: number
}

type PositionedNode = KinshipPathStep & { x: number; y: number; generation: number; index: number }

type PositionedEdge = {
  from: PositionedNode
  to: PositionedNode
  label: string
  inferred: boolean
  kind: 'same' | 'vertical'
}

const WIDTH = 1200
const PADDING = 54
const INNER = WIDTH - PADDING * 2
const NODE_W = 220
const NODE_H = 92
const ROW_GAP = 176
const COL_GAP = 66
const NAVY = '#203f68'
const BLUE = '#3d7897'
const TEAL = '#66b9b1'
const PAPER = '#fffdf9'
const MUTED = '#6b7e87'
const BORDER = '#dce7e7'
const SOFT = '#f7fbfa'
const PINK = '#a85f8b'
const GOLD = '#b68635'

function esc(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function cleanFilePart(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 70) || 'kinship'
}

function splitText(value: string, max = 42, maxLines = 3) {
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > max && current) {
      lines.push(current)
      current = word
      if (lines.length >= maxLines - 1) break
    } else current = next
  }
  if (current && lines.length < maxLines) lines.push(current)
  return lines.slice(0, maxLines)
}

function svgText(x: number, y: number, value: string, size: number, fill: string, weight = 700, max = 42, maxLines = 2) {
  const lines = splitText(value, max, maxLines)
  return `<text x="${x}" y="${y}" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="Tahoma,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : size * 1.32}">${esc(line)}</tspan>`).join('')}</text>`
}

function roundedRect(x: number, y: number, w: number, h: number, fill: string, stroke = BORDER, radius = 22, strokeWidth = 2) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
}

function generationDelta(type: string) {
  if (type === 'parent') return -1
  if (type === 'child') return 1
  return 0
}

function buildLayout(path: KinshipPathStep[]) {
  const generations: number[] = [0]
  for (let index = 1; index < path.length; index += 1) generations[index] = generations[index - 1] + generationDelta(path[index].relation_type)
  const minGeneration = Math.min(...generations)
  const normalized = generations.map((value) => value - minGeneration)
  const rows = new Map<number, number[]>()
  normalized.forEach((generation, index) => {
    const bucket = rows.get(generation) ?? []
    bucket.push(index)
    rows.set(generation, bucket)
  })

  const maxRowCount = Math.max(...Array.from(rows.values(), (items) => items.length))
  const graphWidth = Math.max(INNER - 80, maxRowCount * NODE_W + Math.max(0, maxRowCount - 1) * COL_GAP + 80)
  const maxGeneration = Math.max(...normalized)
  const graphHeight = 70 + NODE_H + maxGeneration * ROW_GAP + 70
  const positioned = new Map<number, PositionedNode>()

  rows.forEach((indices, generation) => {
    const rowWidth = indices.length * NODE_W + Math.max(0, indices.length - 1) * COL_GAP
    const start = (graphWidth - rowWidth) / 2
    indices.forEach((pathIndex, rowIndex) => {
      const visualIndex = indices.length - 1 - rowIndex
      positioned.set(pathIndex, {
        ...path[pathIndex], index: pathIndex, generation,
        x: start + visualIndex * (NODE_W + COL_GAP),
        y: 54 + generation * ROW_GAP,
      })
    })
  })

  const nodes = path.map((_, index) => positioned.get(index)!).filter(Boolean)
  const edges: PositionedEdge[] = []
  for (let index = 1; index < nodes.length; index += 1) {
    const from = nodes[index - 1]
    const to = nodes[index]
    edges.push({ from, to, label: kinshipStepLabel(to.relation_type, to.gender), inferred: to.is_inferred, kind: from.generation === to.generation ? 'same' : 'vertical' })
  }
  return { graphWidth, graphHeight, nodes, edges }
}

function edgePath(edge: PositionedEdge) {
  const fromX = edge.from.x + NODE_W / 2
  const toX = edge.to.x + NODE_W / 2
  if (edge.kind === 'same') {
    const y = edge.from.y + NODE_H / 2
    return `M ${fromX} ${y} H ${toX}`
  }
  const down = edge.to.y > edge.from.y
  const fromY = down ? edge.from.y + NODE_H : edge.from.y
  const toY = down ? edge.to.y : edge.to.y + NODE_H
  const middleY = (fromY + toY) / 2
  return `M ${fromX} ${fromY} V ${middleY} H ${toX} V ${toY}`
}

function edgeLabelPosition(edge: PositionedEdge) {
  const fromX = edge.from.x + NODE_W / 2
  const toX = edge.to.x + NODE_W / 2
  if (edge.kind === 'same') return { x: (fromX + toX) / 2, y: edge.from.y + NODE_H / 2 }
  const down = edge.to.y > edge.from.y
  const fromY = down ? edge.from.y + NODE_H : edge.from.y
  const toY = down ? edge.to.y : edge.to.y + NODE_H
  return { x: (fromX + toX) / 2, y: (fromY + toY) / 2 }
}

function graphSvg(summary: KinshipPathImageSummary, xOffset: number, yOffset: number) {
  const layout = buildLayout(summary.path)
  let svg = ''

  for (const edge of layout.edges) {
    const pos = edgeLabelPosition(edge)
    const labelWidth = Math.max(74, Math.min(134, edge.label.length * 13 + 30))
    const marriage = edge.to.relation_type === 'spouse'
    svg += `<path d="${edgePath(edge)}" transform="translate(${xOffset} ${yOffset})" fill="none" stroke="${marriage ? '#d0aa62' : '#b9d0c8'}" stroke-width="${marriage ? 5 : 3}" stroke-linecap="round" stroke-linejoin="round"/>`
    svg += `<rect x="${xOffset + pos.x - labelWidth / 2}" y="${yOffset + pos.y - 17}" width="${labelWidth}" height="34" rx="17" fill="${marriage ? '#fff8e9' : '#fff'}" stroke="${marriage ? '#e6c887' : '#d9e5e1'}" stroke-width="2"/>`
    svg += `<text x="${xOffset + pos.x}" y="${yOffset + pos.y + 5}" text-anchor="middle" direction="rtl" font-family="Tahoma,Arial,sans-serif" font-size="14" font-weight="900" fill="#315f56">${esc(edge.label)}</text>`
    if (edge.inferred) svg += `<text x="${xOffset + pos.x}" y="${yOffset + pos.y + 30}" text-anchor="middle" direction="rtl" font-family="Tahoma,Arial,sans-serif" font-size="10" font-weight="800" fill="#9a7739">✦ مستنتج</text>`
  }

  for (const node of layout.nodes) {
    const isFrom = node.person_id === summary.path[0]?.person_id
    const isTo = node.person_id === summary.path[summary.path.length - 1]?.person_id
    const fill = isFrom ? '#eef6fa' : isTo ? '#fbf0f6' : '#ffffff'
    const stroke = isFrom ? '#76a7bd' : isTo ? '#bf8bab' : BORDER
    const avatarFill = isFrom ? '#dceef5' : isTo ? '#f5dfeb' : node.gender === 'female' ? '#f5e9ee' : '#e2f0ea'
    const avatarText = isFrom ? '#285c7d' : isTo ? '#8c4c75' : node.gender === 'female' ? '#875f70' : '#315f56'
    const x = xOffset + node.x
    const y = yOffset + node.y
    svg += roundedRect(x, y, NODE_W, NODE_H, fill, stroke, 18, 3)
    svg += `<circle cx="${x + NODE_W - 38}" cy="${y + 46}" r="24" fill="${avatarFill}"/>`
    svg += `<text x="${x + NODE_W - 38}" y="${y + 53}" text-anchor="middle" direction="rtl" font-family="Tahoma,Arial,sans-serif" font-size="19" font-weight="900" fill="${avatarText}">${esc(node.full_name.trim().charAt(0) || '؟')}</text>`
    svg += svgText(x + NODE_W / 2 - 18, y + 36, node.full_name, 16, NAVY, 900, 20, 2)
    svg += svgText(x + NODE_W / 2 - 18, y + 76, isFrom ? 'البداية' : isTo ? 'النهاية' : 'ضمن المسار', 11, MUTED, 700, 18, 1)
  }

  return { svg, width: layout.graphWidth, height: layout.graphHeight }
}

function shortUrl(value: string) {
  try {
    const url = new URL(value)
    return `${url.host}${url.pathname}${url.search}`
  } catch {
    return value
  }
}

function buildSvg(summary: KinshipPathImageSummary) {
  const graph = graphSvg(summary, PADDING + 40, 340)
  const graphCardHeight = graph.height + 32
  const detailLines = splitText(summary.relationshipDetail, 58, 3)
  const detailHeight = Math.max(76, 30 + detailLines.length * 26)
  const footerY = 340 + graphCardHeight + 32
  const linkCardHeight = 118
  const height = footerY + detailHeight + linkCardHeight + 150
  const relationKind = summary.isBloodRelation ? 'نسب' : summary.viaMarriage ? 'مصاهرة' : 'صلة مسجلة'
  const degreeLabel = summary.degree == null ? '' : `${summary.degree} درجات`
  const urlLabel = shortUrl(summary.shareUrl)
  const date = new Intl.DateTimeFormat('ar-SA', { dateStyle: 'long' }).format(new Date())

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
    <defs>
      <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffdf9"/><stop offset="1" stop-color="#f4faf8"/></linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#173d32" flood-opacity=".08"/></filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#paper)"/>
    <circle cx="${WIDTH / 2}" cy="70" r="32" fill="#e7f4f1" stroke="#cce4df" stroke-width="2"/>
    ${svgText(WIDTH / 2, 80, 'ص', 25, NAVY, 900, 4, 1)}
    ${svgText(WIDTH / 2, 126, 'صلة القرابة', 31, NAVY, 900, 20, 1)}
    ${svgText(WIDTH / 2, 168, `${summary.toName} بالنسبة إلى ${summary.fromName}`, 20, BLUE, 800, 50, 2)}
    <rect x="${WIDTH / 2 - 250}" y="208" width="500" height="82" rx="24" fill="#ffffff" stroke="#cfe3dc" stroke-width="2" filter="url(#shadow)"/>
    ${svgText(WIDTH / 2, 252, summary.relationshipLabel, 28, NAVY, 900, 32, 2)}
    <rect x="${WIDTH / 2 - 118}" y="274" width="104" height="28" rx="14" fill="#eaf6f1"/><text x="${WIDTH / 2 - 66}" y="293" text-anchor="middle" direction="rtl" font-family="Tahoma,Arial,sans-serif" font-size="12" font-weight="900" fill="#315f56">${esc(relationKind)}</text>
    ${degreeLabel ? `<rect x="${WIDTH / 2 + 14}" y="274" width="104" height="28" rx="14" fill="#eef4f8"/><text x="${WIDTH / 2 + 66}" y="293" text-anchor="middle" direction="rtl" font-family="Tahoma,Arial,sans-serif" font-size="12" font-weight="900" fill="#3d6d89">${esc(degreeLabel)}</text>` : ''}
    ${roundedRect(PADDING, 322, INNER, graphCardHeight + 18, '#fbfdfc', BORDER, 28, 2)}
    ${graph.svg}
    ${roundedRect(PADDING, footerY, INNER, detailHeight, '#ffffff', BORDER, 22, 2)}
    ${svgText(WIDTH / 2, footerY + 30, 'توضيح العلاقة', 15, TEAL, 900, 28, 1)}
    <text x="${WIDTH / 2}" y="${footerY + 58}" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="Tahoma,Arial,sans-serif" font-size="16" font-weight="700" fill="${MUTED}">${detailLines.map((line, index) => `<tspan x="${WIDTH / 2}" dy="${index === 0 ? 0 : 26}">${esc(line)}</tspan>`).join('')}</text>
    ${roundedRect(PADDING, footerY + detailHeight + 20, INNER, linkCardHeight, '#fff8ee', '#ead8b7', 22, 2)}
    ${svgText(WIDTH / 2, footerY + detailHeight + 54, 'افتح الرابط لمشاهدة صلة القرابة والتفاصيل المحدثة', 15, GOLD, 900, 50, 1)}
    ${svgText(WIDTH / 2, footerY + detailHeight + 88, urlLabel, 13, NAVY, 700, 72, 2)}
    <line x1="${PADDING}" y1="${height - 78}" x2="${WIDTH - PADDING}" y2="${height - 78}" stroke="${BORDER}"/>
    ${svgText(WIDTH / 2, height - 45, `منصة صلة القرابة · ${date}`, 13, MUTED, 700, 44, 1)}
  </svg>`
}

function loadSvgImage(svg: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذر تجهيز صورة صلة القرابة.')) }
    image.src = url
  })
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('تعذر إنشاء ملف PNG.')), 'image/png', 0.98)
  })
}

export async function createKinshipPathImage(summary: KinshipPathImageSummary): Promise<KinshipPathImageExport> {
  if (!summary.path.length) throw new Error('لا يوجد مسار قرابة يمكن تحويله إلى صورة.')
  const svg = buildSvg(summary)
  const image = await loadSvgImage(svg)
  const scale = Math.min(1.5, 3200 / WIDTH, 10000 / image.naturalHeight)
  const outputWidth = Math.round(WIDTH * scale)
  const outputHeight = Math.round(image.naturalHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = outputWidth
  canvas.height = outputHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('تعذر تهيئة محرك الصور في هذا الجهاز.')
  context.fillStyle = PAPER
  context.fillRect(0, 0, outputWidth, outputHeight)
  context.drawImage(image, 0, 0, outputWidth, outputHeight)
  const blob = await canvasToPng(canvas)
  return {
    blob,
    fileName: `sila-kinship-${cleanFilePart(summary.fromName)}-${cleanFilePart(summary.toName)}.png`,
    width: outputWidth,
    height: outputHeight,
  }
}
