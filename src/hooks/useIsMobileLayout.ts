import { mobileMediaQuery } from '../utils/mobile'
import { useMediaQuery } from './useMediaQuery'

/** `true` wenn Viewport ≤ 768px — gleiche Schwelle wie mobile Sidebar / Bottom Sheet. */
export function useIsMobileLayout(): boolean {
  return useMediaQuery(mobileMediaQuery())
}
