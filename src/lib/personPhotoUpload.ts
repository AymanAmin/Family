export const PERSON_PHOTO_MAX_BYTES = 50 * 1024
const INITIAL_MAX_EDGE = 720
const MIN_MAX_EDGE = 160
const QUALITY_STEPS = [0.86, 0.78, 0.7, 0.62, 0.54, 0.46, 0.38, 0.3]

export type CompressedPersonPhoto = {
  blob: Blob
  mimeType: 'image/webp' | 'image/jpeg'
  extension: 'webp'
  width: number
  height: number
  originalBytes: number
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('تعذر قراءة الصورة. اختر ملف صورة مدعومًا من جهازك.'))
    }
    image.src = url
  })
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('تعذر ضغط الصورة في هذا المتصفح.'))
    }, type, quality)
  })
}

function fitWithin(sourceWidth: number, sourceHeight: number, maxEdge: number) {
  const longest = Math.max(sourceWidth, sourceHeight)
  if (longest <= maxEdge) return { width: sourceWidth, height: sourceHeight }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  }
}

async function encodeAtSize(image: HTMLImageElement, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('تعذر تجهيز الصورة للضغط.')

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)

  let lastBlob: Blob | null = null
  let preferredType: 'image/webp' | 'image/jpeg' = 'image/webp'

  for (const quality of QUALITY_STEPS) {
    let blob = await canvasBlob(canvas, preferredType, quality)

    // A browser may silently fall back to PNG when WebP encoding is unavailable.
    // JPEG remains the content compatibility fallback, but the storage object key
    // always ends in .webp so every person permanently owns one replaceable file.
    if (preferredType === 'image/webp' && blob.type !== 'image/webp') {
      preferredType = 'image/jpeg'
      context.save()
      context.globalCompositeOperation = 'destination-over'
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      context.restore()
      blob = await canvasBlob(canvas, preferredType, quality)
    }

    lastBlob = blob
    if (blob.size <= PERSON_PHOTO_MAX_BYTES) {
      return {
        blob,
        mimeType: preferredType,
        extension: 'webp',
      } as const
    }
  }

  return lastBlob
    ? {
        blob: lastBlob,
        mimeType: preferredType,
        extension: 'webp',
      } as const
    : null
}

export async function compressPersonPhoto(file: File): Promise<CompressedPersonPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('اختر ملف صورة فقط.')
  if (!file.size) throw new Error('ملف الصورة فارغ.')

  const image = await loadImage(file)
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('أبعاد الصورة غير صالحة.')

  let maxEdge = Math.min(INITIAL_MAX_EDGE, Math.max(image.naturalWidth, image.naturalHeight))
  let latest: Awaited<ReturnType<typeof encodeAtSize>> = null
  let latestSize = fitWithin(image.naturalWidth, image.naturalHeight, maxEdge)

  while (maxEdge >= MIN_MAX_EDGE) {
    latestSize = fitWithin(image.naturalWidth, image.naturalHeight, maxEdge)
    latest = await encodeAtSize(image, latestSize.width, latestSize.height)
    if (latest && latest.blob.size <= PERSON_PHOTO_MAX_BYTES) {
      return {
        ...latest,
        width: latestSize.width,
        height: latestSize.height,
        originalBytes: file.size,
      }
    }
    maxEdge = Math.floor(maxEdge * 0.82)
  }

  // This final tiny encode should only be reached for unusually noisy images.
  latestSize = fitWithin(image.naturalWidth, image.naturalHeight, MIN_MAX_EDGE)
  latest = await encodeAtSize(image, latestSize.width, latestSize.height)
  if (!latest || latest.blob.size > PERSON_PHOTO_MAX_BYTES) {
    throw new Error('تعذر خفض الصورة إلى 50KB. جرّب صورة أخرى.')
  }

  return {
    ...latest,
    width: latestSize.width,
    height: latestSize.height,
    originalBytes: file.size,
  }
}
