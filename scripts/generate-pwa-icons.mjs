import { mkdir, readFile, writeFile } from 'node:fs/promises'

const assetDir = new URL('./assets/', import.meta.url)
const iconDir = new URL('../public/icons/', import.meta.url)
const brandDir = new URL('../public/brand/', import.meta.url)

async function readBase64Chunks(prefix, count) {
  const parts = []
  for (let index = 1; index <= count; index += 1) {
    parts.push((await readFile(new URL(`${prefix}.${index}`, assetDir), 'utf8')).trim())
  }
  return Buffer.from(parts.join(''), 'base64')
}

await Promise.all([
  mkdir(iconDir, { recursive: true }),
  mkdir(brandDir, { recursive: true }),
])

const suppliedIcon = await readBase64Chunks('sila-icon.b64', 4)

await Promise.all([
  writeFile(new URL('icon-192.png', iconDir), suppliedIcon),
  writeFile(new URL('icon-512.png', iconDir), suppliedIcon),
  writeFile(new URL('maskable-512.png', iconDir), suppliedIcon),
  writeFile(new URL('apple-touch-icon.png', iconDir), suppliedIcon),
  writeFile(new URL('sila-app-icon.png', brandDir), suppliedIcon),
])

console.log('Prepared the supplied Sila Al-Qaraba icon for browser, PWA, iOS and in-app branding.')
