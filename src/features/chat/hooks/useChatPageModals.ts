import { useCallback, useEffect, useRef, useState } from 'react'
import type { ContentBottomSheetHandle } from '../../../components/ui/bottom-sheet/ContentBottomSheet'
import type { ProfileFullSheetHandle } from '../../../components/ui/bottom-sheet/ProfileFullSheet'
import type { UpdateUserIntroductionPatch, UserProfile } from '../../auth/services/auth.service'
import {
  normalizeIntroductionText,
  parseUserIntroductionAnswers,
} from '../../auth/constants/userIntroduction'
import { introductionValueFromProfile } from '../../settings/components/IntroductionEditor'
import type { IntroductionEditorValue } from '../../settings/components/IntroductionEditor'
import type { SettingsSectionId } from '../../../pages/SettingsPage'
import { CHAT_PAGE_MODAL_ANIMATION_MS } from '../components/chat-page/chatPageConstants'

type UseChatPageModalsArgs = {
  user: { id: string } | null
  profile: UserProfile | null
  isCompactMobileSidebarLayout: boolean
  isNarrowViewport: boolean
  showBetaNoticeOnFirstLogin: boolean
  markBetaNoticeSeen: () => Promise<void>
  updateUserIntroduction: (patch: UpdateUserIntroductionPatch) => Promise<void>
  refreshProfile: () => Promise<void>
  setIsMobileSidebarOpen: (value: boolean | ((prev: boolean) => boolean)) => void
}

export function useChatPageModals({
  user,
  profile,
  isCompactMobileSidebarLayout,
  isNarrowViewport,
  showBetaNoticeOnFirstLogin,
  markBetaNoticeSeen,
  updateUserIntroduction,
  refreshProfile,
  setIsMobileSidebarOpen,
}: UseChatPageModalsArgs) {
  const profileFullSheetRef = useRef<ProfileFullSheetHandle | null>(null)
  const betaNoticeSheetRef = useRef<ContentBottomSheetHandle | null>(null)
  const introductionSheetRef = useRef<ContentBottomSheetHandle | null>(null)
  const settingsCloseTimerRef = useRef<number | null>(null)
  const adminCloseTimerRef = useRef<number | null>(null)
  const newsCloseTimerRef = useRef<number | null>(null)
  const betaNoticeCloseTimerRef = useRef<number | null>(null)
  const introductionCloseTimerRef = useRef<number | null>(null)

  const [mobileSheetMode, setMobileSheetMode] = useState<'closed' | 'profile' | 'settings'>('closed')
  const [isSettingsMounted, setIsSettingsMounted] = useState(false)
  const [isSettingsVisible, setIsSettingsVisible] = useState(false)
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSectionId>('general')
  const [isAdminMounted, setIsAdminMounted] = useState(false)
  const [isAdminVisible, setIsAdminVisible] = useState(false)
  const [isNewsMounted, setIsNewsMounted] = useState(false)
  const [isNewsVisible, setIsNewsVisible] = useState(false)
  const [isBetaNoticeMounted, setIsBetaNoticeMounted] = useState(false)
  const [isBetaNoticeVisible, setIsBetaNoticeVisible] = useState(false)
  const [betaNoticeShouldMarkSeen, setBetaNoticeShouldMarkSeen] = useState(false)
  const [isIntroductionMounted, setIsIntroductionMounted] = useState(false)
  const [isIntroductionVisible, setIsIntroductionVisible] = useState(false)
  const [introductionDraft, setIntroductionDraft] = useState<IntroductionEditorValue>(() =>
    introductionValueFromProfile(profile),
  )
  const [isIntroductionSaving, setIsIntroductionSaving] = useState(false)

  const toggleCompactProfileSheet = useCallback(() => {
    if (!isCompactMobileSidebarLayout) {
      return
    }
    if (mobileSheetMode !== 'closed') {
      profileFullSheetRef.current?.requestClose()
    } else {
      setMobileSheetMode('profile')
    }
  }, [isCompactMobileSidebarLayout, mobileSheetMode])

  const openBetaNoticeModal = useCallback((markSeenOnClose: boolean) => {
    if (betaNoticeCloseTimerRef.current !== null) {
      window.clearTimeout(betaNoticeCloseTimerRef.current)
      betaNoticeCloseTimerRef.current = null
    }
    setBetaNoticeShouldMarkSeen(markSeenOnClose)
    setIsBetaNoticeMounted(true)
    window.requestAnimationFrame(() => {
      setIsBetaNoticeVisible(true)
    })
  }, [])

  const openSettingsModal = useCallback(
    (section: SettingsSectionId = 'general') => {
      setSettingsInitialSection(section)
      void refreshProfile().catch(() => {
        // Falls Refresh fehlschlägt, öffnen wir trotzdem die Settings mit dem zuletzt geladenen Profil.
      })
      setIsMobileSidebarOpen(false)
      if (settingsCloseTimerRef.current !== null) {
        window.clearTimeout(settingsCloseTimerRef.current)
        settingsCloseTimerRef.current = null
      }

      if (isCompactMobileSidebarLayout) {
        setMobileSheetMode('settings')
        return
      }

      setIsSettingsMounted(true)
      window.requestAnimationFrame(() => {
        setIsSettingsVisible(true)
      })
    },
    [isCompactMobileSidebarLayout, refreshProfile, setIsMobileSidebarOpen],
  )

  const closeSettingsModal = useCallback(() => {
    if (isCompactMobileSidebarLayout) {
      profileFullSheetRef.current?.requestClose()
      return
    }
    setIsSettingsVisible(false)
    settingsCloseTimerRef.current = window.setTimeout(() => {
      setIsSettingsMounted(false)
      settingsCloseTimerRef.current = null
    }, CHAT_PAGE_MODAL_ANIMATION_MS)
  }, [isCompactMobileSidebarLayout])

  const openAdminModal = useCallback(() => {
    if (isCompactMobileSidebarLayout) {
      profileFullSheetRef.current?.requestClose()
    }
    setIsMobileSidebarOpen(false)
    if (adminCloseTimerRef.current !== null) {
      window.clearTimeout(adminCloseTimerRef.current)
      adminCloseTimerRef.current = null
    }

    setIsAdminMounted(true)
    window.requestAnimationFrame(() => {
      setIsAdminVisible(true)
    })
  }, [isCompactMobileSidebarLayout, setIsMobileSidebarOpen])

  const closeAdminModal = useCallback(() => {
    setIsAdminVisible(false)
    adminCloseTimerRef.current = window.setTimeout(() => {
      setIsAdminMounted(false)
      adminCloseTimerRef.current = null
    }, CHAT_PAGE_MODAL_ANIMATION_MS)
  }, [])

  const openNewsModal = useCallback(() => {
    if (isCompactMobileSidebarLayout) {
      profileFullSheetRef.current?.requestClose()
    }
    setIsMobileSidebarOpen(false)
    if (newsCloseTimerRef.current !== null) {
      window.clearTimeout(newsCloseTimerRef.current)
      newsCloseTimerRef.current = null
    }

    setIsNewsMounted(true)
    window.requestAnimationFrame(() => {
      setIsNewsVisible(true)
    })
  }, [isCompactMobileSidebarLayout, setIsMobileSidebarOpen])

  const closeNewsModal = useCallback(() => {
    setIsNewsVisible(false)
    newsCloseTimerRef.current = window.setTimeout(() => {
      setIsNewsMounted(false)
      newsCloseTimerRef.current = null
    }, CHAT_PAGE_MODAL_ANIMATION_MS)
  }, [])

  const handleBetaNoticeSheetExitComplete = useCallback(async () => {
    try {
      if (betaNoticeShouldMarkSeen) {
        await markBetaNoticeSeen()
      }
    } finally {
      setIsBetaNoticeMounted(false)
      setIsBetaNoticeVisible(false)
    }
  }, [betaNoticeShouldMarkSeen, markBetaNoticeSeen])

  const closeBetaNoticeModal = useCallback(async () => {
    if (isNarrowViewport && betaNoticeSheetRef.current) {
      betaNoticeSheetRef.current.requestClose()
      return
    }
    setIsBetaNoticeVisible(false)
    try {
      if (betaNoticeShouldMarkSeen) {
        await markBetaNoticeSeen()
      }
    } finally {
      betaNoticeCloseTimerRef.current = window.setTimeout(() => {
        setIsBetaNoticeMounted(false)
        betaNoticeCloseTimerRef.current = null
      }, CHAT_PAGE_MODAL_ANIMATION_MS)
    }
  }, [betaNoticeShouldMarkSeen, isNarrowViewport, markBetaNoticeSeen])

  const closeIntroductionModal = useCallback(() => {
    if (isNarrowViewport && introductionSheetRef.current) {
      introductionSheetRef.current.requestClose()
      return
    }
    setIsIntroductionVisible(false)
    introductionCloseTimerRef.current = window.setTimeout(() => {
      setIsIntroductionMounted(false)
      introductionCloseTimerRef.current = null
    }, CHAT_PAGE_MODAL_ANIMATION_MS)
  }, [isNarrowViewport])

  const handleIntroductionSheetExitComplete = useCallback(() => {
    setIsIntroductionMounted(false)
    setIsIntroductionVisible(false)
  }, [])

  const saveIntroductionFromModal = useCallback(async () => {
    setIsIntroductionSaving(true)
    try {
      await updateUserIntroduction({
        introduction_completed: true,
        introduction_mode: introductionDraft.mode,
        introduction_text: normalizeIntroductionText(introductionDraft.text) || null,
        introduction_answers: parseUserIntroductionAnswers(introductionDraft.answers),
      })
      closeIntroductionModal()
    } finally {
      setIsIntroductionSaving(false)
    }
  }, [closeIntroductionModal, introductionDraft, updateUserIntroduction])

  const deferIntroductionModal = useCallback(() => {
    closeIntroductionModal()
  }, [closeIntroductionModal])

  useEffect(() => {
    setIntroductionDraft(introductionValueFromProfile(profile))
  }, [
    profile?.introduction_mode,
    profile?.introduction_text,
    profile?.introduction_answers,
    profile?.introduction_updated_at,
  ])

  useEffect(() => {
    const shouldShowBetaNotice = Boolean(
      user &&
        profile &&
        profile.must_change_password_on_first_login !== true &&
        !profile.beta_notice_seen &&
        showBetaNoticeOnFirstLogin,
    )

    if (!shouldShowBetaNotice) {
      return
    }

    if (betaNoticeCloseTimerRef.current !== null) {
      window.clearTimeout(betaNoticeCloseTimerRef.current)
      betaNoticeCloseTimerRef.current = null
    }

    setBetaNoticeShouldMarkSeen(true)
    setIsBetaNoticeMounted(true)
    window.requestAnimationFrame(() => {
      setIsBetaNoticeVisible(true)
    })
  }, [user, profile, showBetaNoticeOnFirstLogin])

  useEffect(() => {
    const betaGatePassed = !showBetaNoticeOnFirstLogin || profile?.beta_notice_seen === true
    const betaModalOpen = isBetaNoticeMounted || isBetaNoticeVisible
    const shouldShowIntroduction = Boolean(
      user &&
        profile &&
        profile.must_change_password_on_first_login !== true &&
        betaGatePassed &&
        !betaModalOpen &&
        profile.introduction_completed !== true,
    )

    if (!shouldShowIntroduction) {
      return
    }

    if (introductionCloseTimerRef.current !== null) {
      window.clearTimeout(introductionCloseTimerRef.current)
      introductionCloseTimerRef.current = null
    }

    setIsIntroductionMounted(true)
    window.requestAnimationFrame(() => {
      setIsIntroductionVisible(true)
    })
  }, [
    user,
    profile,
    showBetaNoticeOnFirstLogin,
    isBetaNoticeMounted,
    isBetaNoticeVisible,
    profile?.introduction_completed,
    profile?.beta_notice_seen,
    profile?.must_change_password_on_first_login,
  ])

  useEffect(() => {
    return () => {
      if (settingsCloseTimerRef.current !== null) {
        window.clearTimeout(settingsCloseTimerRef.current)
      }
      if (adminCloseTimerRef.current !== null) {
        window.clearTimeout(adminCloseTimerRef.current)
      }
      if (newsCloseTimerRef.current !== null) {
        window.clearTimeout(newsCloseTimerRef.current)
      }
      if (betaNoticeCloseTimerRef.current !== null) {
        window.clearTimeout(betaNoticeCloseTimerRef.current)
      }
      if (introductionCloseTimerRef.current !== null) {
        window.clearTimeout(introductionCloseTimerRef.current)
      }
    }
  }, [])

  return {
    profileFullSheetRef,
    betaNoticeSheetRef,
    introductionSheetRef,
    mobileSheetMode,
    setMobileSheetMode,
    isSettingsMounted,
    isSettingsVisible,
    settingsInitialSection,
    isAdminMounted,
    isAdminVisible,
    isNewsMounted,
    isNewsVisible,
    isBetaNoticeMounted,
    isBetaNoticeVisible,
    isIntroductionMounted,
    isIntroductionVisible,
    introductionDraft,
    setIntroductionDraft,
    isIntroductionSaving,
    toggleCompactProfileSheet,
    openBetaNoticeModal,
    openSettingsModal,
    closeSettingsModal,
    openAdminModal,
    closeAdminModal,
    openNewsModal,
    closeNewsModal,
    closeBetaNoticeModal,
    handleBetaNoticeSheetExitComplete,
    closeIntroductionModal,
    handleIntroductionSheetExitComplete,
    saveIntroductionFromModal,
    deferIntroductionModal,
  }
}
