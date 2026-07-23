/** Gamification-Kernlogik: XP-Kurve, Level, Rang, Achievement-Katalog.
 *  Rein funktional (keine UI) — Werte werden vom aufrufenden Code (LearnPage) aus bereits
 *  vorhandenen Signalen (chapterSession, topicSessions, Fehler-Logbuch, Flashcard-SR-Stats)
 *  zusammengestellt. Ziel Zielgruppe: berufliche Weiterbildung, daher Trailhead-Ton
 *  (Punkte + Badges + Rang, kein Leaderboard, keine Cartoon-Namen). */

export const XP_PER_CORRECT_ANSWER = 10
export const XP_PER_MASTERED_TOPIC = 100
export const XP_PER_CHAPTER_COMPLETED = 50
export const XP_PER_FLASHCARD_REVIEW = 5

export type LevelDefinition = {
  level: number
  title: string
  /** Absolute Gesamt-XP-Schwelle, ab der dieses Level erreicht ist. */
  minXp: number
}

/** Bewusst wenige, seltene Stufen (5-8) statt vieler kleiner Level — ein Level-Up soll ein
 *  Ereignis bleiben, kein Hintergrundrauschen. */
export const LEVEL_DEFINITIONS: LevelDefinition[] = [
  { level: 1, title: 'Einsteiger', minXp: 0 },
  { level: 2, title: 'Lernender', minXp: 200 },
  { level: 3, title: 'Fortgeschritten', minXp: 500 },
  { level: 4, title: 'Kompetent', minXp: 1000 },
  { level: 5, title: 'Versiert', minXp: 2000 },
  { level: 6, title: 'Erfahren', minXp: 3500 },
  { level: 7, title: 'Spezialist', minXp: 5500 },
  { level: 8, title: 'Experte', minXp: 8000 },
]

export type LevelProgress = {
  level: number
  title: string
  totalXp: number
  /** XP oberhalb der aktuellen Levelschwelle. */
  xpIntoLevel: number
  /** XP, die für das nächste Level insgesamt nötig sind (null = Maximal-Level erreicht). */
  xpForNextLevel: number | null
  isMaxLevel: boolean
}

function clampXp(totalXp: number): number {
  return Number.isFinite(totalXp) && totalXp > 0 ? Math.floor(totalXp) : 0
}

/** Deterministisch: gleiche XP ergeben immer dasselbe Level, keine Randfall-Sprünge an den Schwellen. */
export function xpToLevel(totalXp: number): LevelProgress {
  const xp = clampXp(totalXp)
  let current = LEVEL_DEFINITIONS[0]
  let next: LevelDefinition | undefined
  for (let i = 0; i < LEVEL_DEFINITIONS.length; i += 1) {
    if (xp >= LEVEL_DEFINITIONS[i].minXp) {
      current = LEVEL_DEFINITIONS[i]
      next = LEVEL_DEFINITIONS[i + 1]
    }
  }
  return {
    level: current.level,
    title: current.title,
    totalXp: xp,
    xpIntoLevel: xp - current.minXp,
    xpForNextLevel: next ? next.minXp - current.minXp : null,
    isMaxLevel: !next,
  }
}

export type RankDefinition = {
  id: string
  title: string
  minLevel: number
  minBadges: number
}

/** Rang kombiniert Level UND Badge-Zahl (Trailhead-Prinzip: nicht allein über XP grinden). */
export const RANK_DEFINITIONS: RankDefinition[] = [
  { id: 'starter', title: 'Anfänger', minLevel: 1, minBadges: 0 },
  { id: 'apprentice', title: 'Weiterbildend', minLevel: 2, minBadges: 1 },
  { id: 'professional', title: 'Fachkraft', minLevel: 4, minBadges: 3 },
  { id: 'senior', title: 'Senior Fachkraft', minLevel: 6, minBadges: 6 },
  { id: 'expert', title: 'Experte', minLevel: 8, minBadges: 10 },
]

export function computeRank(level: number, badgeCount: number): RankDefinition {
  let best = RANK_DEFINITIONS[0]
  for (const rank of RANK_DEFINITIONS) {
    if (level >= rank.minLevel && badgeCount >= rank.minBadges) {
      best = rank
    }
  }
  return best
}

export type GamificationBadgeContext = {
  completedChapterCount: number
  masteredTopicsCount: number
  hasHighMasteryTopic: boolean
  errorLogbookTotal: number
  /** null = unbekannt (noch nicht ausgewertet) — Trigger greift dann nie versehentlich. */
  previousErrorLogbookTotal: number | null
  currentStreakDays: number
  flashcardDueNow: number
  flashcardTotal: number
  isPathFullyCompleted: boolean
}

export type BadgeDefinition = {
  id: string
  title: string
  description: string
  evaluate: (context: GamificationBadgeContext) => boolean
}

export const BADGE_CATALOG: BadgeDefinition[] = [
  {
    id: 'first-chapter',
    title: 'Erster Schritt',
    description: 'Erstes Kapitel abgeschlossen.',
    evaluate: (ctx) => ctx.completedChapterCount >= 1,
  },
  {
    id: 'five-chapters',
    title: 'Im Flow',
    description: '5 Kapitel abgeschlossen.',
    evaluate: (ctx) => ctx.completedChapterCount >= 5,
  },
  {
    id: 'high-mastery-topic',
    title: 'Sattelfest',
    description: 'Ein Thema mit über 95% Sicherheit gemeistert.',
    evaluate: (ctx) => ctx.hasHighMasteryTopic,
  },
  {
    id: 'three-topics-mastered',
    title: 'Wegbereiter',
    description: '3 Themen gemeistert.',
    evaluate: (ctx) => ctx.masteredTopicsCount >= 3,
  },
  {
    id: 'error-logbook-cleared',
    title: 'Lücken geschlossen',
    description: 'Alle offenen Einträge im Fehler-Logbuch aufgearbeitet.',
    evaluate: (ctx) =>
      ctx.previousErrorLogbookTotal !== null && ctx.previousErrorLogbookTotal > 0 && ctx.errorLogbookTotal === 0,
  },
  {
    id: 'streak-3',
    title: 'Drangeblieben',
    description: '3 Tage in Folge gelernt.',
    evaluate: (ctx) => ctx.currentStreakDays >= 3,
  },
  {
    id: 'streak-7',
    title: 'Feste Gewohnheit',
    description: '7 Tage in Folge gelernt.',
    evaluate: (ctx) => ctx.currentStreakDays >= 7,
  },
  {
    id: 'flashcards-caught-up',
    title: 'Alles im Griff',
    description: 'Keine fälligen Lernkarten mehr offen.',
    evaluate: (ctx) => ctx.flashcardTotal > 0 && ctx.flashcardDueNow === 0,
  },
  {
    id: 'path-completed',
    title: 'Lernpfad abgeschlossen',
    description: 'Einen kompletten Lernpfad gemeistert.',
    evaluate: (ctx) => ctx.isPathFullyCompleted,
  },
]

/** Liefert alle Badge-IDs, deren Bedingung aktuell erfüllt ist, aber noch nicht in `earnedBadgeIds` steht. */
export function evaluateNewlyEarnedBadges(
  context: GamificationBadgeContext,
  earnedBadgeIds: readonly string[],
): BadgeDefinition[] {
  const earned = new Set(earnedBadgeIds)
  return BADGE_CATALOG.filter((badge) => !earned.has(badge.id) && badge.evaluate(context))
}
