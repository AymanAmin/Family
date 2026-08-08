import { useState } from 'react'
import { supabase } from '../lib/supabase'
import '../record-share.css'

type ShareEntity = 'people' | 'families'

type Props = {
  entityType: ShareEntity
  recordId: string
}

type KinshipRow = {
  related_person_id: string
  full_name: string
  gender: string | null
  relation_type: string
  relation_detail: string | null
  is_inferred: boolean
}

type SharePerson = {
  id: string
  full_name: string
  gender: string | null
  birth_year: number | null
  is_deceased: boolean
  death_date: string | null
  description: string | null
  family_id: string | null
  families?: { name?: string } | { name?: string }[] | null
}

type FamilyMember = {
  id: string
  full_name: string
  gender: string | null
  birth_year: number | null
  membershipType: string
  isPrimary: boolean
}

type ShareFamily = {
  id: string
  name: string
  origin_place: string | null
  description: string | null
}

const COLORS = {
  navy: '#17395f',
  blue: '#2e7394',
  teal: '#50b8b1',
  mint: '#e9f6f3',
  mintStrong: '#d7eee9',
  ink: '#183a5f',
  muted: '#718081',
  line: '#d9e6e3',
  white: '#ffffff',
  paper: '#f8fbfa',
  cream: '#fffaf3',
}

const relationOrder = [
  'parent', 'spouse', 'child', 'sibling',
  'grandparent', 'great_grandparent',
  'grandchild', 'great_grandchild',
  'paternal_uncle', 'paternal_aunt', 'maternal_uncle', 'maternal_aunt',
  'paternal_parent_sibling', 'maternal_parent_sibling', 'parent_sibling',
  'paternal_uncle_child', 'paternal_aunt_child', 'maternal_uncle_child', 'maternal_aunt_child',
  'cousin', 'nephew', 'niece', 'guardian', 'other',
]

const relationLabels: Record<string, string> = {
  parent: 'الوالدان',
  spouse: 'الزوج / الزوجة',
  child: 'الأبناء',
  sibling: 'الإخوة والأخوات',
  grandparent: 'الأجداد والجدات',
  great_grandparent: 'الأجداد الأعلى',
  grandchild: 'الأحفاد',
  great_grandchild: 'أبناء الأحفاد',
  paternal_uncle: 'الأعمام',
  paternal_aunt: 'العمات',
  maternal_uncle: 'الأخوال',
  maternal_aunt: 'الخالات',
  paternal_parent_sibling: 'إخوة وأخوات الأب',
  maternal_parent_sibling: 'إخوة وأخوات الأم',
  parent_sibling: 'إخوة وأخوات الوالدين',
  paternal_uncle_child: 'أبناء الأعمام',
  paternal_aunt_child: 'أبناء العمات',
  maternal_uncle_child: 'أبناء الأخوال',
  maternal_aunt_child: 'أبناء الخالات',
  cousin: 'أبناء العمومة والخؤولة',
  nephew: 'أبناء الإخوة',
  niece: 'بنات الإخوة والأخوات',
  guardian: 'الوصاية',
  other: 'صلات أخرى',
}

function familyName(value: SharePerson['families']) {
  if (!value) return ''
  return Array.isArray(value) ? value[0]?.name ?? '' : value.name ?? ''
}

function onePerson(value: unknown): { id?: string; full_name?: string; gender?: string | null; birth_year?: number | null; status?: string } | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] as any) ?? null : value as any
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string) {
  roundRect(ctx, x, y, width, height, radius)
  ctx.fillStyle = fill
  ctx.fill()
}

function strokeRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, stroke = COLORS.line) {
  roundRect(ctx, x, y, width, height, radius)
  ctx.strokeStyle = stroke
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color = COLORS.ink, align: CanvasTextAlign = 'right') {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, x, y)
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return [] as string[]
  const lines: string[] = []
  let current = words[0]
  for (let index = 1; index < words.length; index += 1) {
    const next = `${current} ${words[index]}`
    if (ctx.measureText(next).width <= maxWidth) current = next
    else {
      lines.push(current)
      current = words[index]
      if (lines.length === maxLines - 1) break
    }
  }
  if (lines.length < maxLines) lines.push(current)
  const consumed = lines.join(' ').split(/\s+/).length
  if (consumed < words.length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]}…`
  return lines
}

function formatDate(value: string | null) {
  if (!value) return 'غير محدد'
  try { return new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date(value)) } catch { return value }
}

function sanitizedFilePart(value: string) {
  return value.trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]+/gu, '').slice(0, 60) || 'record'
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('تعذر إنشاء الصورة.')), 'image/png', 0.96)
  })
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function recordShareUrl(entityType: ShareEntity, recordId: string) {
  const baseUrl = window.location.href.split('#')[0]
  const route = entityType === 'people' ? 'person' : 'family'
  return `${baseUrl}#/${route}/${encodeURIComponent(recordId)}`
}

function shareHeading(entityType: ShareEntity, title: string) {
  if (entityType === 'people') return `شجرة العائلة لـ ${title}`
  const familyTitle = title.trim().replace(/^(أسرة|عائلة)\s+/u, '')
  return `ملف أسرة ${familyTitle || title}`
}

async function shareFile(file: File, title: string, entityType: ShareEntity, recordUrl: string) {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  const heading = shareHeading(entityType, title)
  const text = `${heading}\nمن منصة صلة القرابة\nساهم معنا في استكمال الشجرة والملف بالمعلومات الموثوقة.\n${recordUrl}`
  if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [file] }))) {
    try {
      await nav.share({ title: heading, text, files: [file] })
      return 'shared' as const
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return 'cancelled' as const
    }
  }
  downloadFile(file)
  return 'downloaded' as const
}

function drawBrand(ctx: CanvasRenderingContext2D, width: number) {
  const right = width - 92
  const gradient = ctx.createLinearGradient(right - 120, 40, right, 150)
  gradient.addColorStop(0, COLORS.blue)
  gradient.addColorStop(1, COLORS.teal)
  fillRoundRect(ctx, right - 110, 54, 110, 110, 34, gradient as unknown as string)
  drawText(ctx, 'ص', right - 55, 132, '700 64px Arial', COLORS.white, 'center')
  drawText(ctx, 'صلة القرابة', right - 142, 102, '700 40px \"Noto Naskh Arabic\", \"Traditional Arabic\", Georgia, serif', COLORS.navy)
  drawText(ctx, 'سجل أهالي المنطقة', right - 142, 143, '400 24px Arial', COLORS.muted)
  drawText(ctx, 'بطاقة مشاركة موثقة من البيانات المنشورة', 92, 116, '400 22px Arial', COLORS.muted, 'left')
}

function drawFact(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, label: string, value: string) {
  fillRoundRect(ctx, x, y, width, 126, 30, COLORS.white)
  strokeRoundRect(ctx, x, y, width, 126, 30)
  drawText(ctx, label, x + width - 30, y + 43, '400 23px Arial', COLORS.muted)
  ctx.font = '700 30px Arial'
  const lines = wrapText(ctx, value, width - 60, 2)
  lines.forEach((line, index) => drawText(ctx, line, x + width - 30, y + 86 + index * 32, '700 30px Arial', COLORS.ink))
}

function sectionHeight(rows: number, columns = 2) {
  return 100 + Math.ceil(Math.max(rows, 1) / columns) * 94
}

function drawPeopleSection(ctx: CanvasRenderingContext2D, title: string, people: Array<{ full_name: string; relation_detail?: string | null }>, y: number, width: number) {
  const margin = 92
  const innerWidth = width - margin * 2
  const gap = 22
  const columns = 2
  const cardWidth = (innerWidth - gap) / columns
  const height = sectionHeight(people.length, columns)

  fillRoundRect(ctx, margin, y, innerWidth, height, 36, COLORS.white)
  strokeRoundRect(ctx, margin, y, innerWidth, height, 36)
  fillRoundRect(ctx, width - margin - 92, y + 28, 58, 58, 18, COLORS.mintStrong)
  drawText(ctx, String(people.length), width - margin - 63, y + 68, '700 24px Arial', COLORS.blue, 'center')
  drawText(ctx, title, width - margin - 118, y + 66, '700 31px Arial', COLORS.ink)

  people.forEach((person, index) => {
    const row = Math.floor(index / columns)
    const col = index % columns
    const x = margin + (columns - 1 - col) * (cardWidth + gap)
    const cardY = y + 94 + row * 94
    fillRoundRect(ctx, x, cardY, cardWidth, 72, 24, COLORS.paper)
    const avatarX = x + cardWidth - 48
    fillRoundRect(ctx, avatarX - 26, cardY + 10, 52, 52, 17, COLORS.mintStrong)
    drawText(ctx, person.full_name.trim().charAt(0) || '؟', avatarX, cardY + 47, '700 25px Arial', COLORS.blue, 'center')
    ctx.font = '700 24px Arial'
    const name = wrapText(ctx, person.full_name, cardWidth - 115, 1)[0] ?? person.full_name
    drawText(ctx, name, avatarX - 42, cardY + 36, '700 24px Arial', COLORS.ink)
    if (person.relation_detail) drawText(ctx, person.relation_detail, avatarX - 42, cardY + 61, '400 17px Arial', COLORS.muted)
  })

  return y + height + 24
}

async function loadPersonShare(recordId: string) {
  if (!supabase) throw new Error('الاتصال بقاعدة البيانات غير متاح.')
  const [personResult, kinshipResult] = await Promise.all([
    supabase.from('people')
      .select('id,full_name,gender,birth_year,is_deceased,death_date,description,family_id,families(name)')
      .eq('id', recordId).eq('status', 'approved').maybeSingle(),
    supabase.rpc('get_person_kinship', { p_person_id: recordId }),
  ])
  if (personResult.error || !personResult.data) throw new Error('لا يمكن مشاركة شخص غير معتمد أو غير متاح.')
  if (kinshipResult.error) throw kinshipResult.error
  return { person: personResult.data as SharePerson, kinship: (kinshipResult.data ?? []) as KinshipRow[] }
}

async function loadFamilyShare(recordId: string) {
  if (!supabase) throw new Error('الاتصال بقاعدة البيانات غير متاح.')
  const [familyResult, membershipResult, legacyPeopleResult] = await Promise.all([
    supabase.from('families').select('id,name,origin_place,description').eq('id', recordId).eq('status', 'approved').maybeSingle(),
    supabase.from('person_family_memberships')
      .select('person_id,membership_type,is_primary,people!inner(id,full_name,gender,birth_year,status)')
      .eq('family_id', recordId).eq('status', 'approved').eq('people.status', 'approved')
      .order('is_primary', { ascending: false }),
    supabase.from('people').select('id,full_name,gender,birth_year,status').eq('family_id', recordId).eq('status', 'approved').order('full_name'),
  ])
  if (familyResult.error || !familyResult.data) throw new Error('لا يمكن مشاركة عائلة غير معتمدة أو غير متاحة.')

  const members = new Map<string, FamilyMember>()
  for (const row of membershipResult.data ?? []) {
    const person = onePerson((row as any).people)
    if (!person?.id || !person.full_name || person.status !== 'approved') continue
    members.set(person.id, {
      id: person.id,
      full_name: person.full_name,
      gender: person.gender ?? null,
      birth_year: person.birth_year ?? null,
      membershipType: String((row as any).membership_type ?? 'other'),
      isPrimary: Boolean((row as any).is_primary),
    })
  }
  for (const person of legacyPeopleResult.data ?? []) {
    if (!members.has(person.id)) members.set(person.id, {
      id: person.id,
      full_name: person.full_name,
      gender: person.gender ?? null,
      birth_year: person.birth_year ?? null,
      membershipType: 'birth',
      isPrimary: true,
    })
  }

  return { family: familyResult.data as ShareFamily, members: [...members.values()] }
}

async function renderPersonCard(recordId: string) {
  const { person, kinship } = await loadPersonShare(recordId)
  const grouped = new Map<string, KinshipRow[]>()
  for (const row of kinship) {
    const current = grouped.get(row.relation_type) ?? []
    if (!current.some((item) => item.related_person_id === row.related_person_id)) current.push(row)
    grouped.set(row.relation_type, current)
  }
  const groupKeys = [...grouped.keys()].sort((a, b) => {
    const ai = relationOrder.indexOf(a); const bi = relationOrder.indexOf(b)
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi)
  })
  const bodyHeight = groupKeys.reduce((sum, key) => sum + sectionHeight(grouped.get(key)?.length ?? 0) + 24, 0)
  const width = 1400
  const height = Math.max(1900, 870 + bodyHeight + 160)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('تعذر تجهيز الصورة على هذا الجهاز.')
  ctx.direction = 'rtl'

  const bg = ctx.createLinearGradient(0, 0, width, height)
  bg.addColorStop(0, COLORS.cream)
  bg.addColorStop(0.45, COLORS.paper)
  bg.addColorStop(1, '#edf8f5')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)
  drawBrand(ctx, width)

  const margin = 92
  fillRoundRect(ctx, margin, 210, width - margin * 2, 330, 48, COLORS.white)
  strokeRoundRect(ctx, margin, 210, width - margin * 2, 330, 48)
  const avatarGradient = ctx.createLinearGradient(width - 320, 250, width - 190, 390)
  avatarGradient.addColorStop(0, COLORS.navy)
  avatarGradient.addColorStop(1, COLORS.teal)
  fillRoundRect(ctx, width - 314, 266, 142, 142, 44, avatarGradient as unknown as string)
  drawText(ctx, person.full_name.trim().charAt(0) || '؟', width - 243, 362, '700 66px Arial', COLORS.white, 'center')
  drawText(ctx, 'شجرة العائلة لـ', width - 350, 286, '600 24px Arial', COLORS.teal)
  drawText(ctx, person.full_name, width - 350, 350, '700 48px Arial', COLORS.navy)
  const description = person.description || 'لا توجد نبذة مضافة لهذا الشخص.'
  ctx.font = '400 25px Arial'
  wrapText(ctx, description, width - 610, 3).forEach((line, index) => drawText(ctx, line, width - 350, 398 + index * 34, '400 25px Arial', COLORS.muted))

  const factGap = 18
  const factWidth = (width - margin * 2 - factGap * 2) / 3
  const family = familyName(person.families) || 'غير محددة'
  drawFact(ctx, margin + (factWidth + factGap) * 2, 570, factWidth, 'العائلة الأساسية', family)
  drawFact(ctx, margin + factWidth + factGap, 570, factWidth, 'سنة الميلاد', person.birth_year ? String(person.birth_year) : 'غير محددة')
  drawFact(ctx, margin, 570, factWidth, 'الحالة', person.is_deceased ? `متوفى · ${formatDate(person.death_date)}` : 'على قيد الحياة')

  drawText(ctx, 'شجرة العائلة والقرابات', width - margin, 770, '700 39px Arial', COLORS.navy)
  drawText(ctx, `إجمالي الصلات الظاهرة: ${kinship.length}`, width - margin, 808, '400 22px Arial', COLORS.muted)

  let y = 840
  if (!groupKeys.length) {
    fillRoundRect(ctx, margin, y, width - margin * 2, 160, 36, COLORS.white)
    strokeRoundRect(ctx, margin, y, width - margin * 2, 160, 36)
    drawText(ctx, 'لا توجد علاقات عائلية منشورة لهذا الشخص حتى الآن.', width - margin - 38, y + 92, '600 28px Arial', COLORS.muted)
    y += 184
  } else {
    for (const key of groupKeys) y = drawPeopleSection(ctx, relationLabels[key] || key, grouped.get(key) ?? [], y, width)
  }

  drawText(ctx, 'ساهم معنا في استكمال الشجرة والملف بإضافة المعلومات الموثوقة.', width / 2, height - 122, 'italic 600 22px Arial', COLORS.blue, 'center')
  drawText(ctx, 'صلة القرابة · تم إنشاء الصورة من البيانات المعتمدة في الدليل', width / 2, height - 78, '400 21px Arial', COLORS.muted, 'center')
  drawText(ctx, new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date()), width / 2, height - 45, '400 18px Arial', COLORS.muted, 'center')
  return { canvas, title: person.full_name, filename: `صلة-الشخص-${sanitizedFilePart(person.full_name)}.png` }
}

async function renderFamilyCard(recordId: string) {
  const { family, members } = await loadFamilyShare(recordId)
  members.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.full_name.localeCompare(b.full_name, 'ar'))
  const width = 1400
  const columns = members.length > 24 ? 3 : 2
  const memberRows = Math.ceil(Math.max(members.length, 1) / columns)
  const membersHeight = 120 + memberRows * 94
  const height = Math.max(1700, 900 + membersHeight + 150)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('تعذر تجهيز الصورة على هذا الجهاز.')
  ctx.direction = 'rtl'

  const bg = ctx.createLinearGradient(0, 0, width, height)
  bg.addColorStop(0, COLORS.cream)
  bg.addColorStop(0.48, COLORS.paper)
  bg.addColorStop(1, '#edf8f5')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)
  drawBrand(ctx, width)

  const margin = 92
  fillRoundRect(ctx, margin, 210, width - margin * 2, 350, 48, COLORS.white)
  strokeRoundRect(ctx, margin, 210, width - margin * 2, 350, 48)
  const avatarGradient = ctx.createLinearGradient(width - 320, 250, width - 190, 390)
  avatarGradient.addColorStop(0, COLORS.navy)
  avatarGradient.addColorStop(1, COLORS.teal)
  fillRoundRect(ctx, width - 314, 274, 142, 142, 44, avatarGradient as unknown as string)
  drawText(ctx, 'ع', width - 243, 368, '700 60px Arial', COLORS.white, 'center')
  drawText(ctx, 'ملف أسرة', width - 350, 288, '600 24px Arial', COLORS.teal)
  drawText(ctx, family.name, width - 350, 354, '700 48px Arial', COLORS.navy)
  ctx.font = '400 25px Arial'
  wrapText(ctx, family.description || 'لا توجد نبذة مضافة لهذه العائلة حتى الآن.', width - 610, 3).forEach((line, index) => drawText(ctx, line, width - 350, 405 + index * 34, '400 25px Arial', COLORS.muted))

  const factGap = 18
  const factWidth = (width - margin * 2 - factGap) / 2
  drawFact(ctx, margin + factWidth + factGap, 590, factWidth, 'مكان الأصل', family.origin_place || 'غير محدد')
  drawFact(ctx, margin, 590, factWidth, 'عدد الأفراد المعتمدين', String(members.length))

  drawText(ctx, 'أفراد العائلة', width - margin, 790, '700 39px Arial', COLORS.navy)
  drawText(ctx, 'الأسماء المنشورة والمعتمدة فقط', width - margin, 828, '400 22px Arial', COLORS.muted)

  const innerWidth = width - margin * 2
  const gap = 18
  const cardWidth = (innerWidth - gap * (columns - 1)) / columns
  const sectionY = 858
  fillRoundRect(ctx, margin, sectionY, innerWidth, membersHeight, 38, COLORS.white)
  strokeRoundRect(ctx, margin, sectionY, innerWidth, membersHeight, 38)

  if (!members.length) {
    drawText(ctx, 'لا يوجد أفراد معتمدون مرتبطون بهذه العائلة حتى الآن.', width - margin - 38, sectionY + 100, '600 28px Arial', COLORS.muted)
  } else members.forEach((member, index) => {
    const row = Math.floor(index / columns)
    const col = index % columns
    const x = margin + (columns - 1 - col) * (cardWidth + gap)
    const y = sectionY + 44 + row * 94
    fillRoundRect(ctx, x, y, cardWidth, 72, 22, member.isPrimary ? COLORS.mint : COLORS.paper)
    const avatarX = x + cardWidth - 46
    fillRoundRect(ctx, avatarX - 25, y + 11, 50, 50, 16, COLORS.mintStrong)
    drawText(ctx, member.full_name.trim().charAt(0) || '؟', avatarX, y + 47, '700 24px Arial', COLORS.blue, 'center')
    ctx.font = '700 22px Arial'
    const name = wrapText(ctx, member.full_name, cardWidth - 108, 1)[0] ?? member.full_name
    drawText(ctx, name, avatarX - 38, y + 35, '700 22px Arial', COLORS.ink)
    const meta = [member.isPrimary ? 'عائلة أساسية' : '', member.birth_year ? String(member.birth_year) : ''].filter(Boolean).join(' · ')
    if (meta) drawText(ctx, meta, avatarX - 38, y + 60, '400 16px Arial', COLORS.muted)
  })

  drawText(ctx, 'ساهم معنا في استكمال الشجرة والملف بإضافة المعلومات الموثوقة.', width / 2, height - 122, 'italic 600 22px Arial', COLORS.blue, 'center')
  drawText(ctx, 'صلة القرابة · تم إنشاء الصورة من البيانات المعتمدة في الدليل', width / 2, height - 78, '400 21px Arial', COLORS.muted, 'center')
  drawText(ctx, new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date()), width / 2, height - 45, '400 18px Arial', COLORS.muted, 'center')
  return { canvas, title: family.name, filename: `صلة-العائلة-${sanitizedFilePart(family.name)}.png` }
}

export default function RecordShareButton({ entityType, recordId }: Props) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function generateAndShare() {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      if (typeof document !== 'undefined' && 'fonts' in document) await document.fonts.ready
      const result = entityType === 'people' ? await renderPersonCard(recordId) : await renderFamilyCard(recordId)
      const blob = await canvasBlob(result.canvas)
      const file = new File([blob], result.filename, { type: 'image/png' })
      const action = await shareFile(file, result.title, entityType, recordShareUrl(entityType, recordId))
      if (action === 'downloaded') setMessage('تم حفظ الصورة ويمكنك مشاركتها من الجهاز.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر إنشاء صورة المشاركة.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="record-share-wrap">
      <button className="record-share-trigger" type="button" disabled={busy} onClick={() => void generateAndShare()}>
        <span className="record-share-icon" aria-hidden="true">↗</span>
        <span>{busy ? 'جارٍ إنشاء الصورة…' : entityType === 'people' ? 'مشاركة الشخص' : 'مشاركة العائلة'}</span>
      </button>
      {message && <small className="record-share-message" role="status">{message}</small>}
    </div>
  )
}
