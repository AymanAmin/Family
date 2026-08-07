import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const publishableKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
const publishableKey = publishableKeys
  ? JSON.parse(publishableKeys).default
  : Deno.env.get('SUPABASE_ANON_KEY') || ''
const secretKey = secretKeys
  ? JSON.parse(secretKeys).default
  : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || ''
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function notificationPayload(title: string, body: string, url = '/Family/#/account') {
  return JSON.stringify({
    title,
    body,
    icon: '/Family/icons/icon-192.png',
    badge: '/Family/icons/icon-192.png',
    url,
    tag: 'family-status',
  })
}

async function sendToUser(admin: ReturnType<typeof createClient>, userId: string, payload: string) {
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
        console.error('push send failed', error)
      }
    }
  }

  return { sent, removed }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  if (!supabaseUrl || !publishableKey || !secretKey) return json({ error: 'Supabase function configuration is incomplete' }, 500)

  const authorization = req.headers.get('Authorization') || ''
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } })

  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: 'Unauthorized' }, 401)

  const requestBody = await req.json().catch(() => ({})) as {
    action?: string
    table?: string
    recordId?: string
    status?: 'approved' | 'rejected'
  }
  const action = requestBody.action || ''

  if (action === 'public-key') {
    if (!vapidPublicKey) return json({ error: 'VAPID_PUBLIC_KEY is not configured' }, 503)
    return json({ publicKey: vapidPublicKey })
  }

  if (!vapidPublicKey || !vapidPrivateKey) return json({ error: 'Push secrets are not configured' }, 503)
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  if (action === 'self-test') {
    const result = await sendToUser(
      admin,
      user.id,
      notificationPayload('إشعارات صلة تعمل', 'تم تفعيل الإشعارات على هذا الجهاز بنجاح.'),
    )
    return json({ ok: true, ...result })
  }

  if (action !== 'record-status') return json({ error: 'Unsupported action' }, 400)
  if (!requestBody.table || !requestBody.recordId || !requestBody.status) return json({ error: 'Missing moderation payload' }, 400)

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const allowedRoles = new Set(['family_moderator', 'content_moderator', 'admin', 'super_admin'])
  if (!callerProfile || !allowedRoles.has(callerProfile.role)) return json({ error: 'Forbidden' }, 403)

  const table = requestBody.table
  const allowedTables = new Set(['families', 'people', 'events', 'person_relationships', 'account_link_requests'])
  if (!allowedTables.has(table)) return json({ error: 'Unsupported table' }, 400)

  let recipientUserId = ''
  if (table === 'account_link_requests') {
    const { data } = await admin.from(table).select('user_id').eq('id', requestBody.recordId).maybeSingle()
    recipientUserId = data?.user_id || ''
  } else {
    const { data } = await admin.from(table).select('created_by').eq('id', requestBody.recordId).maybeSingle()
    recipientUserId = data?.created_by || ''
  }

  if (!recipientUserId) return json({ ok: true, sent: 0, reason: 'No recipient' })

  const approved = requestBody.status === 'approved'
  const title = approved ? 'تم اعتماد طلبك' : 'تم رفض طلبك'
  const body = approved
    ? 'تمت مراجعة الإضافة واعتمادها في صلة المنطقة.'
    : 'تمت مراجعة الإضافة ولم يتم اعتمادها. افتح حسابك لمراجعة الحالة.'

  const result = await sendToUser(admin, recipientUserId, notificationPayload(title, body))
  return json({ ok: true, ...result })
})
