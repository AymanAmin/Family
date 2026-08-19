import { mkdir, readFile, writeFile } from 'node:fs/promises'

const assetDir = new URL('./assets/', import.meta.url)
const iconDir = new URL('../public/icons/', import.meta.url)
const brandDir = new URL('../public/brand/', import.meta.url)

async function readBase64Asset(name) {
  const encoded = (await readFile(new URL(name, assetDir), 'utf8')).trim()
  return Buffer.from(encoded, 'base64')
}

await Promise.all([
  mkdir(iconDir, { recursive: true }),
  mkdir(brandDir, { recursive: true }),
])

const [icon192, icon512] = await Promise.all([
  readBase64Asset('sila-icon-gold-192.b64'),
  readBase64Asset('sila-icon-gold.b64'),
])

await Promise.all([
  writeFile(new URL('icon-gold-v3-192.png', iconDir), icon192),
  writeFile(new URL('icon-gold-v3-512.png', iconDir), icon512),
  writeFile(new URL('maskable-gold-v3-512.png', iconDir), icon512),
  writeFile(new URL('apple-touch-icon-gold-v3.png', iconDir), icon192),
  writeFile(new URL('sila-app-icon-gold-v3.png', brandDir), icon512),

  // Keep the legacy names generated too so existing installs and old shortcuts remain valid.
  writeFile(new URL('icon-192.png', iconDir), icon192),
  writeFile(new URL('icon-512.png', iconDir), icon512),
  writeFile(new URL('maskable-512.png', iconDir), icon512),
  writeFile(new URL('apple-touch-icon.png', iconDir), icon192),
  writeFile(new URL('sila-app-icon.png', brandDir), icon512),
])

console.log('Prepared cache-busted warm-gold Family branding for header, splash, PWA and install icons.')
