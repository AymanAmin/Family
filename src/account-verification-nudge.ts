import { supabase } from './lib/supabase'
import './account-verification-nudge.css'

type ProfileState = {
  role: string | null
  linked_person_id: string | null
}

type LinkRequestState = {
  status: string | null
}

let scheduled = false
let host: HTMLElement | null = null
let requestId = 0
let lastSignature = ''

function isHomeRoute(): boolean {
  return /^#\/home(?:[/?#]|$)/.test(window.location.hash)
}

function removeHost(): void {
  host?.remove()
  host = null
  lastSignature = ''
}

function textElement<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  element.className = className
  element.textContent = text
  return element
}

function openPeopleDirectory(): void {
  const peopleButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.unified-home-stats button'))
    .find((button) => button.textContent?.includes('الأفراد'))

  if (peopleButton) {
    peopleButton.click()
    return
  }

  window.location.hash = '#/search'
  window.location.reload()
}

function renderNudge(anchor: HTMLElement, pending: boolean): void {
  const signature = pending ? 'pending' : 'ready'
  if (host?.isConnected && lastSignature === signature) return

  removeHost()
  host = document.createElement('aside')
  host.className = `account-verification-nudge home-verification-nudge${pending ? ' pending' : ''}`
  host.setAttribute('aria-label', pending ? 'حالة توثيق الحساب' : 'طريقة توثيق الحساب')

  const icon = textElement('span', 'account-verification-icon', pending ? '⌛' : '✓')
  icon.setAttribute('aria-hidden', 'true')

  const copy = document.createElement('div')
  copy.className = 'account-verification-copy'
  copy.append(textElement('span', 'account-verification-kicker', pending ? 'طلب التوثيق' : 'وثّق حسابك'))

  if (pending) {
    copy.append(
      textElement('strong', '', 'طلب توثيق حسابك قيد المراجعة'),
      textElement('p', '', 'لا تحتاج لأي إجراء الآن. سيتم ربط الحساب بسجلك بعد اعتماد الطلب.'),
    )
  } else {
    copy.append(
      textElement('strong', '', 'اربط حسابك بسجلك الشخصي'),
      textElement('p', '', 'لتأكيد هويتك ومعرفة أن هذا السجل يخصك.'),
    )

    const steps = document.createElement('div')
    steps.className = 'account-verification-steps'
    steps.append(
      textElement('span', '', '1 ابحث عن اسمك'),
      textElement('span', '', '2 افتح ملفك'),
      textElement('span', '', '3 اضغط «هذا أنا»'),
    )
    copy.append(steps)
  }

  host.append(icon, copy)

  if (!pending) {
    const button = textElement('button', 'account-verification-action', 'ابدأ التوثيق')
    button.type = 'button'
    button.addEventListener('click', openPeopleDirectory)
    host.append(button)
  }

  anchor.insertAdjacentElement('afterend', host)
  lastSignature = signature
}

async function syncVerificationNudge(): Promise<void> {
  scheduled = false
  if (!isHomeRoute() || !supabase) {
    removeHost()
    return
  }

  const anchor = document.querySelector<HTMLElement>('.home-search-hero')
  if (!anchor) return

  const currentRequest = ++requestId
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (currentRequest !== requestId || !isHomeRoute()) return
  if (!userId) {
    removeHost()
    return
  }

  const [profileResult, requestResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('role,linked_person_id')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('account_link_requests')
      .select('status')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (currentRequest !== requestId || !isHomeRoute()) return

  const profile = (profileResult.data ?? null) as ProfileState | null
  const latestRequest = (requestResult.data ?? null) as LinkRequestState | null
  const role = profile?.role ?? 'member'
  const isAdminRole = role === 'admin' || role === 'super_admin'
  const isVerified = Boolean(profile?.linked_person_id) || role === 'verified_member'

  if (isAdminRole || isVerified) {
    removeHost()
    return
  }

  renderNudge(anchor, latestRequest?.status === 'pending')
}

function scheduleSync(): void {
  if (scheduled) return
  scheduled = true
  window.setTimeout(() => {
    void syncVerificationNudge()
  }, 40)
}

window.addEventListener('hashchange', () => {
  requestId += 1
  removeHost()
  scheduleSync()
})
window.addEventListener('popstate', scheduleSync)

if (supabase) {
  supabase.auth.onAuthStateChange(() => {
    requestId += 1
    removeHost()
    scheduleSync()
  })
}

const observer = new MutationObserver(scheduleSync)
observer.observe(document.documentElement, { childList: true, subtree: true })
scheduleSync()
