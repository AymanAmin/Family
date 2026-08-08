import fs from 'node:fs'

const path = 'src/components/RecordShareButton.tsx'
let source = fs.readFileSync(path, 'utf8')

const oldShareFile = `async function shareFile(file: File, title: string) {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [file] }))) {
    try {
      await nav.share({ title, text: 'من منصة صلة القرابة', files: [file] })
      return 'shared' as const
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return 'cancelled' as const
    }
  }
  downloadFile(file)
  return 'downloaded' as const
}`

const newShareFile = `function recordShareUrl(entityType: ShareEntity, recordId: string) {
  const baseUrl = window.location.href.split('#')[0]
  const route = entityType === 'people' ? 'person' : 'family'
  return \`${'${baseUrl}'}#/${'${route}'}/${'${encodeURIComponent(recordId)}'}\`
}

async function shareFile(file: File, title: string, recordUrl: string) {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  const text = \`من منصة صلة القرابة\\n${'${recordUrl}'}\`
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
}`

if (!source.includes('function recordShareUrl(entityType: ShareEntity, recordId: string)')) {
  if (!source.includes(oldShareFile)) throw new Error('Could not find shareFile block.')
  source = source.replace(oldShareFile, newShareFile)
}

const oldCall = `      const action = await shareFile(file, result.title)`
const newCall = `      const action = await shareFile(file, result.title, recordShareUrl(entityType, recordId))`
if (!source.includes(newCall)) {
  if (!source.includes(oldCall)) throw new Error('Could not find shareFile call.')
  source = source.replace(oldCall, newCall)
}

fs.writeFileSync(path, source)
console.log('Record sharing now includes the direct profile URL in shared text.')
