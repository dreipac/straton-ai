import type { LearnFlashcard, LearnFlashcardSet } from '../services/learn.persistence'

/** Tage bis zur nächsten Wiederholung nach «Gewusst» (Stufe 0 → 1 Tag, dann 3, 7, …). */
export const SR_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const

const MS_PER_DAY = 86_400_000

function addDays(from: Date, days: number): string {
  const d = new Date(from.getTime())
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export function isFlashcardDue(card: LearnFlashcard, now = new Date()): boolean {
  if (!card.nextReviewAt) {
    return true
  }
  return new Date(card.nextReviewAt).getTime() <= now.getTime()
}

/** Bestehende Karten ohne SR-Felder: sofort fällig, Stufe 0. */
export function normalizeFlashcardSr(card: LearnFlashcard): LearnFlashcard {
  if (typeof card.nextReviewAt === 'string' && card.nextReviewAt.trim()) {
    const stage =
      typeof card.srStage === 'number' && Number.isFinite(card.srStage) && card.srStage >= 0
        ? Math.floor(card.srStage)
        : 0
    return { ...card, srStage: stage }
  }
  return {
    ...card,
    srStage: 0,
    nextReviewAt: new Date().toISOString(),
  }
}

export function initializeNewFlashcard(card: LearnFlashcard): LearnFlashcard {
  return normalizeFlashcardSr({
    ...card,
    selfRating: undefined,
    lastReviewedAt: undefined,
  })
}

export function initializeNewFlashcardSet(cards: LearnFlashcard[]): LearnFlashcard[] {
  return cards.map((c) => initializeNewFlashcard(c))
}

export function applyFlashcardReview(card: LearnFlashcard, rating: 'known' | 'unknown'): LearnFlashcard {
  const now = new Date()
  const nowIso = now.toISOString()
  const prevStage =
    typeof card.srStage === 'number' && Number.isFinite(card.srStage) && card.srStage >= 0
      ? Math.floor(card.srStage)
      : 0

  if (rating === 'unknown') {
    return {
      ...card,
      selfRating: 'unknown',
      srStage: 0,
      nextReviewAt: addDays(now, SR_INTERVAL_DAYS[0]),
      lastReviewedAt: nowIso,
    }
  }

  const intervalIndex = Math.min(prevStage, SR_INTERVAL_DAYS.length - 1)
  const days = SR_INTERVAL_DAYS[intervalIndex]
  const nextStage = Math.min(prevStage + 1, SR_INTERVAL_DAYS.length - 1)

  return {
    ...card,
    selfRating: 'known',
    srStage: nextStage,
    nextReviewAt: addDays(now, days),
    lastReviewedAt: nowIso,
  }
}

export function getDueFlashcardsFromSets(sets: LearnFlashcardSet[], now = new Date()): LearnFlashcard[] {
  return sets.flatMap((s) => s.cards).filter((c) => isFlashcardDue(c, now))
}

export type FlashcardSrStats = {
  total: number
  dueNow: number
  scheduledLater: number
  known: number
  unknown: number
  unrated: number
}

export function getFlashcardSrStats(sets: LearnFlashcardSet[], now = new Date()): FlashcardSrStats {
  const all = sets.flatMap((s) => s.cards)
  let dueNow = 0
  let scheduledLater = 0
  let known = 0
  let unknown = 0
  let unrated = 0

  for (const card of all) {
    if (card.selfRating === 'known') {
      known += 1
    } else if (card.selfRating === 'unknown') {
      unknown += 1
    } else {
      unrated += 1
    }
    if (isFlashcardDue(card, now)) {
      dueNow += 1
    } else if (card.nextReviewAt) {
      scheduledLater += 1
    }
  }

  return {
    total: all.length,
    dueNow,
    scheduledLater,
    known,
    unknown,
    unrated,
  }
}

/** Anzeige nach Bewertung auf der Kartenrückseite. */
export function formatNextReviewHint(nextReviewAt: string | undefined, now = new Date()): string | null {
  if (!nextReviewAt) {
    return null
  }
  const target = new Date(nextReviewAt).getTime()
  const diffMs = target - now.getTime()
  if (diffMs <= 0) {
    return 'Jetzt wiederholen'
  }
  const diffDays = Math.ceil(diffMs / MS_PER_DAY)
  if (diffDays === 1) {
    return 'Nächste Wiederholung: morgen'
  }
  if (diffDays < 7) {
    return `Nächste Wiederholung: in ${diffDays} Tagen`
  }
  const date = new Date(nextReviewAt)
  return `Nächste Wiederholung: ${date.toLocaleDateString('de-CH', { day: 'numeric', month: 'short' })}`
}
