import { readFile, writeFile } from 'node:fs/promises'

const template = await readFile('index.dev.html', 'utf8')
const logoBase64 = (await readFile('scripts/assets/sila-approved-v4-512.jpg.b64', 'utf8')).trim()

if (!logoBase64.startsWith('/9j/')) {
  throw new Error('Approved Sila logo asset is not a valid JPEG base64 source.')
}

const logoDataUri = `data:image/jpeg;base64,${logoBase64}`
const html = template.replace('__SILA_APPROVED_LOGO_DATA_URI__', logoDataUri)

if (html === template) {
  throw new Error('Approved Sila logo placeholder was not found in index.dev.html.')
}

await writeFile('index.html', html, 'utf8')
console.log('Prepared index.html with the approved Sila logo embedded directly in the splash screen.')
