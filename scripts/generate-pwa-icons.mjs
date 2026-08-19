import { mkdir, readFile, writeFile } from 'node:fs/promises'

const assetDir = new URL('./assets/', import.meta.url)
const iconDir = new URL('../public/icons/', import.meta.url)
const brandDir = new URL('../public/brand/', import.meta.url)

async function readBase64Text(name) {
  return (await readFile(new URL(name, assetDir), 'utf8')).trim()
}

async function readBase64Asset(name) {
  return Buffer.from(await readBase64Text(name), 'base64')
}

async function readChunkedBase64(prefix, count) {
  const parts = await Promise.all(
    Array.from({ length: count }, (_, index) => readBase64Text(`${prefix}.part${index + 1}.b64`)),
  )
  return parts.join('')
}

await Promise.all([
  mkdir(iconDir, { recursive: true }),
  mkdir(brandDir, { recursive: true }),
])

const [approved192Base64, approved512Base64, exactSystemLogoBase64, legacy192, legacy512] = await Promise.all([
  readBase64Text('sila-approved-v4-192.jpg.b64'),
  readBase64Text('sila-approved-v4-512.jpg.b64'),
  readChunkedBase64('sila-approved-gold-320', 5),
  readBase64Asset('sila-icon-gold-192.b64'),
  readBase64Asset('sila-icon-gold.b64'),
])

const approved192 = Buffer.from(approved192Base64, 'base64')
const approved512 = Buffer.from(approved512Base64, 'base64')
const exactSystemLogo = Buffer.from(exactSystemLogoBase64, 'base64')

if (exactSystemLogo.length < 14000) {
  throw new Error(`Approved system logo is unexpectedly small: ${exactSystemLogo.length} bytes`)
}

const exactSystemLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-labelledby="title desc">
  <title id="title">شعار صلة القرابة</title>
  <desc id="desc">الشعار الذهبي المعتمد لتطبيق صلة القرابة</desc>
  <image width="320" height="320" href="data:image/jpeg;base64,${exactSystemLogoBase64}" preserveAspectRatio="xMidYMid meet" />
</svg>\n`

await Promise.all([
  // Header and splash use this verified artwork only.
  writeFile(new URL('sila-approved-v4.jpg', brandDir), exactSystemLogo),
  writeFile(new URL('sila-mark.svg', brandDir), exactSystemLogoSvg, 'utf8'),

  // PWA files remain independent from the in-system logo source.
  writeFile(new URL('icon-approved-v4-192.jpg', iconDir), approved192),
  writeFile(new URL('icon-approved-v4-512.jpg', iconDir), approved512),
  writeFile(new URL('maskable-approved-v4-512.jpg', iconDir), approved512),
  writeFile(new URL('apple-touch-icon-approved-v4.jpg', iconDir), approved192),

  // Backward compatibility only.
  writeFile(new URL('icon-192.png', iconDir), legacy192),
  writeFile(new URL('icon-512.png', iconDir), legacy512),
  writeFile(new URL('maskable-512.png', iconDir), legacy512),
  writeFile(new URL('apple-touch-icon.png', iconDir), legacy192),
  writeFile(new URL('sila-app-icon.png', brandDir), legacy512),
])

console.log(`Prepared verified in-system Family logo (${exactSystemLogo.length} bytes).`)
