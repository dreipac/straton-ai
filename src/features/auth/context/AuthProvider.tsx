import type { User } from '@supabase/supabase-js'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { hasSupabaseConfig } from '../../../config/env'
import { applyUiSettingsToDocument } from '../../settings/uiSettings'
import { AuthContext, type AuthContextValue } from './AuthContext'
import {
  ensureProfileForUserWithSessionRecovery,
  getCurrentSession,
  getUserFromSession,
  onAuthStateChange,
  replaceUiSettingsByUserId,
  signInWithEmailPassword,
  signOut,
  updateAiChatMemoryByUserId,
  updateAutoRemoveEmptyChatsByUserId,
  updateLanguageByUserId,
  completeChatOnboardingByUserId,
  markBetaNoticeSeenByUserId,
  updateAuthEmail,
  updateProfileNamesByUserId,
  uploadProfileAvatarByUserId,
  removeProfileAvatarByUserId,
  type UiSettingsV1,
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

  useEffect(() => {
    if (!user || !profile) {
      return
    }
    applyUiSettingsToDocument(profile.ui_settings)
  }, [user?.id, JSON.stringify(profile?.ui_settings)])

  async function signIn(email: string, password: string, rememberSession = true) {
    setError(null)
    await signInWithEmailPassword(email, password, rememberSession)
  }

  async function logout() {
    setError(null)
    await signOut()
  }

  async function refreshProfile() {
    if (!user) {
      setProfile(null)
      return
    }
    try {
      const nextProfile = await ensureProfileForUserWithSessionRecovery(user.id)
      if (!isMountedRef.current) {
        return
      }
      setProfile(nextProfile)
      setError(null)
    } catch (err) {
      if (!isMountedRef.current) {
        return
      }
      setError(err instanceof Error ? err.message : 'Profil konnte nicht aktualisiert werden.')
    }
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

  async function uploadProfileAvatar(file: File) {
    if (!user) {
      return
    }

    setError(null)
    const nextProfile = await uploadProfileAvatarByUserId(user.id, file)
    setProfile(nextProfile)
  }

  async function removeProfileAvatar() {
    if (!user) {
      return
    }

    setError(null)
    const nextProfile = await removeProfileAvatarByUserId(user.id)
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

  async function updateAiChatMemory(patch: {
    ai_chat_memory?: string | null
    ai_chat_memory_enabled?: boolean
  }) {
    if (!user) {
      return
    }

    setError(null)
    const nextProfile = await updateAiChatMemoryByUserId(user.id, patch)
    setProfile(nextProfile)
  }

  async function updateEmail(email: string) {
    if (!user) {
      return
    }

    setError(null)
    await updateAuthEmail(email)
    const session = await getCurrentSession()
    if (!isMountedRef.current) {
      return
    }
    setUser(getUserFromSession(session))
  }

  async function completeChatOnboarding() {
    if (!user) {
      return
    }

    setError(null)
    const nextProfile = await completeChatOnboardingByUserId(user.id)
    setProfile(nextProfile)
  }

  async function markBetaNoticeSeen() {
    if (!user) {
      return
    }

    setError(null)
    const nextProfile = await markBetaNoticeSeenByUserId(user.id)
    setProfile(nextProfile)
  }

  const updateUiSettings = useCallback(async (settings: UiSettingsV1) => {
    if (!user) {
      return
    }

    setError(null)
    const nextProfile = await replaceUiSettingsByUserId(user.id, settings)
    if (!isMountedRef.current) {
      return
    }
    setProfile(nextProfile)
  }, [user])

  const value: AuthContextValue = {
    user,
    profile,
    isLoading,
    error,
    isConfigured,
    signIn,
    logout,
    refreshProfile,
    updateAutoRemoveEmptyChats,
    updateProfileNames,
    uploadProfileAvatar,
    removeProfileAvatar,
    updateLanguage,
    updateEmail,
    completeChatOnboarding,
    markBetaNoticeSeen,
    updateUiSettings,
    updateAiChatMemory,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
