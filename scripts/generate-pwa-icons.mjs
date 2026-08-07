import { mkdir, writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'

const outputDir = new URL('../public/icons/', import.meta.url)

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
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
  if (!lengthSq) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function mix(a, b, amount) {
  return Math.round(a + (b - a) * amount)
}

function colorMix(left, right, amount) {
  return [mix(left[0], right[0], amount), mix(left[1], right[1], amount), mix(left[2], right[2], amount), 255]
}

function heartPath(scale = 1) {
  const raw = []
  for (let i = 0; i <= 48; i += 1) {
    const t = (Math.PI * 2 * i) / 48
    raw.push([
      16 * Math.sin(t) ** 3,
      13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
    ])
  }
  const xs = raw.map(([x]) => x)
  const ys = raw.map(([, y]) => y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return raw.map(([x, y]) => {
    const nx = 0.5 + ((((x - minX) / (maxX - minX)) - 0.5) * 0.70 * scale)
    const ny = 0.49 + ((((maxY - y) / (maxY - minY)) - 0.5) * 0.70 * scale)
    return [nx, ny]
  })
}

function pathDistance(px, py, points) {
  let best = Infinity
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index - 1]
    const [x2, y2] = points[index]
    const distance = distanceToSegment(px, py, x1, y1, x2, y2)
    if (distance < best) best = distance
  }
  return best
}

function createIconRgba(size, safeScale = 1) {
  const rgba = Buffer.alloc(size * size * 4)
  const outline = heartPath(safeScale)
  const navy = [35, 74, 120]
  const teal = [121, 201, 190]
  const cream = [248, 245, 238]
  const orange = [239, 122, 80]
  const amber = [247, 172, 94]

  const people = [
    { x: 0.42, y: 0.43, r: 0.055, shoulders: [0.34, 0.58, 0.50, 0.58] },
    { x: 0.59, y: 0.44, r: 0.052, shoulders: [0.52, 0.58, 0.67, 0.58] },
    { x: 0.30, y: 0.54, r: 0.041, shoulders: [0.24, 0.65, 0.36, 0.65] },
    { x: 0.70, y: 0.55, r: 0.040, shoulders: [0.64, 0.66, 0.76, 0.66] },
  ].map((person) => ({
    ...person,
    x: 0.5 + (person.x - 0.5) * safeScale,
    y: 0.5 + (person.y - 0.5) * safeScale,
    r: person.r * safeScale,
    shoulders: person.shoulders.map((value, index) => 0.5 + (value - 0.5) * safeScale),
  }))

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size
      const ny = (y + 0.5) / size
      const glow = Math.max(0, 1 - Math.hypot(nx - 0.52, ny - 0.42) * 1.45)
      let color = [
        mix(cream[0], 255, glow * 0.23),
        mix(cream[1], 253, glow * 0.23),
        mix(cream[2], 248, glow * 0.23),
        255,
      ]

      const heartDistance = pathDistance(nx, ny, outline)
      if (heartDistance <= 0.028 * safeScale) color = colorMix(navy, teal, Math.max(0, Math.min(1, nx)))

      const smallX = (nx - 0.5) / (0.075 * safeScale)
      const smallY = -(ny - (0.135 - (1 - safeScale) * 0.02)) / (0.068 * safeScale)
      const heartField = (smallX * smallX + smallY * smallY - 1) ** 3 - smallX * smallX * smallY ** 3
      if (heartField <= 0) color = colorMix(amber, orange, Math.max(0, Math.min(1, ny * 4)))

      for (const person of people) {
        const figureColor = colorMix(navy, teal, Math.max(0, Math.min(1, person.x)))
        const headDistance = Math.abs(Math.hypot(nx - person.x, ny - person.y) - person.r)
        if (headDistance <= 0.012 * safeScale) color = figureColor

        const [sx1, sy1, sx2, sy2] = person.shoulders
        const midX = (sx1 + sx2) / 2
        const bodyTop = person.y + person.r + 0.025 * safeScale
        const bodyBottom = sy1
        if (distanceToSegment(nx, ny, midX, bodyTop, midX, bodyBottom) <= 0.010 * safeScale) color = figureColor
        if (distanceToSegment(nx, ny, sx1, sy1, midX, bodyTop) <= 0.010 * safeScale) color = figureColor
        if (distanceToSegment(nx, ny, sx2, sy2, midX, bodyTop) <= 0.010 * safeScale) color = figureColor
      }

      const offset = (y * size + x) * 4
      rgba[offset] = color[0]
      rgba[offset + 1] = color[1]
      rgba[offset + 2] = color[2]
      rgba[offset + 3] = color[3]
    }
  }
  return rgba
}

function resizeNearest(source, sourceSize, targetSize) {
  const target = Buffer.alloc(targetSize * targetSize * 4)
  for (let y = 0; y < targetSize; y += 1) {
    for (let x = 0; x < targetSize; x += 1) {
      const sx = Math.min(sourceSize - 1, Math.floor((x / targetSize) * sourceSize))
      const sy = Math.min(sourceSize - 1, Math.floor((y / targetSize) * sourceSize))
      const sourceOffset = (sy * sourceSize + sx) * 4
      const targetOffset = (y * targetSize + x) * 4
      source.copy(target, targetOffset, sourceOffset, sourceOffset + 4)
    }
  }
  return target
}

await mkdir(outputDir, { recursive: true })
const normal512 = createIconRgba(512, 0.92)
const maskable512 = createIconRgba(512, 0.74)
const icon192 = resizeNearest(normal512, 512, 192)
const apple180 = resizeNearest(normal512, 512, 180)

await Promise.all([
  writeFile(new URL('icon-192.png', outputDir), encodePng(192, 192, icon192)),
  writeFile(new URL('icon-512.png', outputDir), encodePng(512, 512, normal512)),
  writeFile(new URL('maskable-512.png', outputDir), encodePng(512, 512, maskable512)),
  writeFile(new URL('apple-touch-icon.png', outputDir), encodePng(180, 180, apple180)),
])

console.log('Generated Sila family-heart PWA icons: 192, 512, maskable 512, apple-touch 180.')
