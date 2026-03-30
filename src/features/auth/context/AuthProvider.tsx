import type { User } from '@supabase/supabase-js'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { hasSupabaseConfig } from '../../../config/env'
import { AuthContext, type AuthContextValue } from './AuthContext'
import {
  ensureProfileForUserWithSessionRecovery,
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
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!isConfigured) {
      setIsLoading(false)
      setError(
        'Supabase ist nicht konfiguriert. Setze VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY in der .env.',
      )
      return
    }

    async function loadSession() {
      try {
        const session = await getCurrentSession()
        if (!isMountedRef.current) {
          return
        }
        const nextUser = getUserFromSession(session)
        setUser(nextUser)
        if (nextUser) {
          try {
            const nextProfile = await ensureProfileForUserWithSessionRecovery(nextUser.id)
            if (!isMountedRef.current) {
              return
            }
            setProfile(nextProfile)
            setError(null)
          } catch (err) {
            if (!isMountedRef.current) {
              return
            }
            setError(err instanceof Error ? err.message : 'Profil konnte nicht geladen werden.')
          }
        } else {
          setProfile(null)
        }
      } catch (err) {
        if (!isMountedRef.current) {
          return
        }
        setError(err instanceof Error ? err.message : 'Session konnte nicht geladen werden.')
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false)
        }
      }
    }

    loadSession().catch(() => {
      // Zustand wird bereits in loadSession gesetzt
    })

    const subscription = onAuthStateChange((_event, session) => {
      const nextUser = getUserFromSession(session)
      setUser(nextUser)
      if (!nextUser) {
        setProfile(null)
        setError(null)
        return
      }

      void (async () => {
        try {
          const nextProfile = await ensureProfileForUserWithSessionRecovery(nextUser.id)
          if (!isMountedRef.current) {
            return
          }
          setProfile(nextProfile)
          setError(null)
        } catch (err) {
          if (!isMountedRef.current) {
            return
          }
          setError(err instanceof Error ? err.message : 'Profil konnte nicht geladen werden.')
        }
      })()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [isConfigured])

  useEffect(() => {
    if (!isConfigured) {
      return
    }

    function onVisible() {
      if (document.visibilityState !== 'visible') {
        return
      }
      void (async () => {
        try {
          const session = await getCurrentSession()
          if (!isMountedRef.current) {
            return
          }
          const nextUser = getUserFromSession(session)
          setUser(nextUser)
          if (nextUser) {
            try {
              const nextProfile = await ensureProfileForUserWithSessionRecovery(nextUser.id)
              if (!isMountedRef.current) {
                return
              }
              setProfile(nextProfile)
              setError(null)
            } catch (err) {
              if (!isMountedRef.current) {
                return
              }
              setError(err instanceof Error ? err.message : 'Profil konnte nicht geladen werden.')
            }
          } else {
            setProfile(null)
            setError(null)
          }
        } catch (err) {
          if (!isMountedRef.current) {
            return
          }
          setError(err instanceof Error ? err.message : 'Session konnte nicht synchronisiert werden.')
        }
      })()
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
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
