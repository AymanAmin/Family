import { supabase } from './lib/supabase'

type PersonGender = 'male' | 'female' | null

const genderCache = new Map<string, PersonGender>()
let scheduled = false
let lastRouteKey = ''

const maleIcon = `
<svg data-detail-avatar-icon viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <circle cx="32" cy="22" r="9" fill="none" stroke="currentColor" stroke-width="4" />
  <path d="M14 55c1.8-12.7 8.2-19 18-19s16.2 6.3 18 19" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
  <path d="M24 13.5c2.3-3 5-4.5 8-4.5s5.7 1.5 8 4.5" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" />
</svg>`

const femaleIcon = `
<svg data-detail-avatar-icon viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <path d="M20 27c0-12.2 4.7-18 12-18s12 5.8 12 18c0 4.8-1.2 8.2-3.2 10.7" fill="none" stroke="currentColor" stroke-width="3.8" stroke-linecap="round" />
  <circle cx="32" cy="23" r="8" fill="none" stroke="currentColor" stroke-width="3.8" />
  <path d="M15 55c1.6-11.7 7.2-17.5 17-17.5S47.4 43.3 49 55" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
  <path d="M20 26.5c-1 4.2-.7 8.2 1 12M44 26.5c1 4.2.7 8.2-1 12" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" />
</svg>`

const neutralIcon = `
<svg data-detail-avatar-icon viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <circle cx="32" cy="22" r="9" fill="none" stroke="currentColor" stroke-width="4" />
  <path d="M14 55c1.8-12.7 8.2-19 18-19s16.2 6.3 18 19" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
</svg>`

const familyIcon = `
<svg data-detail-avatar-icon viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <circle cx="32" cy="20" r="7.5" fill="none" stroke="currentColor" stroke-width="3.6" />
  <circle cx="17" cy="29" r="6" fill="none" stroke="currentColor" stroke-width="3.2" />
  <circle cx="47" cy="29" r="6" fill="none" stroke="currentColor" stroke-width="3.2" />
  <path d="M20 53c1.4-11 5.5-16.5 12-16.5S42.6 42 44 53" fill="none" stroke="currentColor" stroke-width="3.8" stroke-linecap="round" />
  <path d="M5.5 52c1-8.8 4.8-13.2 11.5-13.2 3 0 5.4.8 7.2 2.5M58.5 52c-1-8.8-4.8-13.2-11.5-13.2-3 0-5.4.8-7.2 2.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" />
</svg>`

function routeInfo() {
  const match = window.location.hash.match(/^#\/(person|family)\/([^/?#]+)/)
  if (!match) return null
  return { kind: match[1] as 'person' | 'family', id: decodeURIComponent(match[2]) }
}

async function getPersonGender(personId: string): Promise<PersonGender> {
  if (genderCache.has(personId)) return genderCache.get(personId) ?? null
  if (!supabase) return null

  const { data } = await supabase
    .from('people')
    .select('gender')
    .eq('id', personId)
    .maybeSingle()

  const gender = data?.gender === 'male' || data?.gender === 'female' ? data.gender : null
  genderCache.set(personId, gender)
  return gender
}

async function enhanceDetailAvatar() {
  scheduled = false
  const route = routeInfo()
  if (!route) return

  const avatar = document.querySelector<HTMLElement>('.detail-page .detail-hero .detail-avatar')
  if (!avatar) return

  const routeKey = `${route.kind}:${route.id}`
  if (lastRouteKey === routeKey && avatar.querySelector('svg[data-detail-avatar-icon]')) return

  if (route.kind === 'family') {
    avatar.innerHTML = familyIcon
    avatar.classList.add('detail-avatar--icon', 'detail-avatar--family-icon')
    avatar.setAttribute('aria-label', 'أيقونة عائلة')
    lastRouteKey = routeKey
    return
  }

  const gender = await getPersonGender(route.id)
  const currentRoute = routeInfo()
  if (!currentRoute || currentRoute.kind !== 'person' || currentRoute.id !== route.id) return

  const currentAvatar = document.querySelector<HTMLElement>('.detail-page .detail-hero .detail-avatar')
  if (!currentAvatar) return

  currentAvatar.innerHTML = gender === 'female' ? femaleIcon : gender === 'male' ? maleIcon : neutralIcon
  currentAvatar.classList.add('detail-avatar--icon')
  currentAvatar.classList.toggle('detail-avatar--female', gender === 'female')
  currentAvatar.classList.toggle('detail-avatar--male', gender === 'male')
  currentAvatar.setAttribute('aria-label', gender === 'female' ? 'أيقونة مستخدمة' : gender === 'male' ? 'أيقونة مستخدم' : 'أيقونة شخص')
  lastRouteKey = routeKey
}

function scheduleEnhance() {
  if (scheduled) return
  scheduled = true
  window.setTimeout(() => void enhanceDetailAvatar(), 0)
}

window.addEventListener('hashchange', () => {
  lastRouteKey = ''
  scheduleEnhance()
})

const observer = new MutationObserver(scheduleEnhance)
observer.observe(document.documentElement, { childList: true, subtree: true })
scheduleEnhance()
