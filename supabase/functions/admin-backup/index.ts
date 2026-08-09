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

const PAGE_SIZE = 1000

const BACKUP_TABLES = [
  'families',
  'people',
  'person_relationships',
  'person_family_memberships',
  'family_units',
  'lineages',
  'lineage_branches',
  'person_scope_affiliations',
  'events',
  'event_people',
  'account_link_requests',
  'content_edit_requests',
  'relationship_change_requests',
  'family_moderator_assignments',
  'moderator_scope_assignments',
  'profiles',
  'push_subscriptions',
  'platform_stats',
  'site_visitors',
] as const

type BackupRow = Record<string, unknown>
type BackupTables = Record<string, BackupRow[]>

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

async function readAllRows(admin: ReturnType<typeof createClient>, table: string) {
  const rows: BackupRow[] = []
  let offset = 0

  while (true) {
    const { data, error } = await admin
      .from(table)
      .select('*')
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`${table}: ${error.message}`)

    const page = (data || []) as BackupRow[]
    rows.push(...page)

    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return rows
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server backup configuration is incomplete.' }, 500)

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

  if (profileError) return json({ error: 'Unable to verify backup permission.' }, 500)
  if (!profile?.is_primary_admin || profile.role !== 'super_admin' || profile.account_status !== 'active') {
    return json({ error: 'Primary administrator permission is required.' }, 403)
  }

  const tables: BackupTables = {}
  const rowCounts: Record<string, number> = {}

  try {
    for (const table of BACKUP_TABLES) {
      const rows = await readAllRows(admin, table)
      tables[table] = rows
      rowCounts[table] = rows.length
    }
  } catch (error) {
    console.error('admin-backup failed', error)
    return json({ error: error instanceof Error ? error.message : 'Backup failed.' }, 500)
  }

  const totalRows = Object.values(rowCounts).reduce((sum, value) => sum + value, 0)

  return json({
    backup_version: 1,
    generated_at: new Date().toISOString(),
    project_ref: 'rtmdaalabudycimnnena',
    scope: 'public_application_data',
    table_order: BACKUP_TABLES,
    row_counts: rowCounts,
    total_rows: totalRows,
    tables,
  })
})
