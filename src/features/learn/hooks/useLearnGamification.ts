import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  awardGamificationBadge,
  fetchMyGamificationProfile,
  recordGamificationEvent,
  type LearnGamificationProfile,
} from '../services/learnGamification.persistence'
import {
  computeRank,
  evaluateNewlyEarnedBadges,
  xpToLevel,
  type GamificationBadgeContext,
} from '../utils/gamification'

const EMPTY_PROFILE: LearnGamificationProfile = {
  totalXp: 0,
  currentStreakDays: 0,
  longestStreakDays: 0,
  earnedBadgeIds: [],
}

export type PendingLevelUpEvent = {
  previousLevel: number
  newLevel: number
  title: string
}

export type PendingBadgeUnlockEvent = {
  badgeId: string
  title: string
  description: string
}

/**
 * Kontoweites Gamification-Profil (XP/Level/Rang/Streak/Badges) + Event-Recorder.
 * Persistiert serverseitig über `learn_gamification_record_event`/`learn_gamification_award_badge`
 * (atomar, idempotent per Dedupe-Key). `pendingLevelUpEvent`/`pendingBadgeUnlockEvents` sind reine
 * Datenzustände für eine spätere UI (Modal/Sound/Konfetti) — hier nur die Logik, keine Darstellung.
 */
export function useLearnGamification(userId: string | undefined) {
  const [profile, setProfile] = useState<LearnGamificationProfile>(EMPTY_PROFILE)
  const [pendingLevelUpEvent, setPendingLevelUpEvent] = useState<PendingLevelUpEvent | null>(null)
  const [pendingBadgeUnlockEvents, setPendingBadgeUnlockEvents] = useState<PendingBadgeUnlockEvent[]>([])
  const profileRef = useRef(profile)

  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  // Nutzerwechsel (z. B. Logout) während des Renderns zurücksetzen statt in einem Effekt — vermeidet
  // ein synchrones setState direkt im Effekt-Body (react-hooks/set-state-in-effect).
  const [trackedUserId, setTrackedUserId] = useState(userId)
  if (trackedUserId !== userId) {
    setTrackedUserId(userId)
    setProfile(EMPTY_PROFILE)
    setPendingLevelUpEvent(null)
    setPendingBadgeUnlockEvents([])
  }

  useEffect(() => {
    if (!userId) {
      return
    }
    let cancelled = false
    fetchMyGamificationProfile(userId)
      .then((loaded) => {
        if (!cancelled) {
          setProfile(loaded)
        }
      })
      .catch(() => {
        // Gamification ist ein sekundäres Signal — ein Ladefehler soll den Lernfluss nicht blockieren.
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const levelProgress = useMemo(() => xpToLevel(profile.totalXp), [profile.totalXp])
  const rank = useMemo(
    () => computeRank(levelProgress.level, profile.earnedBadgeIds.length),
    [levelProgress.level, profile.earnedBadgeIds.length],
  )

  /** dedupeKey muss pro einzigartiger Aktion stabil sein (siehe learnGamification.persistence.ts). */
  const recordEvent = useCallback(
    (args: { dedupeKey: string; eventType: string; xpAmount: number; sourcePathId?: string }) => {
      if (!userId) {
        return
      }
      const previousLevel = xpToLevel(profileRef.current.totalXp)
      void recordGamificationEvent({ userId, ...args })
        .then((result) => {
          if (!result.awarded) {
            return
          }
          setProfile((prev) => ({
            ...prev,
            totalXp: result.totalXp,
            currentStreakDays: result.currentStreakDays,
            longestStreakDays: result.longestStreakDays,
          }))
          const nextLevel = xpToLevel(result.totalXp)
          if (nextLevel.level > previousLevel.level) {
            setPendingLevelUpEvent({
              previousLevel: previousLevel.level,
              newLevel: nextLevel.level,
              title: nextLevel.title,
            })
          }
        })
        .catch(() => {
          // Ebenso: XP-Verlust eines einzelnen Events darf den Lernfluss nicht unterbrechen.
        })
    },
    [userId],
  )

  const evaluateBadges = useCallback(
    (context: GamificationBadgeContext) => {
      if (!userId) {
        return
      }
      const newlyEligible = evaluateNewlyEarnedBadges(context, profileRef.current.earnedBadgeIds)
      for (const badge of newlyEligible) {
        void awardGamificationBadge({ userId, badgeId: badge.id })
          .then((result) => {
            if (!result.newlyAwarded) {
              return
            }
            setProfile((prev) => ({ ...prev, earnedBadgeIds: result.earnedBadgeIds }))
            setPendingBadgeUnlockEvents((prev) => [
              ...prev,
              { badgeId: badge.id, title: badge.title, description: badge.description },
            ])
          })
          .catch(() => {})
      }
    },
    [userId],
  )

  const clearLevelUpEvent = useCallback(() => setPendingLevelUpEvent(null), [])
  const clearBadgeUnlockEvent = useCallback((badgeId: string) => {
    setPendingBadgeUnlockEvents((prev) => prev.filter((event) => event.badgeId !== badgeId))
  }, [])

  return {
    totalXp: levelProgress.totalXp,
    level: levelProgress.level,
    levelTitle: levelProgress.title,
    xpIntoLevel: levelProgress.xpIntoLevel,
    xpForNextLevel: levelProgress.xpForNextLevel,
    isMaxLevel: levelProgress.isMaxLevel,
    rank,
    currentStreakDays: profile.currentStreakDays,
    longestStreakDays: profile.longestStreakDays,
    earnedBadgeIds: profile.earnedBadgeIds,
    recordEvent,
    evaluateBadges,
    pendingLevelUpEvent,
    clearLevelUpEvent,
    pendingBadgeUnlockEvents,
    clearBadgeUnlockEvent,
  }
}
