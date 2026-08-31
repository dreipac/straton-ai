import { useEffect, useState } from 'react'
import { isMobileViewport, mobileMediaQuery } from '../utils/mobile'

/** Reagiert auf Fensterbreite (Sheets vs. Modale auf Mobilgeräten). */
export function useIsMobileViewport(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? isMobileViewport() : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(mobileMediaQuery())
    function sync() {
      setMobile(mq.matches)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return mobile
}
