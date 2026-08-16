import { createClient } from 'npm:@supabase/supabase-js@2.110.9'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
const serviceRoleKey = secretKeys
  ? JSON.parse(secretKeys).default
  : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const BUCKET_ID = 'person-photos'
const PAGE_SIZE = 1000
const MAX_PHOTO_BYTES = 50 * 1024
const DEFAULT_QUOTA_BYTES = 1024 * 1024 * 1024

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function configuredQuotaBytes() {
  const value = Number(Deno.env.get('PERSON_PHOTO_STORAGE_QUOTA_BYTES') || DEFAULT_QUOTA_BYTES)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_QUOTA_BYTES
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server storage configuration is incomplete.' }, 500)

  const authorization = req.headers.get('Authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Authentication required.' }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userResult, error: userError } = await admin.auth.getUser(token)
  const user = userResult?.user
  if (userError || !user) return json({ error: 'Invalid session.' }, 401)

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role,account_status')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) return json({ error: 'Unable to verify storage permission.' }, 500)
  if (profile?.account_status !== 'active' || !['admin', 'super_admin'].includes(String(profile.role || ''))) {
    return json({ error: 'Administrator permission is required.' }, 403)
  }

  let usedBytes = 0
  let fileCount = 0
  let offset = 0

  try {
    while (true) {
      const { data, error } = await admin.storage.from(BUCKET_ID).list('', {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })

      if (error) throw error
      const page = data || []

      for (const item of page) {
        if (!item.id) continue
        const size = Number(item.metadata?.size || 0)
        if (Number.isFinite(size) && size > 0) usedBytes += size
        fileCount += 1
      }

      if (page.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }
  } catch (error) {
    console.error('admin-storage-usage failed', error)
    return json({ error: error instanceof Error ? error.message : 'Unable to calculate storage usage.' }, 500)
  }

  const quotaBytes = configuredQuotaBytes()
  const remainingBytes = Math.max(0, quotaBytes - usedBytes)
  const usedPercent = Math.min(100, (usedBytes / quotaBytes) * 100)
  const severity = usedPercent >= 95 ? 'critical' : usedPercent >= 85 ? 'danger' : usedPercent >= 70 ? 'warning' : 'normal'

  return json({
    bucket: BUCKET_ID,
    used_bytes: usedBytes,
    file_count: fileCount,
    quota_bytes: quotaBytes,
    used_percent: Number(usedPercent.toFixed(2)),
    remaining_bytes: remainingBytes,
    estimated_remaining_photos_at_50kb: Math.floor(remainingBytes / MAX_PHOTO_BYTES),
    max_photo_bytes: MAX_PHOTO_BYTES,
    severity,
    checked_at: new Date().toISOString(),
  })
})
