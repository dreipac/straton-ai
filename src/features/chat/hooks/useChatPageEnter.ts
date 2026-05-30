import { useEffect, useState } from 'react'

const PAGE_ENTER_MS = 680

export function useChatPageEnter() {
  const [isPageEnter, setIsPageEnter] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setIsPageEnter(false), PAGE_ENTER_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return isPageEnter
}

export function useChatThreadListSkeletonVisibility(isBootstrapping: boolean) {
  const [mounted, setMounted] = useState(isBootstrapping)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (isBootstrapping) {
      setExiting(false)
      setMounted(true)
      return
    }
    if (!mounted) {
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMounted(false)
      setExiting(false)
      return
    }
    setExiting(true)
  }, [isBootstrapping, mounted])

  function handleExitTransitionEnd() {
    if (exiting) {
      setMounted(false)
      setExiting(false)
    }
  }

  return {
    threadSkeletonMounted: mounted,
    threadSkeletonExiting: exiting,
    handleThreadSkeletonTransitionEnd: handleExitTransitionEnd,
  }
}
