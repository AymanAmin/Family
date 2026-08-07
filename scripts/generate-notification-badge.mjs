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
  const t = lengthSq ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq)) : 0
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function createNotificationBadge(size = 96) {
  const rgba = Buffer.alloc(size * size * 4)
  const samples = 4
  const center = [0.5, 0.52, 0.115]
  const nodes = [
    [0.28, 0.29, 0.095],
    [0.72, 0.29, 0.095],
    [0.50, 0.78, 0.095],
  ]
  const lineWidth = 0.055

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let covered = 0
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const nx = (x + (sx + 0.5) / samples) / size
          const ny = (y + (sy + 0.5) / samples) / size
          let inside = Math.hypot(nx - center[0], ny - center[1]) <= center[2]

          for (const [nodeX, nodeY, radius] of nodes) {
            if (Math.hypot(nx - nodeX, ny - nodeY) <= radius) inside = true
            if (distanceToSegment(nx, ny, center[0], center[1], nodeX, nodeY) <= lineWidth) inside = true
          }

          if (inside) covered += 1
        }
      }

      const alpha = Math.round((covered / (samples * samples)) * 255)
      const offset = (y * size + x) * 4
      rgba[offset] = 255
      rgba[offset + 1] = 255
      rgba[offset + 2] = 255
      rgba[offset + 3] = alpha
    }
  }

  return encodePng(size, size, rgba)
}

await mkdir(outputDir, { recursive: true })
await writeFile(new URL('notification-badge.png', outputDir), createNotificationBadge())
console.log('Generated Android notification badge: 96x96 transparent monochrome PNG.')
