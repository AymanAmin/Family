import { supabase } from './lib/supabase'
import './account-verification-nudge.css'

type ProfileState = {
  role: string | null
  linked_person_id: string | null
}

let scheduled = false
let host: HTMLElement | null = null
let requestId = 0
let lastSignature = ''

function isAccountRoute(): boolean {
  return /^#\/account(?:[/?#]|$)/.test(window.location.hash)
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

function isPending(statusCard: HTMLElement): boolean {
  return statusCard.textContent?.includes('قيد المراجعة') ?? false
}

function renderNudge(statusCard: HTMLElement, pending: boolean): void {
  const signature = pending ? 'pending' : 'ready'
  if (host?.isConnected && lastSignature === signature) return

  removeHost()
  host = document.createElement('aside')
  host.className = `account-verification-nudge${pending ? ' pending' : ''}`
  host.setAttribute('aria-label', pending ? 'حالة توثيق الحساب' : 'طريقة توثيق الحساب')

  const icon = textElement('span', 'account-verification-icon', pending ? '⌛' : '✓')
  icon.setAttribute('aria-hidden', 'true')

  const copy = document.createElement('div')
  copy.className = 'account-verification-copy'
  copy.append(textElement('span', 'account-verification-kicker', pending ? 'طلب التوثيق' : 'وثّق حسابك'))

  if (pending) {
    copy.append(
      textElement('strong', '', 'طلب ربط حسابك قيد المراجعة'),
      textElement('p', '', 'لا تحتاج لأي إجراء الآن. سيتم توثيق الحساب تلقائيًا بعد اعتماد الربط.'),
    )
  } else {
    copy.append(
      textElement('strong', '', 'اربط حسابك بسجلك الشخصي'),
      textElement('p', '', 'ثلاث خطوات قصيرة فقط لتأكيد أن هذا السجل يخصك.'),
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
    button.addEventListener('click', () => {
      const nativeSearchButton = statusCard.querySelector<HTMLButtonElement>('button')
      if (nativeSearchButton) {
        nativeSearchButton.click()
        return
      }
      window.location.hash = '#/search'
    })
    host.append(button)
  }

  statusCard.insertAdjacentElement('afterend', host)
  lastSignature = signature
}

async function syncVerificationNudge(): Promise<void> {
  scheduled = false
  if (!isAccountRoute() || !supabase) {
    removeHost()
    return
  }

  const statusCard = document.querySelector<HTMLElement>('.account-page .account-status-card')
  if (!statusCard) return

  const currentRequest = ++requestId
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (currentRequest !== requestId || !isAccountRoute()) return
  if (!userId) {
    removeHost()
    return
  }

  const { data } = await supabase
    .from('profiles')
    .select('role,linked_person_id')
    .eq('id', userId)
    .maybeSingle()

  if (currentRequest !== requestId || !isAccountRoute()) return
  const profile = (data ?? null) as ProfileState | null
  const role = profile?.role ?? 'member'
  const isAdminRole = role === 'admin' || role === 'super_admin'
  const isVerified = Boolean(profile?.linked_person_id) || role === 'verified_member'

  if (isAdminRole || isVerified) {
    removeHost()
    return
  }

  renderNudge(statusCard, isPending(statusCard))
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
