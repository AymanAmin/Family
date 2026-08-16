import { supabase } from './lib/supabase'

const PHOTO_CACHE_MS = 5 * 60 * 1000

type PhotoEntry = {
  url: string | null
  savedAt: number
}

const photoCache = new Map<string, PhotoEntry>()
let scanFrame = 0
let scanSerial = 0

function normalizeName(value: string | null | undefined) {
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

function directoryAvatars() {
  return Array.from(document.querySelectorAll<HTMLElement>('.directory-person-card .directory-avatar'))
    .map((avatar) => {
      const card = avatar.closest('.directory-person-card')
      const name = normalizeName(card?.querySelector('.directory-card-copy strong')?.textContent)
      return { avatar, name }
    })
    .filter((item) => Boolean(item.name))
}

function applyPhoto(avatar: HTMLElement, url: string | null) {
  if (!url) return

  avatar.style.setProperty('--person-photo-background', `url(${JSON.stringify(url)})`)
  avatar.classList.add('person-photo-enhanced')
  avatar.dataset.personPhotoUrl = url
}

async function loadPhotos(names: string[]) {
  if (!supabase || !names.length) return

  for (let index = 0; index < names.length; index += 40) {
    const chunk = names.slice(index, index + 40)
    const { data, error } = await supabase
      .from('people')
      .select('full_name,photo_url')
      .eq('status', 'approved')
      .in('full_name', chunk)

    if (error) continue

    const byName = new Map<string, Set<string>>()
    for (const row of data ?? []) {
      const name = normalizeName(row.full_name)
      const url = safeHttpsUrl(row.photo_url)
      if (!name || !url) continue
      const urls = byName.get(name) ?? new Set<string>()
      urls.add(url)
      byName.set(name, urls)
    }

    const now = Date.now()
    chunk.forEach((name) => {
      const urls = byName.get(name)
      // If duplicate records share the same name but only one approved record has
      // a photo, show that photo instead of hiding it merely because another
      // duplicate record has no photo. If multiple different photos exist, keep
      // the gender icon to avoid showing the wrong person's photo.
      const url = urls?.size === 1 ? Array.from(urls)[0] : null
      photoCache.set(name, { url: url ?? null, savedAt: now })
    })
  }
}

async function scan() {
  if (!supabase) return
  const serial = ++scanSerial
  const bindings = directoryAvatars()
  if (!bindings.length) return

  const now = Date.now()
  const names = Array.from(new Set(bindings.map((item) => item.name)))
  const missing = names.filter((name) => {
    const cached = photoCache.get(name)
    return !cached || now - cached.savedAt > PHOTO_CACHE_MS
  })

  if (missing.length) await loadPhotos(missing)
  if (serial !== scanSerial) return

  bindings.forEach(({ avatar, name }) => {
    applyPhoto(avatar, photoCache.get(name)?.url ?? null)
  })

  // PersonPhotoEverywhere may finish its own conservative name-only lookup a
  // moment later. Re-apply the unambiguous directory photo after that pass.
  window.setTimeout(() => {
    if (serial !== scanSerial) return
    directoryAvatars().forEach(({ avatar, name }) => {
      applyPhoto(avatar, photoCache.get(name)?.url ?? null)
    })
  }, 450)
}

function scheduleScan() {
  if (scanFrame) return
  scanFrame = window.requestAnimationFrame(() => {
    scanFrame = 0
    void scan()
  })
}

if (typeof document !== 'undefined') {
  const boot = () => scheduleScan()
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()

  const observer = new MutationObserver(scheduleScan)
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })

  window.addEventListener('hashchange', scheduleScan)
  window.addEventListener('popstate', scheduleScan)
  window.addEventListener('pageshow', scheduleScan)
  window.addEventListener('sila:person-photo-updated', () => {
    photoCache.clear()
    scheduleScan()
  })
}

export {}
