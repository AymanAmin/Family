import { createClient } from 'npm:@supabase/supabase-js@2.110.9'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
const serviceRoleKey = secretKeys
  ? JSON.parse(secretKeys).default
  : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server restore configuration is incomplete.' }, 500)

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
    .select('id,role,account_status,is_primary_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) return json({ error: 'Unable to verify restore permission.' }, 500)
  if (!profile?.is_primary_admin || profile.role !== 'super_admin' || profile.account_status !== 'active') {
    return json({ error: 'Primary administrator permission is required.' }, 403)
  }

  let body: { snapshot?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON request.' }, 400)
  }

  const snapshot = body?.snapshot as Record<string, unknown> | undefined
  if (!snapshot || snapshot.backup_version !== 1 || snapshot.project_ref !== 'rtmdaalabudycimnnena' || snapshot.scope !== 'public_application_data') {
    return json({ error: 'Invalid or incompatible Family backup file.' }, 400)
  }

  const { data, error } = await admin.rpc('admin_restore_family_backup', {
    p_snapshot: snapshot,
    p_actor: user.id,
  })

  if (error) {
    console.error('admin-restore failed', error)
    return json({ error: error.message || 'Restore failed.' }, 400)
  }

  return json(data)
})
