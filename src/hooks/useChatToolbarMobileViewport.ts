import { useEffect, useState } from 'react'
import { chatToolbarMobileMediaQuery, isChatToolbarMobileViewport } from '../utils/mobile'

/** Gleicher Breakpoint wie schwebende Chat-Freigabe-Leiste (max-width: 860px). */
export function useChatToolbarMobileViewport(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? isChatToolbarMobileViewport() : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(chatToolbarMobileMediaQuery())
    function sync() {
      setNarrow(mq.matches)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return narrow
}
