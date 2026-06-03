import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { LearningPathSummary } from '../services/learn.persistence'

const ENTER_ANIMATION_MS = 220

/** Kurze Einblend-Animation für neu in der Sidebar erscheinende Lernpfade. */
export function useLearningPathListEnterAnimation(
  learningPaths: LearningPathSummary[],
  skipEnterIdsRef?: MutableRefObject<Set<string>>,
) {
  const [enteringPathIds, setEnteringPathIds] = useState<ReadonlySet<string>>(() => new Set())
  const prevIdsRef = useRef<string[]>([])
  const hydratedRef = useRef(false)

  useEffect(() => {
    const currentIds = learningPaths.map((path) => path.id)
    if (!hydratedRef.current) {
      hydratedRef.current = currentIds.length > 0
      prevIdsRef.current = currentIds
      return
    }

    const prev = new Set(prevIdsRef.current)
    const addedPaths = learningPaths.filter((path) => !prev.has(path.id))
    prevIdsRef.current = currentIds

    if (skipEnterIdsRef) {
      for (const path of addedPaths) {
        skipEnterIdsRef.current.delete(path.id)
      }
    }

    const toAnimate = addedPaths
      .filter((path) => !path.isPending && !skipEnterIdsRef?.current.has(path.id))
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
