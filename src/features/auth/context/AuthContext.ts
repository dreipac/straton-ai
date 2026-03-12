import type { User } from '@supabase/supabase-js'
import { createContext } from 'react'
import type { UserProfile } from '../services/auth.service'

export type AuthContextValue = {
  user: User | null
  profile: UserProfile | null
  isLoading: boolean
  error: string | null
  isConfigured: boolean
  signIn: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateAutoRemoveEmptyChats: (enabled: boolean) => Promise<void>
  updateProfileNames: (firstName: string, lastName: string) => Promise<void>
  updateLanguage: (language: 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE') => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
