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

await Promise.all([
  mkdir(iconDir, { recursive: true }),
  mkdir(brandDir, { recursive: true }),
])

const [approved192Base64, approved512Base64, legacy192, legacy512] = await Promise.all([
  readBase64Text('sila-approved-v4-192.jpg.b64'),
  readBase64Text('sila-approved-v4-512.jpg.b64'),
  readBase64Asset('sila-icon-gold-192.b64'),
  readBase64Asset('sila-icon-gold.b64'),
])

const approved192 = Buffer.from(approved192Base64, 'base64')
const approved512 = Buffer.from(approved512Base64, 'base64')
const approvedMarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title desc">
  <title id="title">شعار صلة القرابة</title>
  <desc id="desc">الشعار الذهبي المعتمد لتطبيق صلة القرابة</desc>
  <image width="512" height="512" href="data:image/jpeg;base64,${approved512Base64}" preserveAspectRatio="xMidYMid meet" />
</svg>\n`

await Promise.all([
  // One approved artwork source for the system, splash, PWA and share images.
  writeFile(new URL('sila-approved-v4.jpg', brandDir), approved512),
  writeFile(new URL('sila-mark.svg', brandDir), approvedMarkSvg, 'utf8'),
  writeFile(new URL('icon-approved-v4-192.jpg', iconDir), approved192),
  writeFile(new URL('icon-approved-v4-512.jpg', iconDir), approved512),
  writeFile(new URL('maskable-approved-v4-512.jpg', iconDir), approved512),
  writeFile(new URL('apple-touch-icon-approved-v4.jpg', iconDir), approved192),

  // Keep old binary names only for backward compatibility; new UI never references them.
  writeFile(new URL('icon-192.png', iconDir), legacy192),
  writeFile(new URL('icon-512.png', iconDir), legacy512),
  writeFile(new URL('maskable-512.png', iconDir), legacy512),
  writeFile(new URL('apple-touch-icon.png', iconDir), legacy192),
  writeFile(new URL('sila-app-icon.png', brandDir), legacy512),
])

console.log('Prepared one approved Family brand source for all current UI surfaces.')
