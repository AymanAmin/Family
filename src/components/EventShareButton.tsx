import { useState } from 'react'

type EventShareData = {
  id: string
  event_type: string
  title: string
  description?: string | null
  event_date?: string | null
  location_name?: string | null
  family_name?: string | null
  people?: string[]
}

type Props = {
  event: EventShareData
  compact?: boolean
}

type Theme = {
  top: string
  bottom: string
  paper: string
  accent: string
  accent2: string
  ink: string
  muted: string
  soft: string
  prayer: string
  darkHeader: boolean
}

type Blessing = {
  heading: string
  primary: string
  secondary: string
}

const labels: Record<string, string> = {
  death: 'وفاة وعزاء',
  wedding: 'زواج',
  birth: 'مولود',
  naming: 'سماية',
  graduation: 'تخرج ونجاح',
  general: 'خبر عائلي',
  other: 'مناسبة',
}

const FONT_FAMILY = "'Noto Kufi Arabic', 'Noto Sans Arabic', Tahoma, Arial, sans-serif"

function formatDate(value?: string | null) {
  if (!value) return 'التاريخ غير محدد'
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-arab', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    calendar: 'gregory',
    numberingSystem: 'arab',
  }).format(new Date(value))
}

function theme(type: string): Theme {
  if (type === 'death') {
    return {
      top: '#173b64', bottom: '#315d79', paper: '#fffdf9', accent: '#7bc9bd', accent2: '#c5a36a',
      ink: '#203f68', muted: '#60717c', soft: '#eef4f2', prayer: '#f3f0e8', darkHeader: true,
    }
  }
  if (type === 'wedding') {
    return {
      top: '#f8eee5', bottom: '#fffaf5', paper: '#ffffff', accent: '#ef7a50', accent2: '#c89c52',
      ink: '#203f68', muted: '#60717c', soft: '#f9e5d5', prayer: '#fff7ef', darkHeader: false,
    }
  }
  if (type === 'birth') {
    return {
      top: '#d9f1ed', bottom: '#f8fcfa', paper: '#ffffff', accent: '#3e8b9a', accent2: '#ef9b61',
      ink: '#203f68', muted: '#60717c', soft: '#e7f5f2', prayer: '#f0faf7', darkHeader: false,
    }
  }
  if (type === 'naming') {
    return {
      top: '#eaf4ee', bottom: '#fffdf7', paper: '#ffffff', accent: '#4e8b7e', accent2: '#d7a95f',
      ink: '#203f68', muted: '#60717c', soft: '#edf6f1', prayer: '#fbf8ee', darkHeader: false,
    }
  }
  if (type === 'graduation') {
    return {
      top: '#203f68', bottom: '#4b8794', paper: '#fffdf9', accent: '#f5aa5c', accent2: '#7bc9bd',
      ink: '#203f68', muted: '#60717c', soft: '#eef6f4', prayer: '#fff8ed', darkHeader: true,
    }
  }
  if (type === 'general') {
    return {
      top: '#244a78', bottom: '#66b9b1', paper: '#fffdf9', accent: '#f5aa5c', accent2: '#66b9b1',
      ink: '#203f68', muted: '#60717c', soft: '#edf6f4', prayer: '#fff8ef', darkHeader: true,
    }
  }
  return {
    top: '#376d82', bottom: '#77bdb2', paper: '#fffdf9', accent: '#f5aa5c', accent2: '#7bc9bd',
    ink: '#203f68', muted: '#60717c', soft: '#edf6f4', prayer: '#f8f8f1', darkHeader: true,
  }
}

function blessing(type: string): Blessing {
  if (type === 'death') {
    return {
      heading: 'تعازينا ودعاؤنا',
      primary: 'إنا لله وإنا إليه راجعون',
      secondary: 'أحسن الله عزاءكم، وغفر لميتكم ورحمه رحمة واسعة، وأسكنه فسيح جناته.',
    }
  }
  if (type === 'wedding') {
    return {
      heading: 'تهنئة ودعاء',
      primary: 'بارك الله لهما وبارك عليهما وجمع بينهما في خير.',
      secondary: 'نسأل الله أن يؤلف بين قلبيهما، ويرزقهما السعادة والمودة والذرية الصالحة.',
    }
  }
  if (type === 'birth') {
    return {
      heading: 'تهنئة بالمولود',
      primary: 'بارك الله لكم في الموهوب، وشكرتم الواهب، وبلغ أشده، ورزقتم بره.',
      secondary: 'نسأل الله أن يجعله قرة عين لوالديه، وأن ينشئه نشأة صالحة مباركة.',
    }
  }
  if (type === 'naming') {
    return {
      heading: 'دعاء وبركة',
      primary: 'بارك الله في المولود، وأنبته نباتًا حسنًا، وجعله من الصالحين.',
      secondary: 'نسأل الله أن يحفظه ويرزقه الصحة والعافية والبركة في العمر.',
    }
  }
  if (type === 'graduation') {
    return {
      heading: 'تهنئة بالنجاح',
      primary: 'بارك الله لكم في هذا النجاح، وزادكم علمًا نافعًا ورفعةً وتوفيقًا.',
      secondary: 'نسأل الله أن يفتح لكم أبواب الخير، ويجعل علمكم وعملكم نافعًا مباركًا.',
    }
  }
  if (type === 'general') {
    return {
      heading: 'دعاء بالمناسبة',
      primary: 'نسأل الله أن يبارك هذه المناسبة، وأن يديم الأفراح والمسرات.',
      secondary: 'وأن يجمع القلوب على الخير والمودة، ويكتب لكم فيها البركة والقبول.',
    }
  }
  return {
    heading: 'دعاء وبركة',
    primary: 'بارك الله لكم في هذه المناسبة، وجعلها فاتحة خير وبركة.',
    secondary: 'نسأل الله أن يتمها على خير، ويديم عليكم نعمه وفضله ومسراته.',
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number) {
  ctx.font = `${weight} ${size}px ${FONT_FAMILY}`
}

function wrapRtl(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width <= maxWidth || !line) line = test
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  const words = text.trim().split(/\s+/).filter(Boolean)
  while (words.length > 1 && ctx.measureText(`${words.join(' ')}…`).width > maxWidth) words.pop()
  const candidate = `${words.join(' ')}…`
  if (ctx.measureText(candidate).width <= maxWidth) return candidate
  let chars = text.trim()
  while (chars.length > 2 && ctx.measureText(`${chars}…`).width > maxWidth) chars = chars.slice(0, -1)
  return `${chars}…`
}

function fitWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  startSize: number,
  minSize: number,
  weight: number,
) {
  for (let size = startSize; size >= minSize; size -= 1) {
    setFont(ctx, weight, size)
    const lines = wrapRtl(ctx, text, maxWidth)
    if (lines.length <= maxLines) return { size, lines }
  }
  setFont(ctx, weight, minSize)
  const wrapped = wrapRtl(ctx, text, maxWidth)
  const lines = wrapped.slice(0, maxLines)
  if (wrapped.length > maxLines && lines.length) lines[lines.length - 1] = ellipsize(ctx, lines[lines.length - 1], maxWidth)
  return { size: minSize, lines }
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  right: number,
  startY: number,
  lineHeight: number,
) {
  let y = startY
  for (const line of lines) {
    ctx.fillText(line, right, y)
    y += lineHeight
  }
  return y
}

function drawHeaderRings(ctx: CanvasRenderingContext2D, t: Theme) {
  ctx.save()
  ctx.globalAlpha = t.darkHeader ? .13 : .23
  ctx.strokeStyle = t.darkHeader ? '#fff4e4' : t.accent
  ctx.lineWidth = 2
  const rings = [
    [92, 88, 48], [286, 92, 62], [452, 98, 78], [628, 86, 44], [802, 89, 61], [954, 92, 67],
  ]
  for (const [x, y, r] of rings) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r * .25, y - r * .25)
  ctx.lineTo(x + r, y)
  ctx.lineTo(x + r * .25, y + r * .25)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r * .25, y + r * .25)
  ctx.lineTo(x - r, y)
  ctx.lineTo(x - r * .25, y - r * .25)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawCrescent(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, cutout: string) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  ctx.arc(x + r * .42, y - r * .14, r * .78, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = cutout
  ctx.restore()
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, lineWidth = 4) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(x, y + size * .8)
  ctx.bezierCurveTo(x - size * 1.15, y + size * .15, x - size * .9, y - size * .75, x, y - size * .25)
  ctx.bezierCurveTo(x + size * .9, y - size * .75, x + size * 1.15, y + size * .15, x, y + size * .8)
  ctx.stroke()
  ctx.restore()
}

function drawLeafSprig(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, flip = false) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.globalAlpha = .55
  ctx.lineWidth = 2
  const dir = flip ? -1 : 1
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(x + 28 * dir, y - 22, x + 56 * dir, y - 8)
  ctx.stroke()
  for (let i = 1; i <= 3; i += 1) {
    const px = x + i * 15 * dir
    const py = y - i * 5
    ctx.beginPath()
    ctx.ellipse(px, py - 7, 8, 3.5, dir > 0 ? -.6 : .6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawLantern(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 3
  ctx.globalAlpha = .65
  ctx.beginPath(); ctx.moveTo(x, y - 38); ctx.lineTo(x, y - 16); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x - 15, y - 15); ctx.lineTo(x + 15, y - 15); ctx.lineTo(x + 20, y + 8); ctx.lineTo(x + 13, y + 34); ctx.lineTo(x - 13, y + 34); ctx.lineTo(x - 20, y + 8); ctx.closePath(); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x - 11, y - 14); ctx.lineTo(x - 7, y + 32); ctx.moveTo(x + 11, y - 14); ctx.lineTo(x + 7, y + 32); ctx.stroke()
  ctx.beginPath(); ctx.arc(x, y + 6, 5, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function drawGraduationCap(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 3
  ctx.globalAlpha = .72
  ctx.beginPath()
  ctx.moveTo(x - 34, y)
  ctx.lineTo(x, y - 18)
  ctx.lineTo(x + 34, y)
  ctx.lineTo(x, y + 18)
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x - 20, y + 9); ctx.quadraticCurveTo(x, y + 25, x + 20, y + 9); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + 34, y); ctx.lineTo(x + 34, y + 28); ctx.stroke()
  ctx.beginPath(); ctx.arc(x + 34, y + 32, 4, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function drawCornerPattern(ctx: CanvasRenderingContext2D, x: number, y: number, t: Theme, flipX = false) {
  ctx.save()
  ctx.globalAlpha = .14
  ctx.strokeStyle = t.accent
  ctx.lineWidth = 2
  const dir = flipX ? -1 : 1
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath()
    ctx.arc(x + i * 16 * dir, y + i * 11, 22 + i * 6, -.5, 1.3)
    ctx.stroke()
  }
  ctx.restore()
}

function drawEventOrnament(ctx: CanvasRenderingContext2D, type: string, x: number, y: number, t: Theme, background: string) {
  if (type === 'wedding') {
    drawHeart(ctx, x - 15, y, 18, t.accent2, 4)
    drawHeart(ctx, x + 15, y, 18, t.accent, 4)
    return
  }
  if (type === 'graduation') {
    drawGraduationCap(ctx, x, y, t.accent)
    return
  }
  if (type === 'death') {
    drawCrescent(ctx, x - 10, y, 18, t.accent2, background)
    drawSparkle(ctx, x + 22, y - 12, 8, t.accent)
    return
  }
  if (type === 'birth' || type === 'naming') {
    drawCrescent(ctx, x - 10, y, 18, t.accent2, background)
    drawSparkle(ctx, x + 24, y - 10, 9, t.accent)
    drawSparkle(ctx, x + 40, y + 9, 4, t.accent2)
    return
  }
  if (type === 'general') {
    drawLantern(ctx, x, y, t.accent)
    return
  }
  drawSparkle(ctx, x, y, 12, t.accent)
}

function drawMetaIcon(ctx: CanvasRenderingContext2D, kind: 'date' | 'location' | 'family', x: number, y: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2.6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (kind === 'date') {
    roundedRect(ctx, x - 15, y - 18, 30, 30, 6)
    ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x - 15, y - 8); ctx.lineTo(x + 15, y - 8); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x - 8, y - 23); ctx.lineTo(x - 8, y - 13); ctx.moveTo(x + 8, y - 23); ctx.lineTo(x + 8, y - 13); ctx.stroke()
    ctx.beginPath(); ctx.arc(x - 6, y + 1, 2, 0, Math.PI * 2); ctx.arc(x + 6, y + 1, 2, 0, Math.PI * 2); ctx.fill()
  } else if (kind === 'location') {
    ctx.beginPath(); ctx.arc(x, y - 7, 13, Math.PI * .1, Math.PI * .9, true); ctx.quadraticCurveTo(x, y + 23, x - 12.3, y - 3); ctx.stroke()
    ctx.beginPath(); ctx.arc(x, y - 7, 4, 0, Math.PI * 2); ctx.stroke()
  } else {
    ctx.beginPath(); ctx.moveTo(x - 16, y - 2); ctx.lineTo(x, y - 17); ctx.lineTo(x + 16, y - 2); ctx.stroke()
    roundedRect(ctx, x - 12, y - 2, 24, 20, 3); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x - 2, y + 18); ctx.lineTo(x - 2, y + 8); ctx.lineTo(x + 5, y + 8); ctx.lineTo(x + 5, y + 18); ctx.stroke()
  }
  ctx.restore()
}

async function loadBrandMark() {
  const image = new Image()
  image.src = `${import.meta.env.BASE_URL}brand/sila-mark.svg`
  try {
    await image.decode()
    return image
  } catch {
    return null
  }
}

function drawMetaRow(
  ctx: CanvasRenderingContext2D,
  kind: 'date' | 'location' | 'family',
  value: string,
  y: number,
  t: Theme,
  maxLines: number,
) {
  const iconX = 930
  const textRight = 884
  const maxWidth = 730
  const fitted = fitWrappedText(ctx, value, maxWidth, maxLines, 27, 22, 700)
  const lineHeight = fitted.size + 14
  drawMetaIcon(ctx, kind, iconX, y - 8, t.accent)
  ctx.fillStyle = '#526b7b'
  setFont(ctx, 700, fitted.size)
  const next = drawLines(ctx, fitted.lines, textRight, y, lineHeight)
  return next + 11
}

function drawPeople(
  ctx: CanvasRenderingContext2D,
  people: string[],
  y: number,
  maxBottom: number,
  t: Theme,
) {
  if (!people.length || y > maxBottom - 85) return y
  ctx.fillStyle = t.ink
  setFont(ctx, 800, 24)
  ctx.fillText('الأشخاص المرتبطون بالمناسبة', 930, y)
  drawLeafSprig(ctx, 330, y - 8, t.accent, false)
  y += 43

  const names = people.slice(0, 3)
  for (const name of names) {
    if (y > maxBottom - 38) break
    setFont(ctx, 700, 24)
    const line = ellipsize(ctx, `• ${name}`, 720)
    ctx.fillStyle = '#3d7897'
    ctx.fillText(line, 930, y)
    y += 39
  }
  return y + 7
}

function drawDescription(
  ctx: CanvasRenderingContext2D,
  description: string | null | undefined,
  y: number,
  maxBottom: number,
  t: Theme,
) {
  if (!description || y > maxBottom - 42) return y
  const available = Math.max(1, Math.min(2, Math.floor((maxBottom - y) / 37)))
  const fitted = fitWrappedText(ctx, description, 790, available, 24, 20, 500)
  ctx.fillStyle = t.muted
  setFont(ctx, 500, fitted.size)
  return drawLines(ctx, fitted.lines, 930, y, fitted.size + 13)
}

function drawPrayerBox(ctx: CanvasRenderingContext2D, type: string, t: Theme) {
  const b = blessing(type)
  const x = 128
  const y = 982
  const w = 824
  const h = 210

  roundedRect(ctx, x, y, w, h, 34)
  ctx.fillStyle = t.prayer
  ctx.fill()
  ctx.strokeStyle = `${t.accent2}80`
  ctx.lineWidth = 1.5
  ctx.stroke()

  drawCornerPattern(ctx, x + 25, y + 18, t, false)
  drawCornerPattern(ctx, x + w - 25, y + 18, t, true)
  drawLeafSprig(ctx, x + 78, y + h - 32, t.accent, false)
  drawLeafSprig(ctx, x + w - 78, y + h - 32, t.accent, true)

  drawEventOrnament(ctx, type, 540, y + 28, t, t.prayer)

  ctx.textAlign = 'center'
  ctx.fillStyle = t.accent
  setFont(ctx, 800, 17)
  ctx.fillText(b.heading, 540, y + 34)

  const primary = fitWrappedText(ctx, b.primary, 690, 2, 25, 21, 800)
  ctx.fillStyle = t.ink
  setFont(ctx, 800, primary.size)
  const primaryLineHeight = primary.size + 15
  let py = y + 82
  for (const line of primary.lines) {
    ctx.fillText(line, 540, py)
    py += primaryLineHeight
  }

  const secondary = fitWrappedText(ctx, b.secondary, 690, 2, 20, 17, 500)
  ctx.fillStyle = '#65747e'
  setFont(ctx, 500, secondary.size)
  let sy = Math.max(y + 143, py + 7)
  for (const line of secondary.lines) {
    if (sy > y + h - 22) break
    ctx.fillText(line, 540, sy)
    sy += secondary.size + 11
  }
  ctx.textAlign = 'right'
}

async function renderEventImage(event: EventShareData) {
  await document.fonts?.ready
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas-unavailable')

  ctx.direction = 'rtl'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  const t = theme(event.event_type)

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
  gradient.addColorStop(0, t.top)
  gradient.addColorStop(1, t.bottom)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  drawHeaderRings(ctx, t)

  const mark = await loadBrandMark()
  if (mark) ctx.drawImage(mark, 78, 48, 92, 92)

  ctx.fillStyle = t.darkHeader ? '#ffffff' : t.ink
  setFont(ctx, 800, 39)
  ctx.fillText('صلة', 982, 89)
  setFont(ctx, 500, 21)
  ctx.globalAlpha = .82
  ctx.fillText('البيت الرقمي للعائلة', 982, 128)
  ctx.globalAlpha = 1

  const cardX = 62
  const cardY = 204
  const cardW = 956
  const cardH = 1092
  roundedRect(ctx, cardX, cardY, cardW, cardH, 52)
  ctx.fillStyle = t.paper
  ctx.shadowColor = 'rgba(24,55,78,.16)'
  ctx.shadowBlur = 36
  ctx.shadowOffsetY = 18
  ctx.fill()
  ctx.shadowColor = 'transparent'

  drawCornerPattern(ctx, cardX + 30, cardY + 26, t, false)
  drawCornerPattern(ctx, cardX + cardW - 30, cardY + cardH - 86, t, true)

  if (event.event_type === 'general') {
    drawLantern(ctx, 137, 320, t.accent)
    drawSparkle(ctx, 192, 272, 9, t.accent2)
  } else if (event.event_type === 'wedding') {
    drawHeart(ctx, 142, 305, 17, t.accent2, 3)
    drawLeafSprig(ctx, 92, 338, t.accent, false)
  } else if (event.event_type === 'graduation') {
    drawGraduationCap(ctx, 142, 306, t.accent)
  } else if (event.event_type === 'birth' || event.event_type === 'naming') {
    drawCrescent(ctx, 135, 306, 17, t.accent2, t.paper)
    drawSparkle(ctx, 174, 286, 8, t.accent)
  } else if (event.event_type === 'death') {
    drawCrescent(ctx, 139, 304, 17, t.accent2, t.paper)
    drawSparkle(ctx, 176, 282, 7, t.accent)
  }

  const badgeLabel = labels[event.event_type] ?? 'مناسبة'
  setFont(ctx, 800, 24)
  const badgeWidth = Math.max(170, Math.min(245, ctx.measureText(badgeLabel).width + 78))
  const badgeX = 956 - badgeWidth
  roundedRect(ctx, badgeX, 257, badgeWidth, 66, 27)
  ctx.fillStyle = t.soft
  ctx.fill()
  ctx.fillStyle = t.accent
  ctx.fillText(badgeLabel, 925, 301)
  drawSparkle(ctx, badgeX + 30, 290, 7, t.accent2)

  const title = fitWrappedText(ctx, event.title, 810, 2, 44, 34, 900)
  ctx.fillStyle = t.ink
  setFont(ctx, 900, title.size)
  const titleLineHeight = title.size + 24
  let y = 405
  y = drawLines(ctx, title.lines, 930, y, titleLineHeight)

  const dividerY = Math.max(500, y + 3)
  ctx.strokeStyle = '#dce7e7'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(126, dividerY); ctx.lineTo(930, dividerY); ctx.stroke()
  drawSparkle(ctx, 540, dividerY, 7, t.accent)
  drawSparkle(ctx, 521, dividerY, 3, t.accent2)
  drawSparkle(ctx, 559, dividerY, 3, t.accent2)

  y = dividerY + 58
  y = drawMetaRow(ctx, 'date', formatDate(event.event_date), y, t, 1)
  if (event.location_name) y = drawMetaRow(ctx, 'location', event.location_name, y, t, 2)
  if (event.family_name) y = drawMetaRow(ctx, 'family', event.family_name, y, t, 1)

  y += 7
  y = drawPeople(ctx, (event.people ?? []).filter(Boolean), y, 905, t)
  y = drawDescription(ctx, event.description, y, 948, t)

  drawPrayerBox(ctx, event.event_type, t)

  ctx.strokeStyle = '#dfe7e5'
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(128, 1222); ctx.lineTo(952, 1222); ctx.stroke()
  drawLeafSprig(ctx, 286, 1261, t.accent, false)
  drawLeafSprig(ctx, 794, 1261, t.accent, true)
  ctx.fillStyle = '#78898f'
  setFont(ctx, 600, 20)
  ctx.textAlign = 'center'
  ctx.fillText('مشاركة من منصة صلة  •  sila family', 540, 1266)
  ctx.textAlign = 'right'

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('image-failed')), 'image/png', .96)
  })
}

export default function EventShareButton({ event, compact = false }: Props) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function share() {
    setBusy(true)
    setMessage('')
    try {
      const blob = await renderEventImage(event)
      const file = new File([blob], `sila-${event.event_type}-${event.id}.png`, { type: 'image/png' })
      const dua = blessing(event.event_type).primary
      const text = `${labels[event.event_type] ?? 'مناسبة'}: ${event.title}\n${formatDate(event.event_date)}${event.location_name ? `\n${event.location_name}` : ''}\n${dua}\n${window.location.href}`
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: event.title, text, files: [file] })
        setMessage('تم تجهيز الصورة للمشاركة.')
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = file.name
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
        setMessage('تم حفظ الصورة وفتح واتساب لإكمال المشاركة.')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') setMessage('تم إلغاء المشاركة.')
      else setMessage('تعذر إنشاء صورة المشاركة الآن.')
    } finally {
      setBusy(false)
    }
  }

  return <div className={`event-share-wrap ${compact ? 'compact' : ''}`}>
    <button className="event-share-button" type="button" disabled={busy} onClick={() => void share()} aria-label="مشاركة المناسبة كصورة للواتساب">
      <span aria-hidden="true">↗</span><b>{busy ? 'جارٍ تجهيز الصورة…' : compact ? 'مشاركة' : 'مشاركة كصورة'}</b><small>واتساب</small>
    </button>
    {message && !compact && <span className="event-share-message" role="status">{message}</span>}
  </div>
}
