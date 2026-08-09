import { useMemo, useState } from 'react'
import '../household-profile-share.css'

type ShareChild = { name: string }
type ShareGroup = {
  spouseName: string | null
  children: ShareChild[]
  unassigned: boolean
}

type Props = {
  householdId: string
  householdName: string
  husbandName: string
  lineageName: string
  branchName: string
  spouseCount: number
  directChildrenCount: number
  descendantCount: number
  generationDepth: number
  groups: ShareGroup[]
}

const FONT_FAMILY = "'Noto Kufi Arabic', 'Noto Sans Arabic', Tahoma, Arial, sans-serif"

export function householdShareUrl(householdId: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set('household', householdId)
  url.hash = '#/home'
  return url.toString()
}

export function householdIdFromLocation(): string {
  return new URL(window.location.href).searchParams.get('household')?.trim() ?? ''
}

export function clearHouseholdShareParam(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('household')) return
  url.searchParams.delete('household')
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(window.history.state, document.title, next)
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number): void {
  ctx.font = `${weight} ${size}px ${FONT_FAMILY}`
}

function ellipsize(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (ctx.measureText(value).width <= maxWidth) return value
  let text = value.trim()
  while (text.length > 3 && ctx.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1)
  return `${text}…`
}

function wrapRtl(ctx: CanvasRenderingContext2D, value: string, maxWidth: number, maxLines = 2): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (!line || ctx.measureText(next).width <= maxWidth) line = next
    else {
      lines.push(line)
      line = word
      if (lines.length >= maxLines) break
    }
  }
  if (line && lines.length < maxLines) lines.push(line)
  if (words.length && lines.length === maxLines) {
    const joined = lines.join(' ')
    if (joined.length < value.trim().length) lines[maxLines - 1] = ellipsize(ctx, lines[maxLines - 1], maxWidth)
  }
  return lines
}

async function loadBrandMark(): Promise<HTMLImageElement | null> {
  const image = new Image()
  image.src = `${import.meta.env.BASE_URL}brand/sila-mark.svg`
  try {
    await image.decode()
    return image
  } catch {
    return null
  }
}

function drawStat(ctx: CanvasRenderingContext2D, x: number, y: number, value: number, label: string): void {
  roundedRect(ctx, x, y, 205, 112, 24)
  ctx.fillStyle = '#f4faf8'
  ctx.fill()
  ctx.strokeStyle = '#d8ebe5'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#245b70'
  setFont(ctx, 900, 32)
  ctx.fillText(String(value), x + 102.5, y + 47)
  ctx.fillStyle = '#718681'
  setFont(ctx, 700, 18)
  ctx.fillText(label, x + 102.5, y + 82)
  ctx.textAlign = 'right'
}

function drawSpouseGroup(ctx: CanvasRenderingContext2D, group: ShareGroup, index: number, x: number, y: number, width: number): number {
  const children = group.children.map((child) => child.name).filter(Boolean)
  const title = group.unassigned ? 'أبناء لم يُحدد الوالد الآخر لهم' : `${index + 1}. ${group.spouseName || 'الزوجة غير محددة'}`
  const height = children.length ? 150 : 116

  roundedRect(ctx, x, y, width, height, 26)
  ctx.fillStyle = group.unassigned ? '#fff9ed' : '#ffffff'
  ctx.fill()
  ctx.strokeStyle = group.unassigned ? '#ead9b7' : '#dce9e5'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = group.unassigned ? '#8b6c37' : '#2b5f57'
  setFont(ctx, 850, 23)
  ctx.fillText(ellipsize(ctx, title, width - 180), x + width - 34, y + 42)

  roundedRect(ctx, x + 26, y + 20, 115, 44, 18)
  ctx.fillStyle = group.unassigned ? '#f6e8c9' : '#e8f4f0'
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.fillStyle = group.unassigned ? '#866936' : '#3b6d63'
  setFont(ctx, 800, 16)
  ctx.fillText(`${children.length} أبناء`, x + 83.5, y + 49)
  ctx.textAlign = 'right'

  if (children.length) {
    ctx.fillStyle = '#70817d'
    setFont(ctx, 600, 18)
    const names = children.slice(0, 8).join(' · ')
    const suffix = children.length > 8 ? ` · +${children.length - 8}` : ''
    const lines = wrapRtl(ctx, `${names}${suffix}`, width - 68, 2)
    let lineY = y + 91
    for (const line of lines) {
      ctx.fillText(line, x + width - 34, lineY)
      lineY += 31
    }
  } else {
    ctx.fillStyle = '#98a6a2'
    setFont(ctx, 600, 17)
    ctx.fillText('لا يوجد أبناء مشتركون مسجلون', x + width - 34, y + 92)
  }

  return y + height + 16
}

async function renderHouseholdImage(props: Props, shareUrl: string): Promise<Blob> {
  await document.fonts?.ready
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas-unavailable')

  ctx.direction = 'rtl'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'

  const background = ctx.createLinearGradient(0, 0, 1080, 1350)
  background.addColorStop(0, '#183e67')
  background.addColorStop(.52, '#2f7185')
  background.addColorStop(1, '#63b9ad')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, 1080, 1350)

  ctx.save()
  ctx.globalAlpha = .12
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  for (const [x, y, r] of [[80, 80, 54], [280, 110, 78], [910, 100, 65], [1000, 270, 120], [80, 1120, 160]] as Array<[number, number, number]>) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.restore()

  const mark = await loadBrandMark()
  if (mark) ctx.drawImage(mark, 70, 48, 88, 88)

  ctx.fillStyle = '#ffffff'
  setFont(ctx, 900, 40)
  ctx.fillText('صلة', 985, 87)
  setFont(ctx, 500, 19)
  ctx.globalAlpha = .82
  ctx.fillText('البيت الرقمي للأسرة والنسب', 985, 122)
  ctx.globalAlpha = 1

  roundedRect(ctx, 48, 180, 984, 1100, 52)
  ctx.fillStyle = '#fffdf9'
  ctx.shadowColor = 'rgba(20,44,64,.22)'
  ctx.shadowBlur = 38
  ctx.shadowOffsetY = 16
  ctx.fill()
  ctx.shadowColor = 'transparent'

  roundedRect(ctx, 790, 232, 176, 48, 20)
  ctx.fillStyle = '#e4f3ee'
  ctx.fill()
  ctx.fillStyle = '#397267'
  setFont(ctx, 800, 18)
  ctx.fillText('ملف أسرة موثّق', 936, 264)

  ctx.fillStyle = '#203f68'
  setFont(ctx, 900, 43)
  const titleLines = wrapRtl(ctx, props.householdName, 840, 2)
  let titleY = 340
  for (const line of titleLines) {
    ctx.fillText(line, 950, titleY)
    titleY += 58
  }

  ctx.fillStyle = '#6e807b'
  setFont(ctx, 650, 20)
  const contextText = [props.lineageName, props.branchName].filter(Boolean).join(' · ') || 'النسب والفرع يتحدثان تلقائيًا عند اكتمال البيانات'
  ctx.fillText(ellipsize(ctx, contextText, 820), 950, Math.max(430, titleY + 8))

  const statsY = 478
  drawStat(ctx, 85, statsY, props.generationDepth, 'أجيال')
  drawStat(ctx, 310, statsY, props.descendantCount, 'من الذرية')
  drawStat(ctx, 535, statsY, props.directChildrenCount, 'أبناء')
  drawStat(ctx, 760, statsY, props.spouseCount, props.spouseCount === 1 ? 'زوجة' : 'زوجات')

  ctx.fillStyle = '#315950'
  setFont(ctx, 850, 24)
  ctx.fillText('تكوين الأسرة', 950, 635)
  ctx.fillStyle = '#869690'
  setFont(ctx, 600, 16)
  ctx.fillText('الزوجات والأبناء بحسب العلاقات المعتمدة', 950, 666)

  let y = 698
  const visibleGroups = props.groups.slice(0, 3)
  for (let i = 0; i < visibleGroups.length; i += 1) {
    y = drawSpouseGroup(ctx, visibleGroups[i], i, 85, y, 880)
    if (y > 1110) break
  }

  if (props.groups.length > visibleGroups.length && y < 1140) {
    ctx.fillStyle = '#6f827c'
    setFont(ctx, 700, 17)
    ctx.fillText(`+ ${props.groups.length - visibleGroups.length} أقسام أخرى داخل ملف الأسرة`, 950, y + 4)
  }

  ctx.strokeStyle = '#dce7e4'
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(90, 1187); ctx.lineTo(950, 1187); ctx.stroke()

  ctx.fillStyle = '#4a6b72'
  setFont(ctx, 700, 17)
  ctx.fillText('افتح الملف الكامل عبر الرابط:', 950, 1226)
  ctx.fillStyle = '#397d87'
  setFont(ctx, 600, 15)
  const readableUrl = shareUrl.replace(/^https?:\/\//, '')
  ctx.fillText(ellipsize(ctx, readableUrl, 790), 950, 1256)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#e7f6f2'
  setFont(ctx, 700, 17)
  ctx.fillText('مشاركة من منصة صلة  •  سجل الأسرة والنسب', 540, 1320)
  ctx.textAlign = 'right'

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('image-failed')), 'image/png', .96)
  })
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 80)
}

export default function HouseholdShareTools(props: Props) {
  const [busy, setBusy] = useState<'image' | 'link' | ''>('')
  const [message, setMessage] = useState('')
  const shareUrl = useMemo(() => householdShareUrl(props.householdId), [props.householdId])

  async function shareLink(): Promise<void> {
    setBusy('link')
    setMessage('')
    const text = `${props.householdName}\n${[props.lineageName, props.branchName].filter(Boolean).join(' · ')}`.trim()
    try {
      if (navigator.share) {
        await navigator.share({ title: props.householdName, text, url: shareUrl })
        setMessage('تم تجهيز رابط الأسرة للمشاركة.')
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl)
        setMessage('تم نسخ رابط الأسرة.')
      } else {
        setMessage(shareUrl)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') setMessage('تم إلغاء المشاركة.')
      else setMessage('تعذر مشاركة الرابط الآن.')
    } finally {
      setBusy('')
    }
  }

  async function shareImage(): Promise<void> {
    setBusy('image')
    setMessage('')
    try {
      const blob = await renderHouseholdImage(props, shareUrl)
      const file = new File([blob], `${safeFileName(props.householdName)}.png`, { type: 'image/png' })
      const text = `${props.householdName}\n${[props.lineageName, props.branchName].filter(Boolean).join(' · ')}\n${shareUrl}`
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: props.householdName, text, files: [file] })
        setMessage('تم تجهيز صورة الأسرة والرابط للمشاركة.')
      } else {
        const blobUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = file.name
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1200)
        try { await navigator.clipboard?.writeText(shareUrl) } catch { /* optional clipboard fallback */ }
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
        setMessage('تم حفظ الصورة ونسخ الرابط وفتح واتساب.')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') setMessage('تم إلغاء المشاركة.')
      else setMessage('تعذر إنشاء صورة الأسرة الآن.')
    } finally {
      setBusy('')
    }
  }

  return <section className="household-share-panel" aria-label="مشاركة ملف الأسرة">
    <div className="household-share-copy">
      <span>رابط خاص بهذه الأسرة</span>
      <strong>{props.householdName}</strong>
      <small>{shareUrl.replace(/^https?:\/\//, '')}</small>
    </div>
    <div className="household-share-actions">
      <button type="button" className="household-share-image" disabled={Boolean(busy)} onClick={() => void shareImage()}>
        <span aria-hidden="true">▣</span><b>{busy === 'image' ? 'جارٍ تجهيز الصورة…' : 'مشاركة كصورة'}</b><small>الصورة + الرابط</small>
      </button>
      <button type="button" className="household-share-link" disabled={Boolean(busy)} onClick={() => void shareLink()}>
        <span aria-hidden="true">↗</span><b>{busy === 'link' ? 'جارٍ المشاركة…' : 'مشاركة الرابط'}</b><small>فتح ملف الأسرة مباشرة</small>
      </button>
    </div>
    {message && <div className="household-share-message" role="status">{message}</div>}
  </section>
}
