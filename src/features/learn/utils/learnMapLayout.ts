import type { LearnWorksheetItem, SyllabusEntry, TopicSession } from '../services/learn.persistence'
import { sanitizeChapterTitlesForUi, topicMasteryAttempts, topicMasteryScore } from './learnPageHelpers'

export type LearnMapTopicStatus = 'locked' | 'active' | 'mastered'
export type LearnMapSubstepStatus = 'done' | 'current' | 'upcoming'
/** Die drei festen Phasen eines Teilthema-Flows: fester Erklär-/Fragen-Flow → Übungskarten → Abschluss-Arbeitsblatt. */
export type LearnMapSubstepPhase = 'flow' | 'practice' | 'worksheet'

export type LearnMapSubstepItem = {
  index: number
  title: string
  status: LearnMapSubstepStatus
}

export type LearnMapTopicItem = {
  topicIndex: number
  title: string
  status: LearnMapTopicStatus
  /** Ø-Mastery-Score in Prozent, null solange keine Versuche vorliegen (noch keine Zahl anzeigen). */
  scorePercent: number | null
  /** Teilthemen dieses Themas, sobald generiert (leer bei gesperrten/noch nicht gestarteten Themen). */
  substeps: LearnMapSubstepItem[]
  /** Phase des aktuellen (ersten offenen) Teilthemas — null ohne Teilthemen/ohne aktuelles Teilthema. */
  currentSubstepPhase: LearnMapSubstepPhase | null
  /** true: Thema ist gemeistert, aber nicht alles wurde je auf Anhieb/insgesamt korrekt beantwortet
   *  (Ø-Score < 100 %) — zeigt einen kleinen orangen Hinweis-Punkt am Themen-Punkt. */
  hasWrongAnswers: boolean
}

/** Teilschritte eines Themas aus der Session ableiten. „current" = erstes noch nicht abgeschlossene
 *  Teilthema, davor „done", danach „upcoming" — dieselbe Regel wie in der Kapitelübersicht. */
function computeSubsteps(session: TopicSession | undefined): LearnMapSubstepItem[] {
  if (!session || session.substeps.length === 0) {
    return []
  }
  const firstOpenIndex = session.substeps.findIndex((substep) => !substep.completed)
  return session.substeps.map((substep, index): LearnMapSubstepItem => {
    const status: LearnMapSubstepStatus = substep.completed
      ? 'done'
      : index === firstOpenIndex
        ? 'current'
        : 'upcoming'
    return {
      index,
      title: substep.blueprint.title.trim() || `Teilthema ${index + 1}`,
      status,
    }
  })
}

/** Ø-Mastery-Score eines Themas in Prozent, oder null ohne erfasste Versuche (keine Zahl statt einer
 *  unehrlichen 0%). */
function scorePercentFor(session: TopicSession | undefined): number | null {
  if (!session || topicMasteryAttempts(session) === 0) {
    return null
  }
  return Math.round(topicMasteryScore(session) * 100)
}

/** Phase des aktuellen (ersten offenen) Teilthemas rein aus persistierten Daten ableiten — kein
 *  Zugriff auf transienten UI-Status (der lebt nur, solange der Themen-Arbeitsbereich offen ist):
 *  Ein Abschluss-Arbeitsblatt existiert → Phase 3, sonst ein Übungskarten-Set → Phase 2, sonst Phase 1. */
function computeCurrentSubstepPhase(
  session: TopicSession | undefined,
  topicIndex: number,
  learnWorksheets: LearnWorksheetItem[],
): LearnMapSubstepPhase | null {
  if (!session || session.substeps.length === 0) {
    return null
  }
  const currentIndex = session.substeps.findIndex((substep) => !substep.completed)
  if (currentIndex === -1) {
    return null
  }
  const current = session.substeps[currentIndex]
  const hasWorksheet = learnWorksheets.some(
    (item) => item.topicIndex === topicIndex && item.substepIndex === currentIndex,
  )
  if (hasWorksheet) {
    return 'worksheet'
  }
  if (current.practiceFlashcardSetId) {
    return 'practice'
  }
  return 'flow'
}

/**
 * Landkarte als flache, reine Liste (kein Canvas/Positions-Layout mehr): ein Eintrag pro Thema,
 * top-down in Syllabus-Reihenfolge — die Darstellung übernimmt eine einfache vertikale Scroll-Liste.
 */
export function buildTopicMapList(
  syllabus: SyllabusEntry[],
  topicSessions: TopicSession[],
  effectiveTopic: string,
  learnWorksheets: LearnWorksheetItem[] = [],
): LearnMapTopicItem[] {
  if (syllabus.length === 0) {
    return []
  }

  const titles = sanitizeChapterTitlesForUi(
    syllabus.map((entry) => entry.topic),
    effectiveTopic,
  )

  return syllabus.map((entry, topicIndex): LearnMapTopicItem => {
    const session = topicSessions[topicIndex]
    const isUnlocked = topicIndex === 0 || topicSessions[topicIndex - 1]?.status === 'mastered'
    const isMastered = session?.status === 'mastered'
    const status: LearnMapTopicStatus = isMastered ? 'mastered' : isUnlocked ? 'active' : 'locked'
    const scorePercent = isUnlocked ? scorePercentFor(session) : null
    return {
      topicIndex,
      title: titles[topicIndex] ?? entry.topic,
      status,
      scorePercent,
      substeps: isUnlocked ? computeSubsteps(session) : [],
      currentSubstepPhase: isUnlocked ? computeCurrentSubstepPhase(session, topicIndex, learnWorksheets) : null,
      hasWrongAnswers: isMastered && scorePercent !== null && scorePercent < 100,
    }
  })
}
