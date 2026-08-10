import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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
        // refresh, permission or connectivity failure. Only an explicit call
        // to auth.signOut() is allowed to remove the actual Supabase session.
        if (key === authStorageKey && explicitSignOutInProgress === 0) return
        window.localStorage.removeItem(key)
      },
    }
  : undefined

function protectSession(client: SupabaseClient): SupabaseClient {
  const originalSignOut = client.auth.signOut.bind(client.auth)
  client.auth.signOut = (async (...args: Parameters<typeof originalSignOut>) => {
    explicitSignOutInProgress += 1
    try {
      return await originalSignOut(...args)
    } finally {
      explicitSignOutInProgress = Math.max(0, explicitSignOutInProgress - 1)
    }
  }) as typeof client.auth.signOut

  const originalOnAuthStateChange = client.auth.onAuthStateChange.bind(client.auth)
  client.auth.onAuthStateChange = ((callback: Parameters<typeof originalOnAuthStateChange>[0]) =>
    originalOnAuthStateChange((event, session) => {
      // The application must not visually log a person out because an
      // operation was denied or the auth client emitted an unexpected
      // SIGNED_OUT event. A real logout is accepted only while the user-triggered
      // signOut() call above is running.
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
