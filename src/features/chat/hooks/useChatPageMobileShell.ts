import { useEffect, useRef, useState } from 'react'
import { COMPACT_MOBILE_SIDEBAR_MAX_PX } from '../components/chat-page/chatPageConstants'
import { readDesktopFoldersInSidebar } from '../constants/desktopFoldersInSidebar'
import { useGlassPillTouchFeedback } from '../../../hooks/useGlassPillTouchFeedback'
type UseChatPageMobileShellArgs = {
  chatTourEligible: boolean
  chatFoldersFeatureEnabled: boolean
}

export function useChatPageMobileShell({
  chatTourEligible,
  chatFoldersFeatureEnabled,
}: UseChatPageMobileShellArgs) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isMobileFoldersOpen, setIsMobileFoldersOpen] = useState(false)
  const [desktopFoldersInSidebarEnabled, setDesktopFoldersInSidebarEnabled] = useState(() =>
    readDesktopFoldersInSidebar(),
  )
  const [isCompactMobileSidebarLayout, setIsCompactMobileSidebarLayout] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(`(max-width: ${COMPACT_MOBILE_SIDEBAR_MAX_PX}px)`).matches,
  )
  const [compactTourReveal, setCompactTourReveal] = useState(false)
  const [swipeOpenThreadId, setSwipeOpenThreadId] = useState<string | null>(null)
  const [optimisticPillTabIndex, setOptimisticPillTabIndex] = useState<number | null>(null)
  const [guestOptimisticPillTabIndex, setGuestOptimisticPillTabIndex] = useState<number | null>(null)
  const [pillAccentPulseActive, setPillAccentPulseActive] = useState(false)
  const [guestPillAccentPulseActive, setGuestPillAccentPulseActive] = useState(false)
  const pillAccentPulseTimerRef = useRef<number | null>(null)
  const guestPillAccentPulseTimerRef = useRef<number | null>(null)

  const mobileBottomNavSpring = useGlassPillTouchFeedback()
  const mobileNewChatTouch = useGlassPillTouchFeedback()
  const sidebarNewChatTouch = useGlassPillTouchFeedback()
  const mobileTopBarModeTouch = useGlassPillTouchFeedback()
  const mobileTopBarTitleTouch = useGlassPillTouchFeedback()
  const mobileTopBarMenuTouch = useGlassPillTouchFeedback()

  const chatTourOverlayActive = chatTourEligible && (!isCompactMobileSidebarLayout || compactTourReveal)
  const showFoldersInSidebar =
    chatFoldersFeatureEnabled && !isCompactMobileSidebarLayout && desktopFoldersInSidebarEnabled
  const isMobileFoldersTabDisabled = !chatFoldersFeatureEnabled

  const computedMobileBottomNavTabIndex = isMobileSidebarOpen ? 0 : isMobileFoldersOpen ? 2 : 1
  const computedGuestMobileBottomNavTabIndex = isMobileSidebarOpen ? 0 : 1
  const mobileBottomNavTabIndex = optimisticPillTabIndex ?? computedMobileBottomNavTabIndex
  const guestMobileBottomNavTabIndex = guestOptimisticPillTabIndex ?? computedGuestMobileBottomNavTabIndex
  const mobileChatBottomTabActive = !isMobileSidebarOpen && !isMobileFoldersOpen
  const mobileFoldersBottomTabActive = isMobileFoldersOpen && chatFoldersFeatureEnabled

  useEffect(() => {
    const syncFolderSidebarPref = () => {
      setDesktopFoldersInSidebarEnabled(readDesktopFoldersInSidebar())
    }
    window.addEventListener('focus', syncFolderSidebarPref)
    window.addEventListener('storage', syncFolderSidebarPref)
    return () => {
      window.removeEventListener('focus', syncFolderSidebarPref)
      window.removeEventListener('storage', syncFolderSidebarPref)
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${COMPACT_MOBILE_SIDEBAR_MAX_PX}px)`)
    function syncCompactSidebarLayout() {
      setIsCompactMobileSidebarLayout(mq.matches)
    }
    syncCompactSidebarLayout()
    mq.addEventListener('change', syncCompactSidebarLayout)
    return () => mq.removeEventListener('change', syncCompactSidebarLayout)
  }, [])

  useEffect(() => {
    if (!chatTourEligible) {
      setCompactTourReveal(false)
      return
    }
    setIsSidebarCollapsed(false)
    setIsMobileSidebarOpen(true)
    if (!isCompactMobileSidebarLayout) {
      setCompactTourReveal(true)
      return
    }
    setCompactTourReveal(false)
    const tid = window.setTimeout(() => setCompactTourReveal(true), 420)
    return () => window.clearTimeout(tid)
  }, [chatTourEligible, isCompactMobileSidebarLayout])

  useEffect(() => {
    if (!isMobileSidebarOpen) {
      setSwipeOpenThreadId(null)
    }
  }, [isMobileSidebarOpen])

  useEffect(() => {
    if (!isCompactMobileSidebarLayout) {
      return
    }
    const list = document.querySelector('.chat-sidebar-list-wrap .chat-thread-list')
    if (!list) {
      return
    }
    const onScroll = () => setSwipeOpenThreadId(null)
    list.addEventListener('scroll', onScroll, { passive: true })
    return () => list.removeEventListener('scroll', onScroll)
  }, [isCompactMobileSidebarLayout])

  useEffect(() => {
    if (optimisticPillTabIndex !== null && optimisticPillTabIndex === computedMobileBottomNavTabIndex) {
      setOptimisticPillTabIndex(null)
    }
  }, [optimisticPillTabIndex, computedMobileBottomNavTabIndex])

  useEffect(() => {
    if (
      guestOptimisticPillTabIndex !== null &&
      guestOptimisticPillTabIndex === computedGuestMobileBottomNavTabIndex
    ) {
      setGuestOptimisticPillTabIndex(null)
    }
  }, [guestOptimisticPillTabIndex, computedGuestMobileBottomNavTabIndex])

  useEffect(() => {
    return () => {
      if (pillAccentPulseTimerRef.current !== null) {
        window.clearTimeout(pillAccentPulseTimerRef.current)
      }
      if (guestPillAccentPulseTimerRef.current !== null) {
        window.clearTimeout(guestPillAccentPulseTimerRef.current)
      }
    }
  }, [])

  function startPillAccentPulse(target: 'main' | 'guest') {
    const setActive = target === 'main' ? setPillAccentPulseActive : setGuestPillAccentPulseActive
    const timerRef = target === 'main' ? pillAccentPulseTimerRef : guestPillAccentPulseTimerRef
    setActive(true)
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }
    timerRef.current = window.setTimeout(() => {
      setActive(false)
      timerRef.current = null
    }, 520)
  }

  return {
    startPillAccentPulse,
    setOptimisticPillTabIndex,
    setGuestOptimisticPillTabIndex,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    isMobileFoldersOpen,
    setIsMobileFoldersOpen,
    isCompactMobileSidebarLayout,
    chatTourOverlayActive,
    showFoldersInSidebar,
    isMobileFoldersTabDisabled,
    swipeOpenThreadId,
    setSwipeOpenThreadId,
    mobileBottomNavTabIndex,
    guestMobileBottomNavTabIndex,
    mobileChatBottomTabActive,
    mobileFoldersBottomTabActive,
    pillAccentPulseActive,
    guestPillAccentPulseActive,
    mobileBottomNavSpring,
    mobileNewChatTouch,
    sidebarNewChatTouch,
    mobileTopBarModeTouch,
    mobileTopBarTitleTouch,
    mobileTopBarMenuTouch,
  }
}
