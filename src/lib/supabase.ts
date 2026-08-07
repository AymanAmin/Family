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

export const supabase: SupabaseClient | null = supabaseConfiguration.isComplete
  ? createClient(supabaseConfiguration.url, supabaseConfiguration.publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null

export function getApplicationUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}
