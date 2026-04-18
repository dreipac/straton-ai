import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, hasSupabaseConfig } from '../../config/env'

/** Persistente UX-Präferenz („Login merken“), ohne Session-Tokens */
const LOGIN_REMEMBER_PREF_KEY = 'straton-login-remember'

/** @returns true wenn kein Wert gesetzt (bisheriges Verhalten: Session in localStorage) */
export function getLoginRememberPreference(): boolean {
  if (typeof window === 'undefined') {
    return true
  }
  const v = window.localStorage.getItem(LOGIN_REMEMBER_PREF_KEY)
  if (v === null) {
    return true
  }
  return v === '1'
}

export function setLoginRememberPreference(remember: boolean): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(LOGIN_REMEMBER_PREF_KEY, remember ? '1' : '0')
}

function clearSupabaseAuthKeys(storage: Storage): void {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k?.startsWith('sb-')) {
      keys.push(k)
    }
  }
  for (const k of keys) {
    storage.removeItem(k)
  }
}

/**
 * Vor {@link signInWithPassword}: Zielspeicher setzen und veraltete Tokens
 * im jeweils anderen Speicher entfernen (damit keine doppelte Session bleibt).
 */
export function prepareAuthStorageForSignIn(rememberSession: boolean): void {
  setLoginRememberPreference(rememberSession)
  if (rememberSession) {
    clearSupabaseAuthKeys(sessionStorage)
  } else {
    clearSupabaseAuthKeys(localStorage)
  }
}

const loginAwareAuthStorage = {
  getItem(key: string): string | null {
    const primary = getLoginRememberPreference() ? localStorage : sessionStorage
    return primary.getItem(key)
  },
  setItem(key: string, value: string): void {
    const useLocal = getLoginRememberPreference()
    const primary = useLocal ? localStorage : sessionStorage
    const secondary = useLocal ? sessionStorage : localStorage
    secondary.removeItem(key)
    primary.setItem(key, value)
  },
  removeItem(key: string): void {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}

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
        storage: loginAwareAuthStorage,
      },
    })
  }

  return client
}
