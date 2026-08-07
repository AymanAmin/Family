import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-push-internal-key',
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

const envVapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || ''
const envVapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const envVapidSubject = Deno.env.get('VAPID_SUBJECT') || ''

type AdminClient = ReturnType<typeof createClient>
type VapidConfig = { publicKey: string; privateKey: string; subject: string }
type PendingContext = {
  familyId: string
  requesterId: string
  typeLabel: string
  label: string
}

type RequestBody = {
  action?: string
  table?: string
  recordId?: string
  status?: 'approved' | 'rejected'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function notificationPayload(title: string, body: string, url = '/Family/#/account', tag = 'family-status') {
  return JSON.stringify({
    title,
    body,
    icon: '/Family/icons/icon-192.png',
    badge: '/Family/icons/icon-192.png',
    url,
    tag,
  })
}

async function loadVapidConfig(admin: AdminClient): Promise<VapidConfig | null> {
  if (envVapidPublicKey && envVapidPrivateKey) {
    return {
      publicKey: envVapidPublicKey,
      privateKey: envVapidPrivateKey,
      subject: envVapidSubject || 'mailto:admin@family.local',
    }
  }

  const { data, error } = await admin.rpc('get_web_push_server_config')
  if (error) {
    console.error('Unable to read Web Push server config', error)
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

async function loadInternalWebhookKey(admin: AdminClient): Promise<string> {
  const { data, error } = await admin.rpc('get_web_push_internal_key')
  if (error) {
    console.error('Unable to read internal Push webhook key', error)
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
        console.error('push send failed', error)
      }
    }
  }

  return { sent, removed }
}

async function sendToUsers(admin: AdminClient, userIds: string[], payload: string) {
  let sent = 0
  let removed = 0
  for (const userId of [...new Set(userIds.filter(Boolean))]) {
    const result = await sendToUser(admin, userId, payload)
    sent += result.sent
    removed += result.removed
  }
  return { sent, removed }
}

async function getPerson(admin: AdminClient, personId: string) {
  if (!personId) return null
  const { data } = await admin
    .from('people')
    .select('id,full_name,family_id')
    .eq('id', personId)
    .maybeSingle()
  return data || null
}

async function resolveEntityFamily(admin: AdminClient, entityType: string, recordId: string) {
  if (!recordId) return { familyId: '', label: '' }
  const normalized = entityType.toLowerCase()

  if (normalized === 'person' || normalized === 'people') {
    const person = await getPerson(admin, recordId)
    return { familyId: person?.family_id || '', label: person?.full_name || '' }
  }

  if (normalized === 'family' || normalized === 'families') {
    const { data } = await admin.from('families').select('id,name').eq('id', recordId).maybeSingle()
    return { familyId: data?.id || '', label: data?.name || '' }
  }

  if (normalized === 'event' || normalized === 'events') {
    const { data } = await admin.from('events').select('family_id,title').eq('id', recordId).maybeSingle()
    return { familyId: data?.family_id || '', label: data?.title || '' }
  }

  if (normalized === 'relationship' || normalized === 'person_relationships') {
    const { data } = await admin
      .from('person_relationships')
      .select('source_person_id,target_person_id')
      .eq('id', recordId)
      .maybeSingle()
    const source = await getPerson(admin, data?.source_person_id || '')
    const target = await getPerson(admin, data?.target_person_id || '')
    return {
      familyId: source?.family_id || target?.family_id || '',
      label: [source?.full_name, target?.full_name].filter(Boolean).join(' — '),
    }
  }

  return { familyId: '', label: '' }
}

async function getPendingContext(admin: AdminClient, table: string, recordId: string): Promise<PendingContext | null> {
  if (!table || !recordId) return null

  if (table === 'families') {
    const { data } = await admin.from('families').select('id,name,status,created_by').eq('id', recordId).maybeSingle()
    if (!data || data.status !== 'pending') return null
    return { familyId: data.id, requesterId: data.created_by || '', typeLabel: 'عائلة', label: data.name || '' }
  }

  if (table === 'people') {
    const { data } = await admin.from('people').select('full_name,family_id,status,created_by').eq('id', recordId).maybeSingle()
    if (!data || data.status !== 'pending') return null
    return { familyId: data.family_id || '', requesterId: data.created_by || '', typeLabel: 'شخص', label: data.full_name || '' }
  }

  if (table === 'events') {
    const { data } = await admin.from('events').select('title,family_id,status,created_by').eq('id', recordId).maybeSingle()
    if (!data || data.status !== 'pending') return null
    return { familyId: data.family_id || '', requesterId: data.created_by || '', typeLabel: 'مناسبة', label: data.title || '' }
  }

  if (table === 'person_family_memberships') {
    const { data } = await admin
      .from('person_family_memberships')
      .select('person_id,family_id,status,created_by')
      .eq('id', recordId)
      .maybeSingle()
    if (!data || data.status !== 'pending') return null
    const person = await getPerson(admin, data.person_id || '')
    return { familyId: data.family_id || person?.family_id || '', requesterId: data.created_by || '', typeLabel: 'عضوية عائلة', label: person?.full_name || '' }
  }

  if (table === 'person_relationships') {
    const { data } = await admin
      .from('person_relationships')
      .select('source_person_id,target_person_id,relation_type,status,created_by')
      .eq('id', recordId)
      .maybeSingle()
    if (!data || data.status !== 'pending') return null
    const source = await getPerson(admin, data.source_person_id || '')
    const target = await getPerson(admin, data.target_person_id || '')
    return {
      familyId: source?.family_id || target?.family_id || '',
      requesterId: data.created_by || '',
      typeLabel: 'صلة قرابة',
      label: [source?.full_name, target?.full_name].filter(Boolean).join(' — '),
    }
  }

  if (table === 'account_link_requests') {
    const { data } = await admin
      .from('account_link_requests')
      .select('user_id,person_id,status')
      .eq('id', recordId)
      .maybeSingle()
    if (!data || data.status !== 'pending') return null
    const person = await getPerson(admin, data.person_id || '')
    return { familyId: person?.family_id || '', requesterId: data.user_id || '', typeLabel: 'ربط حساب', label: person?.full_name || '' }
  }

  if (table === 'content_edit_requests') {
    const { data } = await admin
      .from('content_edit_requests')
      .select('entity_type,record_id,requested_by,status')
      .eq('id', recordId)
      .maybeSingle()
    if (!data || data.status !== 'pending') return null
    const entity = await resolveEntityFamily(admin, data.entity_type || '', data.record_id || '')
    return { familyId: entity.familyId, requesterId: data.requested_by || '', typeLabel: 'تعديل بيانات', label: entity.label }
  }

  if (table === 'relationship_change_requests') {
    const { data } = await admin
      .from('relationship_change_requests')
      .select('source_person_id,target_person_id,source_name,target_name,requested_by,action,status')
      .eq('id', recordId)
      .maybeSingle()
    if (!data || data.status !== 'pending') return null
    const source = await getPerson(admin, data.source_person_id || '')
    const target = await getPerson(admin, data.target_person_id || '')
    return {
      familyId: source?.family_id || target?.family_id || '',
      requesterId: data.requested_by || '',
      typeLabel: data.action === 'delete' ? 'حذف صلة' : 'تعديل صلة',
      label: [data.source_name || source?.full_name, data.target_name || target?.full_name].filter(Boolean).join(' — '),
    }
  }

  return null
}

async function eligibleModeratorIds(admin: AdminClient, familyId = '', requesterId = '', includeAllFamilyModerators = false) {
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id,role,is_primary_admin,account_status')
    .eq('account_status', 'active')
  if (error) throw error

  const globalRoles = new Set(['super_admin', 'admin', 'content_moderator'])
  const ids = new Set<string>()
  for (const profile of profiles || []) {
    if (profile.is_primary_admin || globalRoles.has(profile.role) || (includeAllFamilyModerators && profile.role === 'family_moderator')) {
      ids.add(profile.id)
    }
  }

  if (familyId) {
    const { data: assignments, error: assignmentError } = await admin
      .from('family_moderator_assignments')
      .select('user_id')
      .eq('family_id', familyId)
    if (assignmentError) throw assignmentError
    for (const assignment of assignments || []) ids.add(assignment.user_id)
  }

  if (requesterId) ids.delete(requesterId)
  return [...ids]
}

async function handleInternalAction(admin: AdminClient, vapid: VapidConfig, body: RequestBody, req: Request) {
  const expectedKey = await loadInternalWebhookKey(admin)
  const suppliedKey = req.headers.get('x-push-internal-key') || ''
  if (!expectedKey || suppliedKey !== expectedKey) return json({ error: 'Unauthorized internal request' }, 401)

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

  if (body.action === 'new-pending-request') {
    const context = await getPendingContext(admin, body.table || '', body.recordId || '')
    if (!context) return json({ ok: true, sent: 0, reason: 'Record is no longer pending or unsupported' })

    const recipients = await eligibleModeratorIds(admin, context.familyId, context.requesterId)
    const shortLabel = context.label.trim().slice(0, 110)
    const message = shortLabel
      ? `وصل طلب ${context.typeLabel} جديد: ${shortLabel}`
      : `وصل طلب ${context.typeLabel} جديد ويحتاج مراجعتك.`
    const result = await sendToUsers(
      admin,
      recipients,
      notificationPayload('طلب جديد بانتظار الاعتماد', message, '/Family/#/admin', `pending-${body.table}-${body.recordId}`),
    )
    return json({ ok: true, recipients: recipients.length, ...result })
  }

  if (body.action === 'pending-system-test') {
    const recipients = await eligibleModeratorIds(admin, '', '', true)
    const result = await sendToUsers(
      admin,
      recipients,
      notificationPayload('إشعارات الطلبات الجديدة تعمل', 'سيصلك إشعار فور وصول طلب جديد يحتاج الاعتماد.', '/Family/#/admin', 'pending-system-test'),
    )
    return json({ ok: true, recipients: recipients.length, ...result })
  }

  return json({ error: 'Unsupported internal action' }, 400)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!supabaseUrl || !publishableKey || !secretKey) return json({ error: 'Supabase function configuration is incomplete' }, 500)

  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } })
  const requestBody = await req.json().catch(() => ({})) as RequestBody
  const action = requestBody.action || ''
  const vapid = await loadVapidConfig(admin)
  if (!vapid) return json({ error: 'Push configuration is not ready' }, 503)

  if (action === 'new-pending-request' || action === 'pending-system-test') {
    return await handleInternalAction(admin, vapid, requestBody, req)
  }

  // All browser/user actions still require and validate a normal Supabase JWT.
  const authorization = req.headers.get('Authorization') || ''
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: 'Unauthorized' }, 401)

  if (action === 'public-key') return json({ publicKey: vapid.publicKey })

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

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
    .select('role,is_primary_admin')
    .eq('id', user.id)
    .maybeSingle()

  const allowedRoles = new Set(['family_moderator', 'content_moderator', 'admin', 'super_admin'])
  if (!callerProfile || (!callerProfile.is_primary_admin && !allowedRoles.has(callerProfile.role))) return json({ error: 'Forbidden' }, 403)

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
