import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  listLearningPathsByUserId,
  updateLearningPathById,
  type LearnFlashcard,
  type LearningPathRecord,
  type LearningPathSummary,
} from '../services/learn.persistence'
import { firstUnmasteredIndex } from '../engine/sessionMachine'
import {
  countMasteredTopics,
  getDisplayPathTitle,
  sanitizeChapterTitleForUi,
  sortLearningPathsByCreatedAt,
} from '../utils/learnPageHelpers'
import { applyFlashcardReview, isFlashcardDue } from '../utils/spacedRepetition'

/** Thema + Teilthema, bei dem der Nutzer aktuell steht ("Weitermachen"-Karte auf der Startseite). */
function deriveCurrentPosition(record: LearningPathRecord): { topicTitle: string; substepTitle: string } {
  if (record.topicSessions.length === 0) {
    return { topicTitle: '', substepTitle: '' }
  }
  const firstNotMastered = firstUnmasteredIndex(record.topicSessions.map((session) => session.status))
  const topicIndex = firstNotMastered === -1 ? Math.max(0, record.topicSessions.length - 1) : firstNotMastered
  const topicTitle = sanitizeChapterTitleForUi(
    record.syllabus[topicIndex]?.topic ?? '',
    topicIndex,
    record.topic || record.selectedTopic,
  )
  const session = record.topicSessions[topicIndex]
  const substepIndex = session?.substeps.findIndex((substep) => !substep.completed) ?? -1
  const substepTitle =
    substepIndex >= 0
      ? session.substeps[substepIndex]?.blueprint.title.trim() || `Teilthema ${substepIndex + 1}`
      : ''
  return { topicTitle, substepTitle }
}

/** Anzeigename für ein Lernkarten-Set: gleiche Herleitung wie im Lernkarten-Tab des Lernbereichs. */
function deriveFlashcardSetTopicLabel(record: LearningPathRecord, set: LearningPathRecord['learnFlashcardSets'][number]): string {
  const setTopicTitle =
    typeof set.topicIndex === 'number'
      ? (record.syllabus[set.topicIndex]?.topic || record.learningChapters[set.topicIndex] || '').trim()
      : ''
  if (setTopicTitle && typeof set.substepIndex === 'number') {
    return `${setTopicTitle} · Teil ${set.substepIndex + 1}`
  }
  return setTopicTitle || set.title?.trim() || 'Lernkarten-Set'
}

export type DueFlashcardSetEntry = {
  pathId: string
  pathTitle: string
  setId: string
  topicLabel: string
  dueCards: LearnFlashcard[]
}

/** Aus dem aktuellen Datensatz-Cache alle fälligen Lernkarten-Sets über alle Lernpfade hinweg ableiten. */
function computeDueFlashcardSets(records: Map<string, LearningPathRecord>): DueFlashcardSetEntry[] {
  const out: DueFlashcardSetEntry[] = []
  for (const record of records.values()) {
    for (const set of record.learnFlashcardSets) {
      const dueCards = set.cards.filter((card) => isFlashcardDue(card))
      if (dueCards.length === 0) {
        continue
      }
      out.push({
        pathId: record.id,
        pathTitle: getDisplayPathTitle(record.title),
        setId: set.id,
        topicLabel: deriveFlashcardSetTopicLabel(record, set),
        dueCards,
      })
    }
  }
  return out
}

export type UseLearningPathsSidebarResult = {
  learningPaths: LearningPathSummary[]
  isLoading: boolean
  refreshLearningPaths: () => Promise<void>
  setLearningPaths: Dispatch<SetStateAction<LearningPathSummary[]>>
  /** Alle fälligen Lernkarten-Sets über alle Lernpfade hinweg (Sammel-Übersicht auf der Startseite). */
  dueFlashcardSets: DueFlashcardSetEntry[]
  dueFlashcardsTotalCount: number
  /** Bewertet eine fällige Karte, persistiert sie im richtigen Lernpfad und aktualisiert die Sammel-Übersicht. */
  rateDueFlashcard: (pathId: string, setId: string, cardId: string, rating: 'known' | 'unknown') => Promise<void>
}

export function useLearningPathsSidebar(userId: string | undefined): UseLearningPathsSidebarResult {
  const [learningPaths, setLearningPaths] = useState<LearningPathSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [dueFlashcardSets, setDueFlashcardSets] = useState<DueFlashcardSetEntry[]>([])
  const recordsByIdRef = useRef<Map<string, LearningPathRecord>>(new Map())

  const refreshLearningPaths = useCallback(async () => {
    if (!userId) {
      setLearningPaths([])
      recordsByIdRef.current = new Map()
      setDueFlashcardSets([])
      return
    }
    setIsLoading(true)
    try {
      const loaded = await listLearningPathsByUserId(userId)
      recordsByIdRef.current = new Map(loaded.map((record) => [record.id, record]))
      setDueFlashcardSets(computeDueFlashcardSets(recordsByIdRef.current))
      setLearningPaths(
        sortLearningPathsByCreatedAt(
          loaded.map((record) => {
            const { topicTitle, substepTitle } = deriveCurrentPosition(record)
            return {
              id: record.id,
              userId: record.userId,
              title: record.title,
              createdAt: record.createdAt,
              updatedAt: record.updatedAt,
              masteredTopicsCount: countMasteredTopics(record.topicSessions),
              totalTopicsCount: record.syllabus.length,
              currentTopicTitle: topicTitle,
              currentSubstepTitle: substepTitle,
            }
          }),
        ),
      )
    } catch {
      setLearningPaths([])
      recordsByIdRef.current = new Map()
      setDueFlashcardSets([])
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refreshLearningPaths()
  }, [refreshLearningPaths])

  const rateDueFlashcard = useCallback(
    async (pathId: string, setId: string, cardId: string, rating: 'known' | 'unknown') => {
      const record = recordsByIdRef.current.get(pathId)
      if (!record) {
        return
      }
      const nextSets = record.learnFlashcardSets.map((set) =>
        set.id === setId
          ? { ...set, cards: set.cards.map((c) => (c.id === cardId ? applyFlashcardReview(c, rating) : c)) }
          : set,
      )
      try {
        const updated = await updateLearningPathById(pathId, {
          title: getDisplayPathTitle(record.title),
          learnFlashcardSets: nextSets,
        })
        recordsByIdRef.current.set(pathId, updated)
        setDueFlashcardSets(computeDueFlashcardSets(recordsByIdRef.current))
      } catch {
        // Fire-and-forget aus Sicht der UI: bei Fehler bleibt die Karte fällig, nächster Versuch möglich.
      }
    },
    [],
  )

  const dueFlashcardsTotalCount = dueFlashcardSets.reduce((sum, entry) => sum + entry.dueCards.length, 0)

  return {
    learningPaths,
    isLoading,
    refreshLearningPaths,
    setLearningPaths,
    dueFlashcardSets,
    dueFlashcardsTotalCount,
    rateDueFlashcard,
  }
}
