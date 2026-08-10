import { supabase } from './lib/supabase'

type Attribution = {
  user_id: string | null
  display_name: string
  email: string | null
  role: string
  created_at: string
}

let scheduled = false
let activePersonId = ''
let host: HTMLElement | null = null
let requestId = 0
let cachedUserId = ''
let cachedAdminAccess: boolean | null = null

function personIdFromRoute(): string {
  const match = window.location.hash.match(/^#\/person\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function removeHost(): void {
  host?.remove()
  host = null
  activePersonId = ''
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date(value))
}

function addTextElement<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  element.className = className
  element.textContent = text
  return element
}

function renderLoading(target: HTMLElement): void {
  target.replaceChildren()
  target.append(
    addTextElement('span', 'admin-person-attribution-icon', '✓'),
    (() => {
      const copy = document.createElement('div')
      copy.className = 'admin-person-attribution-copy'
      copy.append(
        addTextElement('span', '', 'للمدراء فقط'),
        addTextElement('strong', '', 'جارٍ قراءة سجل الإضافة…'),
      )
      return copy
    })(),
  )
}

function renderAttribution(target: HTMLElement, row: Attribution | null): void {
  target.replaceChildren()
  const icon = addTextElement('span', 'admin-person-attribution-icon', '✓')
  icon.setAttribute('aria-hidden', 'true')

  const copy = document.createElement('div')
  copy.className = 'admin-person-attribution-copy'
  copy.append(addTextElement('span', '', 'للمدراء فقط'))

  const line = document.createElement('strong')
  if (row) {
    line.append(document.createTextNode('أضيف بواسطة '))
    line.append(addTextElement('b', '', row.display_name || 'مستخدم مسجل'))
  } else {
    line.textContent = 'تعذر تحديد مُضيف السجل'
  }
  copy.append(line)

  target.append(icon, copy)
  if (row?.created_at) {
    const time = addTextElement('time', '', formatDate(row.created_at))
    time.dateTime = row.created_at
    target.append(time)
  }
}

async function hasAdminAccess(): Promise<boolean> {
  if (!supabase) return false
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id || ''
  if (!userId) {
    cachedUserId = ''
    cachedAdminAccess = false
    return false
  }

  if (cachedUserId === userId && cachedAdminAccess !== null) return cachedAdminAccess

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  cachedUserId = userId
  cachedAdminAccess = data?.role === 'admin' || data?.role === 'super_admin'
  return cachedAdminAccess
}

async function syncAttribution(): Promise<void> {
  scheduled = false
  const personId = personIdFromRoute()
  if (!personId) {
    removeHost()
    return
  }

  const hero = document.querySelector<HTMLElement>('.detail-page .detail-hero')
  if (!hero) return

  if (activePersonId === personId && host?.isConnected) return

  const currentRequest = ++requestId
  const allowed = await hasAdminAccess()
  if (currentRequest !== requestId || personIdFromRoute() !== personId) return
  if (!allowed) {
    removeHost()
    return
  }

  removeHost()
  host = document.createElement('aside')
  host.className = 'admin-person-attribution'
  host.setAttribute('aria-label', 'معلومة إدارية عن إضافة الشخص')
  hero.insertAdjacentElement('afterend', host)
  activePersonId = personId
  renderLoading(host)

  if (!supabase) return
  const { data, error } = await supabase.rpc('get_admin_person_creator_attribution', { p_person_id: personId })
  if (currentRequest !== requestId || personIdFromRoute() !== personId || !host?.isConnected) return

  const first = !error && Array.isArray(data) ? (data[0] as Attribution | undefined) : undefined
  renderAttribution(host, first ?? null)
}

function scheduleSync(): void {
  if (scheduled) return
  scheduled = true
  window.setTimeout((): void => {
    void syncAttribution()
  }, 30)
}

window.addEventListener('hashchange', (): void => {
  requestId += 1
  removeHost()
  scheduleSync()
})
window.addEventListener('popstate', scheduleSync)

if (supabase) {
  supabase.auth.onAuthStateChange(() => {
    cachedUserId = ''
    cachedAdminAccess = null
    requestId += 1
    removeHost()
    scheduleSync()
  })
}

const observer = new MutationObserver((): void => {
  scheduleSync()
})
observer.observe(document.documentElement, { childList: true, subtree: true })
scheduleSync()
