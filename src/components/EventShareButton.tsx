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

const labels: Record<string, string> = {
  death: 'وفاة وعزاء', wedding: 'زواج', birth: 'مولود', naming: 'سماية', graduation: 'تخرج ونجاح', general: 'خبر عائلي', other: 'مناسبة',
}

const glyphs: Record<string, string> = { death: '✦', wedding: '♡', birth: '☆', naming: '◌', graduation: '◇', general: '◈', other: '•' }

function formatDate(value?: string | null) {
  if (!value) return 'التاريخ غير محدد'
  return new Intl.DateTimeFormat('ar-SA', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
}

function palette(type: string) {
  if (type === 'death') return { top: '#203f68', bottom: '#2c5a82', paper: '#fffdf9', accent: '#7bc9bd', ink: '#203f68', soft: '#edf5f4' }
  if (type === 'wedding') return { top: '#f8efe6', bottom: '#fffdf9', paper: '#ffffff', accent: '#ef7a50', ink: '#203f68', soft: '#f9e5d5' }
  if (type === 'birth' || type === 'naming') return { top: '#dff2ee', bottom: '#fffdf9', paper: '#ffffff', accent: '#3d7897', ink: '#203f68', soft: '#eaf6f3' }
  return { top: '#244a78', bottom: '#66b9b1', paper: '#fffdf9', accent: '#f5aa5c', ink: '#203f68', soft: '#edf6f4' }
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

function wrapRtl(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width <= maxWidth || !line) line = test
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  return lines
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

async function renderEventImage(event: EventShareData) {
  await document.fonts?.ready
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas-unavailable')
  ctx.direction = 'rtl'
  ctx.textAlign = 'right'
  const p = palette(event.event_type)

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
  gradient.addColorStop(0, p.top)
  gradient.addColorStop(1, p.bottom)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.globalAlpha = .15
  ctx.strokeStyle = p.accent
  ctx.lineWidth = 3
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath()
    ctx.arc(120 + i * 168, 112, 48 + (i % 3) * 16, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  const darkBackground = ['death', 'general', 'other', 'graduation'].includes(event.event_type)
  const mark = await loadBrandMark()
  if (mark) ctx.drawImage(mark, 84, 62, 104, 104)
  ctx.textAlign = 'right'
  ctx.fillStyle = darkBackground ? '#ffffff' : p.ink
  ctx.font = "800 42px 'Noto Kufi Arabic', sans-serif"
  ctx.fillText('صلة', 996, 108)
  ctx.font = "500 24px 'Noto Kufi Arabic', sans-serif"
  ctx.globalAlpha = .82
  ctx.fillText('البيت الرقمي للعائلة', 996, 151)
  ctx.globalAlpha = 1

  roundedRect(ctx, 64, 222, 952, 1010, 54)
  ctx.fillStyle = p.paper
  ctx.shadowColor = 'rgba(24,55,78,.18)'
  ctx.shadowBlur = 36
  ctx.shadowOffsetY = 18
  ctx.fill()
  ctx.shadowColor = 'transparent'

  roundedRect(ctx, 768, 278, 188, 72, 28)
  ctx.fillStyle = p.soft
  ctx.fill()
  ctx.fillStyle = p.accent
  ctx.font = "800 27px 'Noto Kufi Arabic', sans-serif"
  ctx.fillText(`${glyphs[event.event_type] ?? '•'}  ${labels[event.event_type] ?? 'مناسبة'}`, 930, 326)

  ctx.fillStyle = p.ink
  ctx.font = "900 53px 'Noto Kufi Arabic', sans-serif"
  const titleLines = wrapRtl(ctx, event.title, 820).slice(0, 3)
  let y = 430
  titleLines.forEach((line) => { ctx.fillText(line, 930, y); y += 82 })

  ctx.strokeStyle = '#dce7e7'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(126, y + 10); ctx.lineTo(930, y + 10); ctx.stroke()
  y += 76

  const meta: Array<[string, string]> = [
    ['◷', formatDate(event.event_date)],
    ...(event.location_name ? [['⌖', event.location_name] as [string, string]] : []),
    ...(event.family_name ? [['⌂', event.family_name] as [string, string]] : []),
  ]
  ctx.font = "700 30px 'Noto Kufi Arabic', sans-serif"
  for (const [icon, value] of meta) {
    ctx.fillStyle = p.accent
    ctx.fillText(icon, 930, y)
    ctx.fillStyle = '#526b7b'
    ctx.fillText(value, 870, y)
    y += 58
  }

  const people = (event.people ?? []).filter(Boolean).slice(0, 3)
  if (people.length) {
    y += 10
    ctx.fillStyle = p.ink
    ctx.font = "800 27px 'Noto Kufi Arabic', sans-serif"
    ctx.fillText('الأشخاص المرتبطون بالمناسبة', 930, y)
    y += 50
    ctx.font = "700 27px 'Noto Kufi Arabic', sans-serif"
    people.forEach((name) => { ctx.fillStyle = '#3d7897'; ctx.fillText(`• ${name}`, 930, y); y += 48 })
  }

  if (event.description && y < 1020) {
    y += 18
    ctx.fillStyle = '#6b7e87'
    ctx.font = "500 28px 'Noto Kufi Arabic', sans-serif"
    const descLines = wrapRtl(ctx, event.description, 800).slice(0, 4)
    descLines.forEach((line) => { ctx.fillText(line, 930, y); y += 50 })
  }

  roundedRect(ctx, 126, 1120, 804, 2, 1)
  ctx.fillStyle = '#e2e9e8'
  ctx.fill()
  ctx.fillStyle = '#78898f'
  ctx.font = "600 23px 'Noto Kufi Arabic', sans-serif"
  ctx.fillText('مشاركة من منصة صلة · sila family', 930, 1175)

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('image-failed')), 'image/png', .96))
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
      const text = `${labels[event.event_type] ?? 'مناسبة'}: ${event.title}\n${formatDate(event.event_date)}${event.location_name ? `\n${event.location_name}` : ''}\n${window.location.href}`
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
