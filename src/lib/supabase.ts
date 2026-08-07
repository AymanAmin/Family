import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const configuredKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

// The publishable key is intentionally safe for browser use. Authorization must
// always be enforced by Supabase RLS policies, not by hiding this value.
const fallbackPublishableKey = 'sb_publishable_hEgXfE49mamGngH0tIs8CA_P3QrKNYT'

export const supabaseConfiguration = {
  url: configuredUrl ?? '',
  publishableKey: configuredKey || fallbackPublishableKey,
  isComplete: Boolean(configuredUrl && (configuredKey || fallbackPublishableKey)),
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
