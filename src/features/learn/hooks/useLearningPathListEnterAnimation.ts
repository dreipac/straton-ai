import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { LearningPathSummary } from '../services/learn.persistence'

const ENTER_ANIMATION_MS = 220

function learningPathSlotKey(path: LearningPathSummary): string {
  return path.sidebarListKey ?? path.id
}

/** Kurze Einblend-Animation für neu in der Sidebar erscheinende Lernpfade. */
export function useLearningPathListEnterAnimation(
  learningPaths: LearningPathSummary[],
  skipEnterIdsRef?: MutableRefObject<Set<string>>,
) {
  const [enteringPathIds, setEnteringPathIds] = useState<ReadonlySet<string>>(() => new Set())
  const prevSlotKeysRef = useRef<string[]>([])
  const hydratedRef = useRef(false)

  useEffect(() => {
    const currentSlotKeys = learningPaths.map(learningPathSlotKey)
    if (!hydratedRef.current) {
      hydratedRef.current = currentSlotKeys.length > 0
      prevSlotKeysRef.current = currentSlotKeys
      return
    }

    const prevSlots = new Set(prevSlotKeysRef.current)
    const addedPaths = learningPaths.filter((path) => !prevSlots.has(learningPathSlotKey(path)))
    prevSlotKeysRef.current = currentSlotKeys

    const toAnimate = addedPaths
      .filter((path) => {
        if (path.isPending) {
          return false
        }
        if (skipEnterIdsRef?.current.has(path.id)) {
          skipEnterIdsRef.current.delete(path.id)
          return false
        }
        return true
      })
      .map((path) => path.id)

    if (toAnimate.length === 0) {
      return
    }

    setEnteringPathIds((current) => {
      const next = new Set(current)
      for (const id of toAnimate) {
        next.add(id)
      }
      return next
    })

    const timerId = window.setTimeout(() => {
      setEnteringPathIds((current) => {
        const next = new Set(current)
        for (const id of toAnimate) {
          next.delete(id)
        }
        return next
      })
    }, ENTER_ANIMATION_MS)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [learningPaths, skipEnterIdsRef])

  return enteringPathIds
}
