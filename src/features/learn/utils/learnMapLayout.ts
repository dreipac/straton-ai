import type { SyllabusEntry, TopicSession } from '../services/learn.persistence'
import { sanitizeChapterTitlesForUi, topicMasteryAttempts, topicMasteryScore } from './learnPageHelpers'

export type LearnMapTopicStatus = 'locked' | 'active' | 'mastered'
export type LearnMapSubstepStatus = 'done' | 'current' | 'upcoming'

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

/**
 * Landkarte als flache, reine Liste (kein Canvas/Positions-Layout mehr): ein Eintrag pro Thema,
 * top-down in Syllabus-Reihenfolge — die Darstellung übernimmt eine einfache vertikale Scroll-Liste.
 */
export function buildTopicMapList(
  syllabus: SyllabusEntry[],
  topicSessions: TopicSession[],
  effectiveTopic: string,
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
    return {
      topicIndex,
      title: titles[topicIndex] ?? entry.topic,
      status,
      scorePercent: isUnlocked ? scorePercentFor(session) : null,
      substeps: isUnlocked ? computeSubsteps(session) : [],
    }
  })
}
