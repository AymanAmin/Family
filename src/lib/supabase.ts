import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const configuredKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

// These public browser credentials may be visible in the compiled application.
// Database authorization must always be enforced by Supabase RLS policies.
const fallbackProjectUrl = 'https://rtmdaalabudycimnnena.supabase.co'
const fallbackPublishableKey = 'sb_publishable_hEgXfE49mamGngH0tIs8CA_P3QrKNYT'

const projectUrl = configuredUrl || fallbackProjectUrl
const publishableKey = configuredKey || fallbackPublishableKey

export const supabaseConfiguration = {
  url: projectUrl,
  publishableKey,
  isComplete: Boolean(projectUrl && publishableKey),
}

function projectRefFromUrl(url: string): string {
  try {
    return new URL(url).hostname.split('.')[0] || 'family'
  } catch {
    return 'family'
  }
}

const authStorageKey = `sb-${projectRefFromUrl(projectUrl)}-auth-token`
const SESSION_REFRESH_MARGIN_SECONDS = 90
let refreshInFlight: Promise<Session | null> | null = null

async function refreshSessionIfNeeded(client: SupabaseClient): Promise<Session | null> {
  const { data, error } = await client.auth.getSession()
  if (error || !data.session) return null

  const session = data.session
  const expiresAt = session.expires_at ?? 0
  const secondsRemaining = expiresAt - Math.floor(Date.now() / 1000)
  if (!expiresAt || secondsRemaining > SESSION_REFRESH_MARGIN_SECONDS) return session

  if (!refreshInFlight) {
    refreshInFlight = client.auth
      .refreshSession()
      .then(({ data: refreshed, error: refreshError }) => refreshError ? null : refreshed.session)
      .finally(() => {
        refreshInFlight = null
      })
  }

  return refreshInFlight
}

function protectSession(client: SupabaseClient): SupabaseClient {
  const originalOnAuthStateChange = client.auth.onAuthStateChange.bind(client.auth)
  let permissionChannel: ReturnType<SupabaseClient['channel']> | null = null
  let permissionChannelUserId = ''
  let permissionSignOutInProgress = false

  function removePermissionChannel() {
    const channel = permissionChannel
    permissionChannel = null
    permissionChannelUserId = ''
    if (channel) void client.removeChannel(channel)
  }

  async function subscribeToPermissionChanges(session: Session) {
    const userId = session.user.id
    if (!userId) return

    // Refresh private Realtime authorization whenever Supabase rotates the JWT.
    try {
      await client.realtime.setAuth(session.access_token)
    } catch {
      // Realtime reconnects automatically. A later auth event will retry setAuth.
    }

    if (permissionChannel && permissionChannelUserId === userId) return

    removePermissionChannel()
    const topic = `user:${userId}:permissions`
    const channel = client
      .channel(topic, { config: { private: true } })
      .on('broadcast', { event: 'permissions_changed' }, () => {
        if (permissionSignOutInProgress) return
        permissionSignOutInProgress = true

        // Only the user whose permissions changed is signed out on this device.
        // The private topic is unique to that user, so unrelated users/admins stay signed in.
        void client.auth.signOut({ scope: 'local' }).finally(() => {
          permissionSignOutInProgress = false
        })
      })

    permissionChannel = channel
    permissionChannelUserId = userId
    channel.subscribe()
  }

  // Do not suppress Supabase SIGNED_OUT events or block removal of the auth
  // storage key. A genuinely expired/revoked session must be allowed to refresh
  // or clear itself instead of leaving an expired JWT stuck in localStorage.
  originalOnAuthStateChange((event, session) => {
    if (session) void subscribeToPermissionChanges(session)
    if (event === 'SIGNED_OUT') removePermissionChannel()
  })

  if (typeof window !== 'undefined') {
    const refreshWhenActive = () => {
      void refreshSessionIfNeeded(client)
    }

    // PWAs/mobile browsers can suspend JavaScript while the JWT expires. Refresh
    // immediately when the app becomes usable again rather than letting the next
    // database request fail with "JWT expired".
    window.addEventListener('focus', refreshWhenActive)
    window.addEventListener('online', refreshWhenActive)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshWhenActive()
    })
  }

  return client
}

export const supabase: SupabaseClient | null = supabaseConfiguration.isComplete
  ? protectSession(createClient(supabaseConfiguration.url, supabaseConfiguration.publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: authStorageKey,
      },
    }))
  : null

export async function getFreshSession(): Promise<Session | null> {
  if (!supabase) return null
  return refreshSessionIfNeeded(supabase)
}

export function getApplicationUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}
