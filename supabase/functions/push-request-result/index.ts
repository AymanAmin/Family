import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
const secretKey = secretKeys
  ? JSON.parse(secretKeys).default
  : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

type AdminClient = ReturnType<typeof createClient>
type VapidConfig = { publicKey: string; privateKey: string; subject: string }
type RequestBody = {
  requesterId?: string
  status?: 'approved' | 'rejected'
  requestType?: string
  label?: string
  table?: string
  recordId?: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function loadVapidConfig(admin: AdminClient): Promise<VapidConfig | null> {
  const { data, error } = await admin.rpc('get_web_push_server_config')
  if (error) {
    console.error('Unable to read Web Push config', error)
    return null
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.public_key || !row?.private_key) return null
  return {
    publicKey: String(row.public_key),
    privateKey: String(row.private_key),
    subject: String(row.subject || 'mailto:admin@family.local'),
  }
}

async function loadInternalKey(admin: AdminClient) {
  const { data, error } = await admin.rpc('get_web_push_internal_key')
  if (error) {
    console.error('Unable to read internal Push key', error)
    return ''
  }
  return typeof data === 'string' ? data : ''
}

async function sendToUser(admin: AdminClient, userId: string, payload: string) {
  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth_key')
    .eq('user_id', userId)
    .eq('is_active', true)
  if (error) throw error
  if (!subscriptions?.length) return { sent: 0, removed: 0 }

  let sent = 0
  let removed = 0
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
      }, payload)
      sent += 1
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode || 0)
      if (statusCode === 404 || statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', subscription.id)
        removed += 1
      } else {
        console.error('Request-result Push failed', error)
      }
    }
  }
  return { sent, removed }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!supabaseUrl || !secretKey) return json({ error: 'Function configuration is incomplete' }, 500)

  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } })
  const expectedKey = await loadInternalKey(admin)
  const suppliedKey = req.headers.get('x-push-internal-key') || ''
  if (!expectedKey || suppliedKey !== expectedKey) return json({ error: 'Unauthorized' }, 401)

  const body = await req.json().catch(() => ({})) as RequestBody
  if (!body.requesterId || !body.status) return json({ error: 'Missing request result payload' }, 400)
  if (body.status !== 'approved' && body.status !== 'rejected') return json({ error: 'Unsupported status' }, 400)

  const vapid = await loadVapidConfig(admin)
  if (!vapid) return json({ error: 'Push configuration is not ready' }, 503)
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

  const approved = body.status === 'approved'
  const type = (body.requestType || 'طلب').trim()
  const label = (body.label || '').trim().slice(0, 100)
  const title = approved ? 'تم اعتماد طلبك ✅' : 'تم رفض طلبك'
  const text = approved
    ? (label ? `تم اعتماد طلب ${type}: ${label}` : `تم اعتماد طلب ${type} بنجاح.`)
    : (label ? `لم يتم اعتماد طلب ${type}: ${label}` : `لم يتم اعتماد طلب ${type}. افتح حسابك لمراجعة الحالة.`)

  const payload = JSON.stringify({
    title,
    body: text,
    icon: '/Family/icons/icon-192.png',
    badge: '/Family/icons/notification-badge.png',
    url: '/Family/#/account',
    tag: `request-result-${body.table || 'request'}-${body.recordId || Date.now()}`,
  })

  const result = await sendToUser(admin, body.requesterId, payload)
  return json({ ok: true, ...result })
})
