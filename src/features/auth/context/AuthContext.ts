import type { User } from '@supabase/supabase-js'
import { createContext } from 'react'
import type { UiSettingsV1, UserProfile } from '../services/auth.service'

export type AuthContextValue = {
  user: User | null
  profile: UserProfile | null
  isLoading: boolean
  error: string | null
  isConfigured: boolean
  signIn: (email: string, password: string, rememberSession?: boolean) => Promise<void>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
  updateAutoRemoveEmptyChats: (enabled: boolean) => Promise<void>
  updateProfileNames: (firstName: string, lastName: string) => Promise<void>
  updateLanguage: (language: 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE') => Promise<void>
  updateEmail: (email: string) => Promise<void>
  /** Chat-Einstiegs-Tour als abgeschlossen in Supabase speichern */
  completeChatOnboarding: () => Promise<void>
  /** Beta-Hinweis als gesehen markieren */
  markBetaNoticeSeen: () => Promise<void>
  /** Oberflächen-Einstellungen (Theme, Paletten, …) in profiles.ui_settings speichern */
  updateUiSettings: (settings: UiSettingsV1) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
