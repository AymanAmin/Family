import { supabase } from './lib/supabase'

const PHOTO_CACHE_MS = 5 * 60 * 1000

type PhotoCandidate = {
  url: string
  birthYear: number | null
  description: string
  isDeceased: boolean
}

type PhotoEntry = {
  candidates: PhotoCandidate[]
  savedAt: number
}

type DirectoryBinding = {
  avatar: HTMLElement
  name: string
  meta: string
}

const photoCache = new Map<string, PhotoEntry>()
let scanFrame = 0
let scanRunning = false
let rescanRequested = false

function normalizeText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function safeHttpsUrl(value: unknown) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  try {
    const url = new URL(text)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function directoryAvatars(): DirectoryBinding[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.directory-person-card .directory-avatar'))
    .map((avatar) => {
      const card = avatar.closest('.directory-person-card')
      const name = normalizeText(card?.querySelector('.directory-card-copy strong')?.textContent)
      const meta = normalizeText(card?.querySelector('.directory-card-copy small')?.textContent)
      return { avatar, name, meta }
    })
    .filter((item) => Boolean(item.name))
}

function birthYearFromMeta(meta: string) {
  const match = meta.match(/(?:19|20)\d{2}/)
  return match ? Number(match[0]) : null
}

function choosePhoto(entry: PhotoEntry | undefined, meta: string) {
  if (!entry?.candidates.length) return null

  const uniqueUrls = Array.from(new Set(entry.candidates.map((item) => item.url)))
  if (uniqueUrls.length === 1) return uniqueUrls[0]

  const birthYear = birthYearFromMeta(meta)
  if (birthYear) {
    const yearMatches = entry.candidates.filter((item) => item.birthYear === birthYear)
    const yearUrls = Array.from(new Set(yearMatches.map((item) => item.url)))
    if (yearUrls.length === 1) return yearUrls[0]
  }

  const normalizedMeta = normalizeText(meta)
  if (normalizedMeta) {
    const descriptionMatches = entry.candidates.filter((item) => {
      const description = normalizeText(item.description)
      if (!description) return false
      const sample = description.slice(0, Math.min(description.length, 28))
      return sample.length >= 8 && normalizedMeta.includes(sample)
    })
    const descriptionUrls = Array.from(new Set(descriptionMatches.map((item) => item.url)))
    if (descriptionUrls.length === 1) return descriptionUrls[0]
  }

  return null
}

function removePhotoOverlay(avatar: HTMLElement) {
  avatar.querySelector<HTMLImageElement>(':scope > img.directory-person-photo-inline')?.remove()
}

function applyPhoto(avatar: HTMLElement, url: string | null) {
  if (!url) {
    removePhotoOverlay(avatar)
    return
  }

  avatar.style.setProperty('position', 'relative', 'important')
  avatar.style.setProperty('overflow', 'hidden', 'important')

  let image = avatar.querySelector<HTMLImageElement>(':scope > img.directory-person-photo-inline')
  if (!image) {
    image = document.createElement('img')
    image.className = 'directory-person-photo-inline'
    image.alt = ''
    image.loading = 'lazy'
    image.decoding = 'async'
    image.setAttribute('aria-hidden', 'true')
    image.style.setProperty('position', 'absolute', 'important')
    image.style.setProperty('inset', '0', 'important')
    image.style.setProperty('z-index', '3', 'important')
    image.style.setProperty('display', 'block', 'important')
    image.style.setProperty('width', '100%', 'important')
    image.style.setProperty('height', '100%', 'important')
    image.style.setProperty('max-width', 'none', 'important')
    image.style.setProperty('max-height', 'none', 'important')
    image.style.setProperty('border', '0', 'important')
    image.style.setProperty('border-radius', 'inherit', 'important')
    image.style.setProperty('object-fit', 'cover', 'important')
    image.style.setProperty('object-position', 'center', 'important')
    image.addEventListener('error', () => image?.remove(), { once: true })
    avatar.appendChild(image)
  }

  if (image.src !== url) image.src = url
}

async function loadPhotos(names: string[]) {
  if (!supabase || !names.length) return

  for (let index = 0; index < names.length; index += 40) {
    const chunk = names.slice(index, index + 40)
    const { data, error } = await supabase
      .from('people')
      .select('full_name,photo_url,birth_year,description,is_deceased')
      .eq('status', 'approved')
      .in('full_name', chunk)

    if (error) continue

    const byName = new Map<string, PhotoCandidate[]>()
    for (const row of data ?? []) {
      const name = normalizeText(row.full_name)
      const url = safeHttpsUrl(row.photo_url)
      if (!name || !url) continue

      const candidates = byName.get(name) ?? []
      candidates.push({
        url,
        birthYear: typeof row.birth_year === 'number' ? row.birth_year : null,
        description: typeof row.description === 'string' ? row.description : '',
        isDeceased: Boolean(row.is_deceased),
      })
      byName.set(name, candidates)
    }

    const now = Date.now()
    chunk.forEach((name) => {
      photoCache.set(name, { candidates: byName.get(name) ?? [], savedAt: now })
    })
  }
}

async function runScan() {
  if (!supabase) return
  if (scanRunning) {
    rescanRequested = true
    return
  }

  scanRunning = true
  try {
    do {
      rescanRequested = false
      const bindings = directoryAvatars()
      if (!bindings.length) continue

      const now = Date.now()
      const names = Array.from(new Set(bindings.map((item) => item.name)))
      const missing = names.filter((name) => {
        const cached = photoCache.get(name)
        return !cached || now - cached.savedAt > PHOTO_CACHE_MS
      })

      if (missing.length) await loadPhotos(missing)

      directoryAvatars().forEach(({ avatar, name, meta }) => {
        applyPhoto(avatar, choosePhoto(photoCache.get(name), meta))
      })
    } while (rescanRequested)
  } finally {
    scanRunning = false
  }
}

function scheduleScan() {
  if (scanFrame) return
  scanFrame = window.requestAnimationFrame(() => {
    scanFrame = 0
    void runScan()
  })
}

if (typeof document !== 'undefined') {
  const boot = () => scheduleScan()
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()

  const observer = new MutationObserver((mutations) => {
    const meaningful = mutations.some((mutation) => {
      if (mutation.type !== 'childList') return false
      return Array.from(mutation.addedNodes).some((node) => {
        if (!(node instanceof Element)) return false
        if (node.matches('img.directory-person-photo-inline')) return false
        return Boolean(node.matches('.directory-person-card, .directory-person-card *') || node.querySelector?.('.directory-person-card'))
      })
    })
    if (meaningful) scheduleScan()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })

  window.addEventListener('hashchange', scheduleScan)
  window.addEventListener('popstate', scheduleScan)
  window.addEventListener('pageshow', scheduleScan)
  window.addEventListener('sila:person-photo-updated', () => {
    photoCache.clear()
    scheduleScan()
  })
}

export {}
