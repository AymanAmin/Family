import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import '../person-photo.css'

type PhotoCacheEntry = {
  url: string | null
  savedAt: number
}

type PhotoUpdateDetail = {
  personId?: string
  fullName?: string
  photoUrl?: string | null
}

type AvatarBinding = {
  avatar: HTMLElement
  name: string
}

type NamePhotoGroup = {
  recordCount: number
  urls: Set<string>
  missingPhoto: boolean
}

const PHOTO_CACHE_TTL = 5 * 60_000
const photoByName = new Map<string, PhotoCacheEntry>()
const originalMarkup = new WeakMap<HTMLElement, string>()
let scanFrame = 0
let requestSerial = 0

function normalizedName(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function safePhotoUrl(value: unknown): string | null {
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

function textFrom(root: Element | null, selector: string) {
  return normalizedName(root?.querySelector(selector)?.textContent)
}

function collectBindings(): AvatarBinding[] {
  const bindings: AvatarBinding[] = []
  const seen = new Set<HTMLElement>()

  function add(selector: string, resolveName: (avatar: HTMLElement) => string) {
    document.querySelectorAll<HTMLElement>(selector).forEach((avatar) => {
      if (seen.has(avatar)) return
      const name = normalizedName(resolveName(avatar))
      if (!name) return
      seen.add(avatar)
      bindings.push({ avatar, name })
    })
  }

  add('.detail-hero .detail-avatar', (avatar) => textFrom(avatar.closest('.detail-hero'), 'h1'))
  add('.account-area .account-profile-button', (avatar) => textFrom(avatar.closest('.account-area'), '.account-copy strong'))
  add('.directory-person-card .directory-avatar', (avatar) => textFrom(avatar.closest('.directory-person-card'), '.directory-card-copy strong'))
  add('.people-picker-selected .people-picker-avatar', (avatar) => textFrom(avatar.closest('.people-picker-selected'), 'strong'))
  add('.people-picker-menu > button .people-picker-avatar', (avatar) => textFrom(avatar.closest('button'), 'strong'))
  add('.family-member-card .family-member-avatar', (avatar) => textFrom(avatar.closest('.family-member-card'), 'strong'))
  add('.family-overview-person > span:first-child', (avatar) => textFrom(avatar.closest('.family-overview-person'), 'strong'))
  add('.tree-focus-summary .tree-focus-avatar', (avatar) => textFrom(avatar.closest('.tree-focus-summary'), 'strong'))
  add('.kin-node .kin-avatar', (avatar) => textFrom(avatar.closest('.kin-node'), '.kin-copy strong'))
  add('.kin-self .kin-self-ring > b', (avatar) => textFrom(avatar.closest('.kin-self'), 'strong'))
  add('.lineage-spouse-rail > button > span:first-child', (avatar) => textFrom(avatar.closest('button'), 'strong'))
  add('.lineage-expand-main .lineage-expand-avatar', (avatar) => textFrom(avatar.closest('.lineage-expand-main'), '.lineage-expand-copy strong'))
  add('.lineage-household-group > header button > span:first-child', (avatar) => textFrom(avatar.closest('button'), 'strong'))
  add('.lineage-root-node > span', (avatar) => textFrom(avatar.closest('.lineage-root-node'), 'strong'))
  add('.kinship-branch-node > span:first-child', (avatar) => textFrom(avatar.closest('.kinship-branch-node'), 'strong'))
  add('.lineage-person-chip > span:first-child', (avatar) => textFrom(avatar.closest('.lineage-person-chip'), 'strong'))
  add('.lineage-family-spouses button > span:first-child', (avatar) => textFrom(avatar.closest('button'), 'b'))

  return bindings
}

function restoreAvatar(avatar: HTMLElement) {
  const original = originalMarkup.get(avatar)
  if (typeof original === 'string' && avatar.classList.contains('person-photo-enhanced')) {
    avatar.innerHTML = original
  }
  avatar.classList.remove('person-photo-enhanced')
  avatar.removeAttribute('data-person-photo-url')
}

function applyPhoto(binding: AvatarBinding, url: string | null) {
  const { avatar, name } = binding
  if (!url) {
    restoreAvatar(avatar)
    return
  }

  const currentImage = avatar.querySelector<HTMLImageElement>('img.person-photo-inline')
  if (avatar.dataset.personPhotoUrl === url && currentImage) return

  if (!originalMarkup.has(avatar)) originalMarkup.set(avatar, avatar.innerHTML)

  avatar.innerHTML = ''
  avatar.classList.add('person-photo-enhanced')
  avatar.dataset.personPhotoUrl = url

  const image = document.createElement('img')
  image.className = 'person-photo-inline'
  image.src = url
  image.alt = `صورة ${name}`
  image.loading = 'lazy'
  image.decoding = 'async'
  image.addEventListener('error', () => {
    photoByName.set(name, { url: null, savedAt: Date.now() })
    restoreAvatar(avatar)
  }, { once: true })
  avatar.appendChild(image)
}

async function fetchPhotos(names: string[]) {
  if (!supabase || !names.length) return
  const requestId = ++requestSerial
  const groups = new Map<string, NamePhotoGroup>()

  for (let index = 0; index < names.length; index += 40) {
    const chunk = names.slice(index, index + 40)
    const { data, error } = await supabase
      .from('people')
      .select('full_name,photo_url')
      .eq('status', 'approved')
      .in('full_name', chunk)

    if (requestId !== requestSerial) return
    if (error) continue

    for (const row of data ?? []) {
      const name = normalizedName(row.full_name)
      if (!name) continue
      const url = safePhotoUrl(row.photo_url)
      const group = groups.get(name) ?? { recordCount: 0, urls: new Set<string>(), missingPhoto: false }
      group.recordCount += 1
      if (url) group.urls.add(url)
      else group.missingPhoto = true
      groups.set(name, group)
    }
  }

  const now = Date.now()
  names.forEach((name) => {
    const group = groups.get(name)
    const safeUniqueUrl = group && !group.missingPhoto && group.urls.size === 1 ? Array.from(group.urls)[0] ?? null : null
    // Exact duplicate names are intentionally conservative: if one duplicate has
    // no image or the duplicates have different images, keep the fallback avatar
    // rather than risking showing the wrong person's photo.
    photoByName.set(name, { url: safeUniqueUrl, savedAt: now })
  })
}

async function scanAndApply(force = false) {
  if (!supabase) return
  const bindings = collectBindings()
  if (!bindings.length) return

  const now = Date.now()
  const namesToFetch = [...new Set(bindings.map((item) => item.name).filter((name) => {
    if (force) return true
    const cached = photoByName.get(name)
    return !cached || now - cached.savedAt > PHOTO_CACHE_TTL
  }))]

  if (namesToFetch.length) await fetchPhotos(namesToFetch)

  bindings.forEach((binding) => applyPhoto(binding, photoByName.get(binding.name)?.url ?? null))
}

function scheduleScan(force = false) {
  if (scanFrame) window.cancelAnimationFrame(scanFrame)
  scanFrame = window.requestAnimationFrame(() => {
    scanFrame = 0
    void scanAndApply(force)
  })
}

export function notifyPersonPhotoUpdated(fullName: string, photoUrl: string | null | undefined) {
  const name = normalizedName(fullName)
  if (name) photoByName.set(name, { url: safePhotoUrl(photoUrl), savedAt: Date.now() })
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<PhotoUpdateDetail>('sila:person-photo-updated', {
      detail: { fullName: name, photoUrl: safePhotoUrl(photoUrl) },
    }))
  }
}

export default function PersonPhotoEverywhere(): null {
  useEffect(() => {
    const observer = new MutationObserver(() => scheduleScan())
    observer.observe(document.body, { childList: true, subtree: true })

    const onPhotoUpdated = (event: Event) => {
      const detail = (event as CustomEvent<PhotoUpdateDetail>).detail
      const name = normalizedName(detail?.fullName)
      if (name) photoByName.set(name, { url: safePhotoUrl(detail?.photoUrl), savedAt: Date.now() })
      scheduleScan(Boolean(!name))
    }

    const onRouteChange = () => scheduleScan()
    window.addEventListener('sila:person-photo-updated', onPhotoUpdated)
    window.addEventListener('hashchange', onRouteChange)
    scheduleScan()

    return () => {
      observer.disconnect()
      window.removeEventListener('sila:person-photo-updated', onPhotoUpdated)
      window.removeEventListener('hashchange', onRouteChange)
      if (scanFrame) window.cancelAnimationFrame(scanFrame)
    }
  }, [])

  return null
}
