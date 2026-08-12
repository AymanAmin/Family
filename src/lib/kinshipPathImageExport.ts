import type { KinshipPathStep } from '../components/KinshipPathGraph'
import { kinshipVisualEdgeLabel } from '../components/KinshipPathGraph'

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

type GraphLayout = {
  graphWidth: number
  graphHeight: number
  nodes: PositionedNode[]
  edges: PositionedEdge[]
}

const BASE_WIDTH = 1200
const PADDING = 54
const GRAPH_SIDE_GUTTER = 40
const BASE_INNER = BASE_WIDTH - PADDING * 2
const NODE_W = 250
const NODE_H = 104
const ROW_GAP = 168
const COL_GAP = 84
const NAVY = '#203f68'
const BLUE = '#3d7897'
const TEAL = '#66b9b1'
const PAPER = '#fffdf9'
const MUTED = '#6b7e87'
const BORDER = '#dce7e7'
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

function splitContinuousText(value: string, max = 64, maxLines = 4) {
  const source = value.trim()
  if (!source) return ['']
  const lines: string[] = []
  let remaining = source

  while (remaining.length > max && lines.length < maxLines - 1) {
    const window = remaining.slice(0, max + 1)
    const candidates = [window.lastIndexOf('&'), window.lastIndexOf('?'), window.lastIndexOf('/'), window.lastIndexOf('=')]
    const preferred = Math.max(...candidates)
    const cut = preferred >= Math.floor(max * 0.55) ? preferred + 1 : max
    lines.push(remaining.slice(0, cut))
    remaining = remaining.slice(cut)
  }

  if (remaining && lines.length < maxLines) lines.push(remaining)
  return lines
}

function svgText(x: number, y: number, value: string, size: number, fill: string, weight = 700, max = 42, maxLines = 2) {
  const lines = splitText(value, max, maxLines)
  return `<text x="${x}" y="${y}" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="Tahoma,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : size * 1.32}">${esc(line)}</tspan>`).join('')}</text>`
}

function svgLines(x: number, y: number, lines: string[], size: number, fill: string, weight = 700, lineGap = 1.32) {
  return `<text x="${x}" y="${y}" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="Tahoma,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : size * lineGap}">${esc(line)}</tspan>`).join('')}</text>`
}

function roundedRect(x: number, y: number, w: number, h: number, fill: string, stroke = BORDER, radius = 22, strokeWidth = 2) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
}

function generationDelta(type: string) {
  if (type === 'parent') return -1
  if (type === 'child') return 1
  return 0
}

function buildLayout(path: KinshipPathStep[]): GraphLayout {
  const generations: number[] = [0]
  for (let index = 1; index < path.length; index += 1) {
    generations[index] = generations[index - 1] + generationDelta(path[index].relation_type)
  }

  const minGeneration = Math.min(...generations)
  const normalized = generations.map((value) => value - minGeneration)
  const rows = new Map<number, number[]>()
  normalized.forEach((generation, index) => {
    const bucket = rows.get(generation) ?? []
    bucket.push(index)
    rows.set(generation, bucket)
  })

  const maxRowCount = Math.max(...Array.from(rows.values(), (items) => items.length))
  const requiredRowWidth = maxRowCount * NODE_W + Math.max(0, maxRowCount - 1) * COL_GAP
  const graphWidth = Math.max(BASE_INNER - GRAPH_SIDE_GUTTER * 2, requiredRowWidth + GRAPH_SIDE_GUTTER * 2)
  const maxGeneration = Math.max(...normalized)
  const graphHeight = 48 + NODE_H + maxGeneration * ROW_GAP + 48
  const positioned = new Map<number, PositionedNode>()

  rows.forEach((indices, generation) => {
    const rowWidth = indices.length * NODE_W + Math.max(0, indices.length - 1) * COL_GAP
    const start = (graphWidth - rowWidth) / 2
    indices.forEach((pathIndex, rowIndex) => {
      const visualIndex = indices.length - 1 - rowIndex
      positioned.set(pathIndex, {
        ...path[pathIndex],
        index: pathIndex,
        generation,
        x: start + visualIndex * (NODE_W + COL_GAP),
        y: 44 + generation * ROW_GAP,
      })
    })
  })

  const nodes = path.map((_, index) => positioned.get(index)!).filter(Boolean)
  const edges: PositionedEdge[] = []
  for (let index = 1; index < nodes.length; index += 1) {
    const from = nodes[index - 1]
    const to = nodes[index]
    edges.push({
      from,
      to,
      label: kinshipVisualEdgeLabel(from, to),
      inferred: to.is_inferred,
      kind: from.generation === to.generation ? 'same' : 'vertical',
    })
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

function graphSvg(summary: KinshipPathImageSummary, layout: GraphLayout, xOffset: number, yOffset: number) {
  let svg = ''

  for (const edge of layout.edges) {
    const pos = edgeLabelPosition(edge)
    const labelWidth = Math.max(80, Math.min(142, edge.label.length * 14 + 32))
    const marriage = edge.to.relation_type === 'spouse'
    svg += `<path d="${edgePath(edge)}" transform="translate(${xOffset} ${yOffset})" fill="none" stroke="${marriage ? '#d0aa62' : '#b9d0c8'}" stroke-width="${marriage ? 5 : 3}" stroke-linecap="round" stroke-linejoin="round"/>`
    svg += `<rect x="${xOffset + pos.x - labelWidth / 2}" y="${yOffset + pos.y - 18}" width="${labelWidth}" height="36" rx="18" fill="${marriage ? '#fff8e9' : '#fff'}" stroke="${marriage ? '#e6c887' : '#d9e5e1'}" stroke-width="2"/>`
    svg += `<text x="${xOffset + pos.x}" y="${yOffset + pos.y + 5}" text-anchor="middle" direction="rtl" font-family="Tahoma,Arial,sans-serif" font-size="15" font-weight="900" fill="#315f56">${esc(edge.label)}</text>`
    if (edge.inferred) {
      svg += `<text x="${xOffset + pos.x}" y="${yOffset + pos.y + 31}" text-anchor="middle" direction="rtl" font-family="Tahoma,Arial,sans-serif" font-size="10" font-weight="800" fill="#9a7739">✦ مستنتج</text>`
    }
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
    const nameLines = splitText(node.full_name, 22, 2)
    const roleY = y + (nameLines.length > 1 ? 88 : 81)
    const nameCenterX = x + 99

    svg += roundedRect(x, y, NODE_W, NODE_H, fill, stroke, 18, 3)
    svg += `<circle cx="${x + NODE_W - 39}" cy="${y + 51}" r="25" fill="${avatarFill}"/>`
    svg += `<text x="${x + NODE_W - 39}" y="${y + 59}" text-anchor="middle" direction="rtl" font-family="Tahoma,Arial,sans-serif" font-size="20" font-weight="900" fill="${avatarText}">${esc(node.full_name.trim().charAt(0) || '؟')}</text>`
    svg += svgLines(nameCenterX, y + 35, nameLines, 17, NAVY, 900, 1.28)
    svg += svgText(nameCenterX, roleY, isFrom ? 'البداية' : isTo ? 'النهاية' : 'ضمن المسار', 11, MUTED, 700, 18, 1)
  }

  return svg
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
  const layout = buildLayout(summary.path)

  // The exported canvas expands with the graph instead of clipping large
  // same-generation branches inside the old fixed 1200px canvas.
  const width = Math.max(BASE_WIDTH, Math.ceil(layout.graphWidth + (PADDING + GRAPH_SIDE_GUTTER) * 2))
  const centerX = width / 2
  const inner = width - PADDING * 2
  const graphOffsetX = (width - layout.graphWidth) / 2

  const subtitle = `${summary.toName} بالنسبة إلى ${summary.fromName}`
  const subtitleMax = Math.max(46, Math.min(82, Math.floor(inner / 20)))
  const subtitleLines = splitText(subtitle, subtitleMax, 2)
  const subtitleY = 168
  const subtitleBottom = subtitleY + Math.max(0, subtitleLines.length - 1) * 27

  const relationLines = splitText(summary.relationshipLabel, 30, 2)
  const relationTop = Math.max(218, subtitleBottom + 26)
  const relationCardHeight = relationLines.length > 1 ? 132 : 112
  const relationCardWidth = Math.min(600, inner - 120)
  const relationLabelY = relationTop + 42
  const badgeY = relationTop + relationCardHeight - 38

  const graphTop = relationTop + relationCardHeight + 34
  const graphCardHeight = layout.graphHeight + 44
  const graph = graphSvg(summary, layout, graphOffsetX, graphTop + 22)

  const detailMax = Math.max(64, Math.min(108, Math.floor(inner / 16)))
  const detailLines = splitText(summary.relationshipDetail, detailMax, 3)
  const detailHeight = Math.max(98, 54 + detailLines.length * 27)
  const detailTop = graphTop + graphCardHeight + 28

  const urlLabel = shortUrl(summary.shareUrl)
  const urlMax = Math.max(66, Math.min(112, Math.floor(inner / 15)))
  const urlLines = splitContinuousText(urlLabel, urlMax, 4)
  const linkCardHeight = Math.max(126, 76 + urlLines.length * 24)
  const linkTop = detailTop + detailHeight + 20
  const height = linkTop + linkCardHeight + 124

  const relationKind = summary.isBloodRelation ? 'نسب' : summary.viaMarriage ? 'مصاهرة' : 'صلة مسجلة'
  const degreeLabel = summary.degree == null ? '' : `${summary.degree} درجات`
  const date = new Intl.DateTimeFormat('ar-SA', { dateStyle: 'long' }).format(new Date())

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffdf9"/><stop offset="1" stop-color="#f4faf8"/></linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#173d32" flood-opacity=".08"/></filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#paper)"/>
    <circle cx="${centerX}" cy="70" r="32" fill="#e7f4f1" stroke="#cce4df" stroke-width="2"/>
    ${svgText(centerX, 80, 'ص', 25, NAVY, 900, 4, 1)}
    ${svgText(centerX, 126, 'صلة القرابة', 31, NAVY, 900, 20, 1)}
    ${svgLines(centerX, subtitleY, subtitleLines, 20, BLUE, 800, 1.32)}

    <rect x="${centerX - relationCardWidth / 2}" y="${relationTop}" width="${relationCardWidth}" height="${relationCardHeight}" rx="26" fill="#ffffff" stroke="#cfe3dc" stroke-width="2" filter="url(#shadow)"/>
    ${svgLines(centerX, relationLabelY, relationLines, 29, NAVY, 900, 1.24)}
    <rect x="${centerX - 122}" y="${badgeY}" width="108" height="28" rx="14" fill="#eaf6f1"/><text x="${centerX - 68}" y="${badgeY + 19}" text-anchor="middle" direction="rtl" font-family="Tahoma,Arial,sans-serif" font-size="12" font-weight="900" fill="#315f56">${esc(relationKind)}</text>
    ${degreeLabel ? `<rect x="${centerX + 14}" y="${badgeY}" width="108" height="28" rx="14" fill="#eef4f8"/><text x="${centerX + 68}" y="${badgeY + 19}" text-anchor="middle" direction="rtl" font-family="Tahoma,Arial,sans-serif" font-size="12" font-weight="900" fill="#3d6d89">${esc(degreeLabel)}</text>` : ''}

    ${roundedRect(PADDING, graphTop, inner, graphCardHeight, '#fbfdfc', BORDER, 28, 2)}
    ${graph}

    ${roundedRect(PADDING, detailTop, inner, detailHeight, '#ffffff', BORDER, 22, 2)}
    ${svgText(centerX, detailTop + 31, 'توضيح العلاقة', 15, TEAL, 900, 28, 1)}
    ${svgLines(centerX, detailTop + 61, detailLines, 16, MUTED, 700, 1.55)}

    ${roundedRect(PADDING, linkTop, inner, linkCardHeight, '#fff8ee', '#ead8b7', 22, 2)}
    ${svgText(centerX, linkTop + 34, 'افتح الرابط لمشاهدة صلة القرابة والتفاصيل المحدثة', 15, GOLD, 900, 50, 1)}
    ${svgLines(centerX, linkTop + 70, urlLines, 13, NAVY, 700, 1.55)}

    <line x1="${PADDING}" y1="${height - 78}" x2="${width - PADDING}" y2="${height - 78}" stroke="${BORDER}"/>
    ${svgText(centerX, height - 45, `منصة صلة القرابة · ${date}`, 13, MUTED, 700, 44, 1)}
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

  // Preserve the full adaptive canvas while keeping PNG sizes practical on mobile.
  const scale = Math.min(1.5, 3600 / image.naturalWidth, 10000 / image.naturalHeight)
  const outputWidth = Math.round(image.naturalWidth * scale)
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
