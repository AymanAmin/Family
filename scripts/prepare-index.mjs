import { readFile, writeFile } from 'node:fs/promises'

const template = await readFile('index.dev.html', 'utf8')
const approvedLogoBase64 = (await readFile('scripts/assets/sila-approved-final-256.jpg.b64', 'utf8')).trim()
const approvedLogoDataUri = `data:image/jpeg;base64,${approvedLogoBase64}`
const output = template.replaceAll('__SILA_APPROVED_LOGO_DATA_URI__', approvedLogoDataUri)

if (output.includes('__SILA_APPROVED_LOGO_DATA_URI__')) {
  throw new Error('Approved logo placeholder was not fully replaced.')
}

await writeFile('index.html', output, 'utf8')
console.log('Prepared index.html with exact approved Family logo.')
