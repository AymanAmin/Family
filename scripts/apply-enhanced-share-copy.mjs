import fs from 'node:fs'

const path = 'src/components/RecordShareButton.tsx'
let source = fs.readFileSync(path, 'utf8')

function replaceOnce(from, to, label) {
  if (source.includes(to)) return
  if (!source.includes(from)) throw new Error(`Could not find ${label}.`)
  source = source.replace(from, to)
}

replaceOnce(
  "  drawText(ctx, 'صلة القرابة', right - 142, 102, '700 36px Arial', COLORS.navy)",
  "  drawText(ctx, 'صلة القرابة', right - 142, 102, '700 40px \\\"Noto Naskh Arabic\\\", \\\"Traditional Arabic\\\", Georgia, serif', COLORS.navy)",
  'brand title font',
)

replaceOnce(
`async function shareFile(file: File, title: string, recordUrl: string) {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  const text = \`من منصة صلة القرابة\\n\${recordUrl}\`
  if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [file] }))) {
    try {
      await nav.share({ title, text, files: [file] })
      return 'shared' as const
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return 'cancelled' as const
    }
  }
  downloadFile(file)
  return 'downloaded' as const
}`,
`function shareHeading(entityType: ShareEntity, title: string) {
  if (entityType === 'people') return \`شجرة العائلة لـ \${title}\`
  const familyTitle = title.trim().replace(/^(أسرة|عائلة)\\s+/u, '')
  return \`ملف أسرة \${familyTitle || title}\`
}

async function shareFile(file: File, title: string, entityType: ShareEntity, recordUrl: string) {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  const heading = shareHeading(entityType, title)
  const text = \`\${heading}\\nمن منصة صلة القرابة\\nساهم معنا في استكمال الشجرة والملف بالمعلومات الموثوقة.\\n\${recordUrl}\`
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
}`,
  'shareFile block',
)

replaceOnce(
  "  drawText(ctx, 'ملف شخص · بطاقة مشاركة', width - 350, 286, '600 24px Arial', COLORS.teal)",
  "  drawText(ctx, 'شجرة العائلة لـ', width - 350, 286, '600 24px Arial', COLORS.teal)",
  'person share heading',
)

replaceOnce(
`  drawText(ctx, 'صلة القرابة · تم إنشاء الصورة من البيانات المعتمدة في الدليل', width / 2, height - 78, '400 21px Arial', COLORS.muted, 'center')
  drawText(ctx, new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date()), width / 2, height - 45, '400 18px Arial', COLORS.muted, 'center')
  return { canvas, title: person.full_name, filename: \`صلة-الشخص-\${sanitizedFilePart(person.full_name)}.png\` }`,
`  drawText(ctx, 'ساهم معنا في استكمال الشجرة والملف بإضافة المعلومات الموثوقة.', width / 2, height - 122, 'italic 600 22px Arial', COLORS.blue, 'center')
  drawText(ctx, 'صلة القرابة · تم إنشاء الصورة من البيانات المعتمدة في الدليل', width / 2, height - 78, '400 21px Arial', COLORS.muted, 'center')
  drawText(ctx, new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date()), width / 2, height - 45, '400 18px Arial', COLORS.muted, 'center')
  return { canvas, title: person.full_name, filename: \`صلة-الشخص-\${sanitizedFilePart(person.full_name)}.png\` }`,
  'person awareness footer',
)

replaceOnce(
  "  drawText(ctx, 'ملف العائلة · بطاقة مشاركة', width - 350, 288, '600 24px Arial', COLORS.teal)",
  "  drawText(ctx, 'ملف أسرة', width - 350, 288, '600 24px Arial', COLORS.teal)",
  'family share heading',
)

replaceOnce(
`  drawText(ctx, 'صلة القرابة · تم إنشاء الصورة من البيانات المعتمدة في الدليل', width / 2, height - 78, '400 21px Arial', COLORS.muted, 'center')
  drawText(ctx, new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date()), width / 2, height - 45, '400 18px Arial', COLORS.muted, 'center')
  return { canvas, title: family.name, filename: \`صلة-العائلة-\${sanitizedFilePart(family.name)}.png\` }`,
`  drawText(ctx, 'ساهم معنا في استكمال الشجرة والملف بإضافة المعلومات الموثوقة.', width / 2, height - 122, 'italic 600 22px Arial', COLORS.blue, 'center')
  drawText(ctx, 'صلة القرابة · تم إنشاء الصورة من البيانات المعتمدة في الدليل', width / 2, height - 78, '400 21px Arial', COLORS.muted, 'center')
  drawText(ctx, new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date()), width / 2, height - 45, '400 18px Arial', COLORS.muted, 'center')
  return { canvas, title: family.name, filename: \`صلة-العائلة-\${sanitizedFilePart(family.name)}.png\` }`,
  'family awareness footer',
)

replaceOnce(
  '      const action = await shareFile(file, result.title, recordShareUrl(entityType, recordId))',
  '      const action = await shareFile(file, result.title, entityType, recordShareUrl(entityType, recordId))',
  'shareFile call',
)

fs.writeFileSync(path, source)
console.log('Enhanced share headings, brand typography, and awareness copy applied.')
