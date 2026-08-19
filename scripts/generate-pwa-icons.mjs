import { mkdir, readFile, writeFile } from 'node:fs/promises'

const assetDir = new URL('./assets/', import.meta.url)
const iconDir = new URL('../public/icons/', import.meta.url)
const brandDir = new URL('../public/brand/', import.meta.url)

async function readBase64Asset(url) {
  const encoded = (await readFile(url, 'utf8')).trim()
  return Buffer.from(encoded, 'base64')
}

await Promise.all([
  mkdir(iconDir, { recursive: true }),
  mkdir(brandDir, { recursive: true }),
])

const [approved192, approved512, legacy192, legacy512] = await Promise.all([
  readBase64Asset(new URL('sila-approved-v4-192.jpg.b64', assetDir)),
  readBase64Asset(new URL('sila-approved-v4-512.jpg.b64', assetDir)),
  readBase64Asset(new URL('sila-icon-gold-192.b64', assetDir)),
  readBase64Asset(new URL('sila-icon-gold.b64', assetDir)),
])

await Promise.all([
  // Approved artwork is generated from one stable source under scripts/assets.
  writeFile(new URL('sila-approved-v4.jpg', brandDir), approved512),
  writeFile(new URL('icon-approved-v4-192.jpg', iconDir), approved192),
  writeFile(new URL('icon-approved-v4-512.jpg', iconDir), approved512),
  writeFile(new URL('maskable-approved-v4-512.jpg', iconDir), approved512),
  writeFile(new URL('apple-touch-icon-approved-v4.jpg', iconDir), approved192),

  // Keep legacy names valid for older installed shortcuts.
  writeFile(new URL('icon-192.png', iconDir), legacy192),
  writeFile(new URL('icon-512.png', iconDir), legacy512),
  writeFile(new URL('maskable-512.png', iconDir), legacy512),
  writeFile(new URL('apple-touch-icon.png', iconDir), legacy192),
  writeFile(new URL('sila-app-icon.png', brandDir), legacy512),
])

console.log('Prepared approved Family branding from stable source assets.')
