import type { LearnFlashcard, LearnFlashcardSet } from '../services/learn.persistence'

/**
 * Tage bis zur nächsten Wiederholung, indexiert nach der aktuellen Stufe (`srStage`):
 * Stufe 0 → 1. richtige Antwort in Folge → 3 Tage. Stufe 1 → 2. richtige Antwort in Folge → 10 Tage.
 * Nach der 3. richtigen Antwort in Folge (Stufe 2, ausserhalb dieser Liste) gilt die Karte als
 * gemeistert und wird nicht mehr eingeplant (siehe `applyFlashcardReview`).
 */
export const SR_INTERVAL_DAYS = [3, 10] as const

const MS_PER_DAY = 86_400_000

function addDays(from: Date, days: number): string {
  const d = new Date(from.getTime())
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export function isFlashcardDue(card: LearnFlashcard, now = new Date()): boolean {
  if (card.mastered) {
    return false
  }
  if (!card.nextReviewAt) {
    return true
  }
  return new Date(card.nextReviewAt).getTime() <= now.getTime()
}

/** Bestehende Karten ohne SR-Felder: sofort fällig, Stufe 0, nicht gemeistert. */
export function normalizeFlashcardSr(card: LearnFlashcard): LearnFlashcard {
  if (typeof card.nextReviewAt === 'string' && card.nextReviewAt.trim()) {
    const stage =
      typeof card.srStage === 'number' && Number.isFinite(card.srStage) && card.srStage >= 0
        ? Math.floor(card.srStage)
        : 0
    return { ...card, srStage: stage, mastered: card.mastered === true }
  }
  if (card.mastered) {
    return card
  }
  return {
    ...card,
    srStage: 0,
    mastered: false,
    nextReviewAt: new Date().toISOString(),
  }
}

export function initializeNewFlashcard(card: LearnFlashcard): LearnFlashcard {
  return normalizeFlashcardSr({
    ...card,
    selfRating: undefined,
    lastReviewedAt: undefined,
    mastered: false,
  })
}

export function initializeNewFlashcardSet(cards: LearnFlashcard[]): LearnFlashcard[] {
  return cards.map((c) => initializeNewFlashcard(c))
}

/**
 * Falsch → Stufe 0, morgen wiederholen. Richtig → Stufe steigt, Intervall aus `SR_INTERVAL_DAYS`
 * (3 Tage, dann 10 Tage). Nach der 3. richtigen Antwort in Folge (Stufe reicht über die Liste
 * hinaus) gilt die Karte als gemeistert: keine weitere Wiederholung mehr.
 */
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
      mastered: false,
      nextReviewAt: addDays(now, 1),
      lastReviewedAt: nowIso,
    }
  }

  if (prevStage >= SR_INTERVAL_DAYS.length) {
    return {
      ...card,
      selfRating: 'known',
      srStage: prevStage,
      mastered: true,
      nextReviewAt: undefined,
      lastReviewedAt: nowIso,
    }
  }

  const days = SR_INTERVAL_DAYS[prevStage]

  return {
    ...card,
    selfRating: 'known',
    srStage: prevStage + 1,
    mastered: false,
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
  mastered: number
  known: number
  unknown: number
  unrated: number
}

export function getFlashcardSrStats(sets: LearnFlashcardSet[], now = new Date()): FlashcardSrStats {
  const all = sets.flatMap((s) => s.cards)
  let dueNow = 0
  let scheduledLater = 0
  let mastered = 0
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
    if (card.mastered) {
      mastered += 1
    } else if (isFlashcardDue(card, now)) {
      dueNow += 1
    } else if (card.nextReviewAt) {
      scheduledLater += 1
    }
  }

  return {
    total: all.length,
    dueNow,
    scheduledLater,
    mastered,
    known,
    unknown,
    unrated,
  }
}

/** Anzeige nach Bewertung auf der Kartenrückseite. */
export function formatNextReviewHint(card: LearnFlashcard | undefined, now = new Date()): string | null {
  if (!card) {
    return null
  }
  if (card.mastered) {
    return 'Gemeistert — wird nicht mehr wiederholt'
  }
  if (!card.nextReviewAt) {
    return null
  }
  const target = new Date(card.nextReviewAt).getTime()
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
  const date = new Date(card.nextReviewAt)
  return `Nächste Wiederholung: ${date.toLocaleDateString('de-CH', { day: 'numeric', month: 'short' })}`
}
