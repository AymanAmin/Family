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
  personId?: string
}

type NamePhotoGroup = {
  recordCount: number
  urls: Set<string>
  missingPhoto: boolean
}

const PHOTO_CACHE_TTL = 5 * 60_000
const photoByName = new Map<string, PhotoCacheEntry>()
const photoById = new Map<string, PhotoCacheEntry>()
const loadedPhotoUrls = new Set<string>()
const photoLoadPromises = new Map<string, Promise<boolean>>()
let scanFrame = 0
let requestSerial = 0

function normalizedName(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function personIdFromRoute() {
  if (typeof window === 'undefined') return ''
  const match = window.location.hash.match(/^#\/person\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : ''
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

function householdNameToPersonName(value: string) {
  return normalizedName(value.replace(/^أسرة\s+/u, ''))
}

function collectBindings(): AvatarBinding[] {
  const bindings: AvatarBinding[] = []
  const seen = new Set<HTMLElement>()

  function add(selector: string, resolveName: (avatar: HTMLElement) => string, resolvePersonId?: (avatar: HTMLElement) => string) {
    document.querySelectorAll<HTMLElement>(selector).forEach((avatar) => {
      if (seen.has(avatar)) return
      const name = normalizedName(resolveName(avatar))
      if (!name) return
      seen.add(avatar)
      const personId = resolvePersonId?.(avatar)?.trim() || undefined
      bindings.push({ avatar, name, personId })
    })
  }

  // Main person profile: bind by the actual record id, not only by the displayed
  // name. This is important when two people have the same name; the old name-only
  // safety rule intentionally suppressed the image in that case.
  add('.detail-hero .detail-avatar',
    (avatar) => textFrom(avatar.closest('.detail-hero'), 'h1'),
    () => personIdFromRoute())
  add('.account-area .account-profile-button', (avatar) => textFrom(avatar.closest('.account-area'), '.account-copy strong'))

  // Directory, pickers and family/person lists.
  add('.directory-person-card .directory-avatar', (avatar) => textFrom(avatar.closest('.directory-person-card'), '.directory-card-copy strong'))
  add('.people-picker-selected .people-picker-avatar', (avatar) => textFrom(avatar.closest('.people-picker-selected'), 'strong'))
  add('.people-picker-menu > button .people-picker-avatar', (avatar) => textFrom(avatar.closest('button'), 'strong'))
  add('.family-member-card .family-member-avatar', (avatar) => textFrom(avatar.closest('.family-member-card'), 'strong'))
  add('.family-overview-person > span:first-child', (avatar) => textFrom(avatar.closest('.family-overview-person'), 'strong'))
  add('.duplicate-result-card .duplicate-avatar', (avatar) => textFrom(avatar.closest('.duplicate-result-card'), '.duplicate-copy strong'))
  add('.direct-relation-person > span:first-child', (avatar) => textFrom(avatar.closest('.direct-relation-person'), '.direct-relation-copy strong'))

  // Tree, kinship path and relationship-network avatars.
  add('.tree-focus-summary .tree-focus-avatar', (avatar) => textFrom(avatar.closest('.tree-focus-summary'), 'strong'))
  add('.kin-node .kin-avatar', (avatar) => textFrom(avatar.closest('.kin-node'), '.kin-copy strong'))
  add('.kin-self .kin-self-ring > b', (avatar) => textFrom(avatar.closest('.kin-self'), 'strong'))
  add('.path-person-node > span:first-child', (avatar) => textFrom(avatar.closest('.path-person-node'), 'strong'))
  add('.kinship-branch-node > span:first-child', (avatar) => textFrom(avatar.closest('.kinship-branch-node'), 'strong'))

  // Lineage hierarchy: root, branches, expanded nodes, spouses and family groups.
  add('.lineage-spouse-rail > button > span:first-child', (avatar) => textFrom(avatar.closest('button'), 'strong'))
  add('.lineage-expand-main .lineage-expand-avatar', (avatar) => textFrom(avatar.closest('.lineage-expand-main'), '.lineage-expand-copy strong'))
  add('.lineage-household-group > header button > span:first-child', (avatar) => textFrom(avatar.closest('button'), 'strong'))
  add('.lineage-root-node > span', (avatar) => textFrom(avatar.closest('.lineage-root-node'), 'strong'))
  add('.lineage-branch-strip > button > span:first-child', (avatar) => {
    const button = avatar.closest('button')
    const branchLabel = textFrom(button, 'strong')
    return normalizedName(branchLabel.replace(/^فرع\s+/u, ''))
  })
  add('.lineage-person-chip > span:first-child', (avatar) => textFrom(avatar.closest('.lineage-person-chip'), 'strong'))
  add('.lineage-family-spouses button > span:first-child', (avatar) => textFrom(avatar.closest('button'), 'b'))

  // Household profile and household cards.
  add('.household-profile-hero .household-profile-avatar', (avatar) => textFrom(avatar.closest('.household-profile-hero'), '.household-open-husband strong'))
  add('.household-spouse-heading > button > span:first-child', (avatar) => textFrom(avatar.closest('button'), 'strong'))
  add('.household-child-grid > button > span:first-child', (avatar) => textFrom(avatar.closest('button'), 'strong'))
  add('.household-home-card .card-symbol', (avatar) => householdNameToPersonName(textFrom(avatar.closest('.household-home-card'), 'h3')))

  return bindings
}

function restoreAvatar(avatar: HTMLElement) {
  avatar.classList.remove('person-photo-enhanced')
  avatar.removeAttribute('data-person-photo-url')
  avatar.removeAttribute('data-person-photo-pending-url')
  avatar.style.removeProperty('--person-photo-background')
}

function commitPhoto(avatar: HTMLElement, url: string) {
  avatar.style.setProperty('--person-photo-background', `url(${JSON.stringify(url)})`)
  avatar.classList.add('person-photo-enhanced')
  avatar.dataset.personPhotoUrl = url
  avatar.removeAttribute('data-person-photo-pending-url')
}

function preloadPhoto(url: string): Promise<boolean> {
  if (loadedPhotoUrls.has(url)) return Promise.resolve(true)

  const existing = photoLoadPromises.get(url)
  if (existing) return existing

  const request = new Promise<boolean>((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      loadedPhotoUrls.add(url)
      photoLoadPromises.delete(url)
      resolve(true)
    }
    image.onerror = () => {
      photoLoadPromises.delete(url)
      resolve(false)
    }
    image.src = url
  })

  photoLoadPromises.set(url, request)
  return request
}

function applyPhoto(binding: AvatarBinding, url: string | null) {
  const { avatar, name } = binding
  if (!url) {
    restoreAvatar(avatar)
    return
  }

  if (avatar.dataset.personPhotoUrl === url && avatar.classList.contains('person-photo-enhanced')) return

  if (loadedPhotoUrls.has(url)) {
    commitPhoto(avatar, url)
    return
  }

  if (avatar.dataset.personPhotoPendingUrl === url) return
  avatar.dataset.personPhotoPendingUrl = url

  void preloadPhoto(url).then((loaded) => {
    if (!avatar.isConnected || avatar.dataset.personPhotoPendingUrl !== url) return

    if (!loaded) {
      if (binding.personId) photoById.set(binding.personId, { url: null, savedAt: Date.now() })
      else photoByName.set(name, { url: null, savedAt: Date.now() })
      restoreAvatar(avatar)
      return
    }

    commitPhoto(avatar, url)
  })
}

async function fetchPhotosByIds(ids: string[]) {
  if (!supabase || !ids.length) return
  const { data, error } = await supabase
    .from('people')
    .select('id,photo_url')
    .eq('status', 'approved')
    .in('id', ids)

  if (error) return
  const now = Date.now()
  const returned = new Set<string>()
  for (const row of data ?? []) {
    const id = typeof row.id === 'string' ? row.id : ''
    if (!id) continue
    returned.add(id)
    photoById.set(id, { url: safePhotoUrl(row.photo_url), savedAt: now })
  }
  ids.forEach((id) => {
    if (!returned.has(id)) photoById.set(id, { url: null, savedAt: now })
  })
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
    photoByName.set(name, { url: safeUniqueUrl, savedAt: now })
  })
}

async function scanAndApply(force = false) {
  if (!supabase) return
  const bindings = collectBindings()
  if (!bindings.length) return

  const now = Date.now()
  const idsToFetch = [...new Set(bindings.map((item) => item.personId).filter((id): id is string => Boolean(id)).filter((id) => {
    if (force) return true
    const cached = photoById.get(id)
    return !cached || now - cached.savedAt > PHOTO_CACHE_TTL
  }))]

  if (idsToFetch.length) await fetchPhotosByIds(idsToFetch)

  const namesToFetch = [...new Set(bindings.filter((item) => !item.personId).map((item) => item.name).filter((name) => {
    if (force) return true
    const cached = photoByName.get(name)
    return !cached || now - cached.savedAt > PHOTO_CACHE_TTL
  }))]

  if (namesToFetch.length) await fetchPhotos(namesToFetch)

  bindings.forEach((binding) => {
    const url = binding.personId
      ? photoById.get(binding.personId)?.url ?? null
      : photoByName.get(binding.name)?.url ?? null
    applyPhoto(binding, url)
  })
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
      if (detail?.personId) photoById.set(detail.personId, { url: safePhotoUrl(detail.photoUrl), savedAt: Date.now() })
      // Refetch id-bound avatars too when the existing caller only supplied a name.
      scheduleScan(Boolean(!detail?.personId))
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
