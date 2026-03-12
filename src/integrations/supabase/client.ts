import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, hasSupabaseConfig } from '../../config/env'

let client: SupabaseClient | null = null

export function getSupabaseClient() {
  if (!hasSupabaseConfig()) {
    throw new Error(
      'Supabase ist nicht konfiguriert. Bitte VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY setzen.',
    )
  }

  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  }

  return client
}
