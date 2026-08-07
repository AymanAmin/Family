import { mkdir, writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'

const outputDir = new URL('../public/icons/', import.meta.url)

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type)
  const body = Buffer.concat([typeBuffer, data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(width, height, rgba) {
  const rowLength = width * 4
  const raw = Buffer.alloc((rowLength + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (rowLength + 1)
    raw[rowOffset] = 0
    rgba.copy(raw, rowOffset + 1, y * rowLength, (y + 1) * rowLength)
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  header[10] = 0
  header[11] = 0
  header[12] = 0

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND'),
  ])
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy
  if (!lengthSq) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function mix(a, b, amount) {
  return Math.round(a + (b - a) * amount)
}

function createIcon(size, safeScale = 1) {
  const sample = 2
  const w = size * sample
  const rgbaHigh = Buffer.alloc(w * w * 4)
  const nodes = [
    [0.30, 0.30, 0.075],
    [0.70, 0.30, 0.075],
    [0.28, 0.70, 0.075],
    [0.72, 0.70, 0.075],
  ].map(([x, y, r]) => [0.5 + (x - 0.5) * safeScale, 0.5 + (y - 0.5) * safeScale, r * safeScale])
  const center = [0.5, 0.5, 0.125 * safeScale]
  const lineWidth = 0.035 * safeScale

  for (let y = 0; y < w; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const nx = (x + 0.5) / w
      const ny = (y + 0.5) / w
      const diagonal = Math.max(0, Math.min(1, (nx + ny) / 2))
      const radial = Math.min(1, Math.hypot(nx - 0.5, ny - 0.46) * 1.35)
      const glow = Math.max(0, 1 - radial)

      let r = mix(5, 15, diagonal)
      let g = mix(73, 105, diagonal)
      let b = mix(58, 82, diagonal)
      r = mix(r, 22, glow * 0.18)
      g = mix(g, 126, glow * 0.18)
      b = mix(b, 96, glow * 0.18)

      const edgeShade = Math.max(0, (Math.hypot(nx - 0.5, ny - 0.5) - 0.42) / 0.3)
      r = mix(r, 4, edgeShade * 0.32)
      g = mix(g, 52, edgeShade * 0.32)
      b = mix(b, 42, edgeShade * 0.32)

      let color = [r, g, b, 255]

      for (const [nodeX, nodeY] of nodes) {
        if (distanceToSegment(nx, ny, center[0], center[1], nodeX, nodeY) <= lineWidth) {
          color = [234, 244, 239, 255]
        }
      }

      for (const [index, [nodeX, nodeY, radius]] of nodes.entries()) {
        const d = Math.hypot(nx - nodeX, ny - nodeY)
        if (d <= radius * 1.18) color = [13, 95, 75, 255]
        if (d <= radius) color = index === 1 ? [215, 168, 78, 255] : [244, 249, 246, 255]
      }

      const centerDistance = Math.hypot(nx - center[0], ny - center[1])
      if (centerDistance <= center[2] * 1.16) color = [6, 74, 58, 255]
      if (centerDistance <= center[2]) color = [247, 250, 248, 255]
      if (centerDistance <= center[2] * 0.44) color = [11, 102, 78, 255]
      if (centerDistance <= center[2] * 0.20) color = [215, 168, 78, 255]

      const offset = (y * w + x) * 4
      rgbaHigh[offset] = color[0]
      rgbaHigh[offset + 1] = color[1]
      rgbaHigh[offset + 2] = color[2]
      rgbaHigh[offset + 3] = color[3]
    }
  }

  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0, 0]
      for (let sy = 0; sy < sample; sy += 1) {
        for (let sx = 0; sx < sample; sx += 1) {
          const sourceOffset = (((y * sample + sy) * w) + (x * sample + sx)) * 4
          for (let channel = 0; channel < 4; channel += 1) totals[channel] += rgbaHigh[sourceOffset + channel]
        }
      }
      const targetOffset = (y * size + x) * 4
      for (let channel = 0; channel < 4; channel += 1) rgba[targetOffset + channel] = Math.round(totals[channel] / (sample * sample))
    }
  }

  return encodePng(size, size, rgba)
}

await mkdir(outputDir, { recursive: true })
await Promise.all([
  writeFile(new URL('icon-192.png', outputDir), createIcon(192)),
  writeFile(new URL('icon-512.png', outputDir), createIcon(512)),
  writeFile(new URL('maskable-512.png', outputDir), createIcon(512, 0.76)),
  writeFile(new URL('apple-touch-icon.png', outputDir), createIcon(180, 0.88)),
])

console.log('Generated PWA icons: 192, 512, maskable 512, apple-touch 180.')
