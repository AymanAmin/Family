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
let explicitSignOutInProgress = 0

const guardedAuthStorage = typeof window !== 'undefined'
  ? {
      getItem(key: string) {
        return window.localStorage.getItem(key)
      },
      setItem(key: string, value: string) {
        window.localStorage.setItem(key, value)
      },
      removeItem(key: string) {
        // Never destroy the persisted login because of a transient auth,
        // refresh, permission or connectivity failure. The real Supabase
        // session may be removed only by an app-controlled signOut(): either
        // the user's own logout action or the targeted permission-change flow.
        if (key === authStorageKey && explicitSignOutInProgress === 0) return
        window.localStorage.removeItem(key)
      },
    }
  : undefined

function protectSession(client: SupabaseClient): SupabaseClient {
  const originalSignOut = client.auth.signOut.bind(client.auth)
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

    // Refresh the private Realtime authorization whenever the access token changes.
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

        // This is intentionally a local sign-out. Every active device for the
        // affected user listens to the same private topic, so each device logs
        // itself out without touching the administrator or any other account.
        void client.auth.signOut({ scope: 'local' }).finally(() => {
          permissionSignOutInProgress = false
        })
      })

    permissionChannel = channel
    permissionChannelUserId = userId
    channel.subscribe()
  }

  client.auth.signOut = (async (...args: Parameters<typeof originalSignOut>) => {
    explicitSignOutInProgress += 1
    try {
      return await originalSignOut(...args)
    } finally {
      explicitSignOutInProgress = Math.max(0, explicitSignOutInProgress - 1)
    }
  }) as typeof client.auth.signOut

  // Internal listener: keep one private permission channel attached to the
  // currently authenticated user. Supabase Database broadcasts only to this
  // user's topic when their effective role/scope is changed.
  originalOnAuthStateChange((event, session) => {
    if (session) void subscribeToPermissionChanges(session)
    if (event === 'SIGNED_OUT' && explicitSignOutInProgress > 0) removePermissionChannel()
  })

  client.auth.onAuthStateChange = ((callback: Parameters<typeof originalOnAuthStateChange>[0]) =>
    originalOnAuthStateChange((event, session) => {
      // Permission errors, failed operations, refresh issues and unrelated
      // unexpected SIGNED_OUT events must never visually log the user out.
      // We accept SIGNED_OUT only while an app-controlled signOut() is running:
      // manual logout or the targeted permission-change notification above.
      if (event === 'SIGNED_OUT' && explicitSignOutInProgress === 0) return
      callback(event, session)
    })) as typeof client.auth.onAuthStateChange

  return client
}

export const supabase: SupabaseClient | null = supabaseConfiguration.isComplete
  ? protectSession(createClient(supabaseConfiguration.url, supabaseConfiguration.publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: authStorageKey,
        storage: guardedAuthStorage,
      },
    }))
  : null

export function getApplicationUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}
