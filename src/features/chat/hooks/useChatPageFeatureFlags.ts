import { useEffect, useState } from 'react'
import type { UserProfile } from '../../auth/services/auth.service'
import { getAppFeatureFlags } from '../../auth/services/appFeatureFlags.service'
import {
  clearGeminiInstantEnabledCache,
  setGeminiInstantEnabledFromSupabase,
} from '../services/geminiInstantFlag'

type UseChatPageFeatureFlagsArgs = {
  user: { id: string } | null
  profile: UserProfile | null
  isLoading: boolean
}

export function useChatPageFeatureFlags({ user, profile, isLoading }: UseChatPageFeatureFlagsArgs) {
  const [learnPathsEnabled, setLearnPathsEnabled] = useState(true)
  const [learnPathCreateEnabled, setLearnPathCreateEnabled] = useState(true)
  const [instantAnalyzeDebugEnabled, setInstantAnalyzeDebugEnabled] = useState(false)
  const [chatFoldersFeatureEnabled, setChatFoldersFeatureEnabled] = useState(true)
  const [showBetaNoticeOnFirstLogin, setShowBetaNoticeOnFirstLogin] = useState(true)

  useEffect(() => {
    if (!user) {
      clearGeminiInstantEnabledCache()
      setShowBetaNoticeOnFirstLogin(true)
      return
    }

    let isMounted = true
    void (async () => {
      try {
        const flags = await getAppFeatureFlags()
        if (!isMounted) {
          return
        }
        setShowBetaNoticeOnFirstLogin(flags.show_beta_notice_on_first_login)
        setLearnPathsEnabled(flags.learn_paths_enabled)
        setLearnPathCreateEnabled(flags.learn_path_create_enabled)
        setInstantAnalyzeDebugEnabled(flags.instant_analyze_debug_enabled)
        setChatFoldersFeatureEnabled(flags.chat_folders_enabled)
        setGeminiInstantEnabledFromSupabase(flags.gemini_instant_enabled)
      } catch {
        if (!isMounted) {
          return
        }
        setShowBetaNoticeOnFirstLogin(true)
        setLearnPathsEnabled(true)
        setLearnPathCreateEnabled(true)
        setChatFoldersFeatureEnabled(true)
        setGeminiInstantEnabledFromSupabase(false)
      }
    })()

    return () => {
      isMounted = false
    }
  }, [user])

  const isAdmin = profile?.is_superadmin === true
  const isLearnPathsButtonDisabled = !learnPathsEnabled && !isAdmin
  const isLearnPathCreateButtonDisabled = !learnPathCreateEnabled && !isAdmin

  const tourBlockedByBeta = Boolean(
    user && profile && showBetaNoticeOnFirstLogin && !profile.beta_notice_seen,
  )

  const chatTourEligible = Boolean(
    user &&
      profile &&
      profile.chat_onboarding_completed === false &&
      !isLoading &&
      profile.must_change_password_on_first_login !== true &&
      !tourBlockedByBeta,
  )

  return {
    learnPathsEnabled,
    learnPathCreateEnabled,
    instantAnalyzeDebugEnabled,
    chatFoldersFeatureEnabled,
    showBetaNoticeOnFirstLogin,
    isAdmin,
    isLearnPathsButtonDisabled,
    isLearnPathCreateButtonDisabled,
    tourBlockedByBeta,
    chatTourEligible,
  }
}
