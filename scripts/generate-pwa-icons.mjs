import { mkdir, readFile, writeFile } from 'node:fs/promises'

const assetDir = new URL('./assets/', import.meta.url)
const iconDir = new URL('../public/icons/', import.meta.url)
const brandDir = new URL('../public/brand/', import.meta.url)

await Promise.all([
  mkdir(iconDir, { recursive: true }),
  mkdir(brandDir, { recursive: true }),
])

const suppliedIconBase64 = (await readFile(new URL('sila-icon-gold.b64', assetDir), 'utf8')).trim()
const suppliedIcon = Buffer.from(suppliedIconBase64, 'base64')

await Promise.all([
  writeFile(new URL('icon-192.png', iconDir), suppliedIcon),
  writeFile(new URL('icon-512.png', iconDir), suppliedIcon),
  writeFile(new URL('maskable-512.png', iconDir), suppliedIcon),
  writeFile(new URL('apple-touch-icon.png', iconDir), suppliedIcon),
  writeFile(new URL('sila-app-icon.png', brandDir), suppliedIcon),
])

console.log('Prepared the approved warm-gold Family tree icon for browser, PWA, iOS and in-app branding.')
