import type { User } from '@supabase/supabase-js'
import {
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { hasSupabaseConfig } from '../../../config/env'
import { AuthContext, type AuthContextValue } from './AuthContext'
import {
  ensureProfileForUser,
  getCurrentSession,
  getUserFromSession,
  onAuthStateChange,
  signInWithEmailPassword,
  signOut,
  updateAutoRemoveEmptyChatsByUserId,
  updateLanguageByUserId,
  updateProfileNamesByUserId,
} from '../services/auth.service'

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<AuthContextValue['profile']>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isConfigured = hasSupabaseConfig()

  async function hydrateProfile(nextUser: User | null) {
    if (!nextUser) {
      setProfile(null)
      return
    }

    const nextProfile = await ensureProfileForUser(nextUser.id)
    setProfile(nextProfile)
  }

  useEffect(() => {
    if (!isConfigured) {
      setIsLoading(false)
      setError(
        'Supabase ist nicht konfiguriert. Setze VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY in der .env.',
      )
      return
    }

    let isMounted = true

    async function loadSession() {
      try {
        const session = await getCurrentSession()
        if (isMounted) {
          const nextUser = getUserFromSession(session)
          setUser(nextUser)
          void hydrateProfile(nextUser).catch((err) => {
            if (isMounted) {
              setError(err instanceof Error ? err.message : 'Profil konnte nicht geladen werden.')
            }
          })
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Session konnte nicht geladen werden.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadSession().catch(() => {
      // no-op, Zustand wird bereits im loadSession gesetzt
    })

    const subscription = onAuthStateChange((_event, session) => {
      const nextUser = getUserFromSession(session)
      setUser(nextUser)

      void hydrateProfile(nextUser).catch((err) => {
        setError(err instanceof Error ? err.message : 'Profil konnte nicht geladen werden.')
      })
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [isConfigured])

  useEffect(() => {
    const nextLanguage = profile?.language
    if (
      nextLanguage === 'de' ||
      nextLanguage === 'en' ||
      nextLanguage === 'hr' ||
      nextLanguage === 'it' ||
      nextLanguage === 'sq' ||
      nextLanguage === 'es-PE'
    ) {
      document.documentElement.lang = nextLanguage
      window.localStorage.setItem('straton-language', nextLanguage)
    }
  }, [profile?.language])

  async function signIn(email: string, password: string) {
    setError(null)
    await signInWithEmailPassword(email, password)
  }

  async function logout() {
    setError(null)
    await signOut()
  }

  async function updateAutoRemoveEmptyChats(enabled: boolean) {
    if (!user) {
      return
    }

    setError(null)
    const nextProfile = await updateAutoRemoveEmptyChatsByUserId(user.id, enabled)
    setProfile(nextProfile)
  }

  async function updateProfileNames(firstName: string, lastName: string) {
    if (!user) {
      return
    }

    setError(null)
    const nextProfile = await updateProfileNamesByUserId(user.id, firstName, lastName)
    setProfile(nextProfile)
  }

  async function updateLanguage(language: 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE') {
    if (!user) {
      return
    }

    setError(null)
    const nextProfile = await updateLanguageByUserId(user.id, language)
    setProfile(nextProfile)
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      isLoading,
      error,
      isConfigured,
      signIn,
      logout,
      updateAutoRemoveEmptyChats,
      updateProfileNames,
      updateLanguage,
    }),
    [user, profile, isLoading, error, isConfigured],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
