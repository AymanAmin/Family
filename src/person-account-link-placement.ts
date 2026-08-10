import { supabase } from './lib/supabase'
import './person-account-link-placement.css'

type ProfileLinkState = {
  role: string | null
  linked_person_id: string | null
}

type PersonLinkState = {
  is_verified: boolean | null
}

let scheduled = false
let requestId = 0

function routePersonId(): string | null {
  const match = window.location.hash.match(/^#\/person\/([^/?#]+)/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function scheduleSync(): void {
  if (scheduled) return
  scheduled = true
  window.setTimeout(() => {
    scheduled = false
    void syncAccountLinkPlacement()
  }, 35)
}

function hideCard(card: HTMLElement | null): void {
  if (card) card.hidden = true
}

async function syncAccountLinkPlacement(): Promise<void> {
  const personId = routePersonId()
  const page = document.querySelector<HTMLElement>('.detail-page')
  const hero = page?.querySelector<HTMLElement>('.detail-hero') ?? null
  const card = page?.querySelector<HTMLElement>('.link-account-card') ?? null

  if (!personId || !page || !hero || !card || !supabase) {
    hideCard(card)
    return
  }

  // Never show the claim action until both the current account and the opened
  // person have been checked. This prevents a brief incorrect flash.
  card.hidden = true
  const currentRequest = ++requestId

  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId || currentRequest !== requestId || routePersonId() !== personId) return

  const [profileResult, personResult, pendingResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('role,linked_person_id')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('people')
      .select('is_verified')
      .eq('id', personId)
      .maybeSingle(),
    supabase
      .from('account_link_requests')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle(),
  ])

  if (currentRequest !== requestId || routePersonId() !== personId) return

  const profile = (profileResult.data ?? null) as ProfileLinkState | null
  const person = (personResult.data ?? null) as PersonLinkState | null
  const role = profile?.role ?? ''
  const accountAlreadyVerified = Boolean(profile?.linked_person_id) || role === 'verified_member'
  const administrativeAccount = role === 'admin' || role === 'super_admin'
  const openedPersonAlreadyLinked = Boolean(person?.is_verified)
  const hasPendingRequest = Boolean(pendingResult.data)

  const eligible = Boolean(profile)
    && !accountAlreadyVerified
    && !administrativeAccount
    && !openedPersonAlreadyLinked
    && !hasPendingRequest
    && !profileResult.error
    && !personResult.error

  if (!eligible) {
    card.hidden = true
    return
  }

  card.classList.add('person-link-account-card')
  card.setAttribute('aria-label', 'ربط الحساب بهذا الشخص')

  // Keep the action immediately after the profile hero, before facts, family
  // information, relationships and the lineage sections.
  if (hero.nextElementSibling !== card) hero.insertAdjacentElement('afterend', card)
  card.hidden = false
}

window.addEventListener('hashchange', () => {
  requestId += 1
  scheduleSync()
})
window.addEventListener('popstate', scheduleSync)

if (supabase) {
  supabase.auth.onAuthStateChange(() => {
    requestId += 1
    scheduleSync()
  })
}

const observer = new MutationObserver(scheduleSync)
observer.observe(document.documentElement, { childList: true, subtree: true })
scheduleSync()
