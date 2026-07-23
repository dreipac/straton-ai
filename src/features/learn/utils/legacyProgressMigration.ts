import type { ChapterBlueprint, ChapterSession, TopicSession } from '../services/learn.persistence'

/**
 * Einmalige Migration alter, linear generierter Kapitel (`chapterBlueprints`/`chapterSession`) in das
 * Landkarte-Modell (`topicSessions`). Nötig, weil `topicSessions` für jeden Pfad automatisch mit
 * `status: 'locked'` initialisiert wird, sobald ein Syllabus existiert (`LearnPage.tsx`) — ein alter Pfad
 * mit echtem klassischen Fortschritt würde auf der Karte sonst fälschlich "alles gesperrt" zeigen.
 *
 * Migriert wird pro Index `i`, an dem ein echtes `chapterBlueprints[i]` existiert, aber `topicSessions[i]`
 * noch der frische, unbenutzte Platzhalter ist (kein Diagnose-/Schritt-Blueprint). Idempotent: läuft ein
 * zweites Mal über ein bereits migriertes Ergebnis, ändert sich nichts mehr (jedes migrierte `topicSessions[i]`
 * hat danach einen `stepBlueprints`-Eintrag und wird beim nächsten Aufruf übersprungen).
 */
export function migrateLegacyChapterProgressToTopicSessions(
  chapterBlueprints: ChapterBlueprint[],
  chapterSession: ChapterSession,
  topicSessions: TopicSession[],
): TopicSession[] {
  if (chapterBlueprints.length === 0) {
    return topicSessions
  }

  let changed = false
  const migrated = topicSessions.map((session, index) => {
    const blueprint = chapterBlueprints[index]
    const isUntouchedPlaceholder = session.entryCheckBlueprint === null && session.substeps.length === 0
    if (!blueprint || !isUntouchedPlaceholder) {
      return session
    }
    changed = true
    return buildMigratedTopicSession(index, blueprint, chapterSession)
  })

  return changed ? migrated : topicSessions
}

function buildMigratedTopicSession(
  topicIndex: number,
  blueprint: ChapterBlueprint,
  chapterSession: ChapterSession,
): TopicSession {
  const stepIdSet = new Set(blueprint.steps.map((step) => step.id))
  const filterRecord = <T>(source: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(source).filter(([key]) => stepIdSet.has(key)))

  const correctnessByStepId = filterRecord(chapterSession.correctnessByStepId)
  const isCompleted = chapterSession.completedChapterIndexes.includes(topicIndex)
  const attempts = Object.keys(correctnessByStepId).length
  const correct = Object.values(correctnessByStepId).filter(Boolean).length

  const stepSession: ChapterSession = {
    chapterIndex: 0,
    stepIndex:
      chapterSession.chapterIndex === topicIndex
        ? chapterSession.stepIndex
        : isCompleted
          ? Math.max(0, blueprint.steps.length - 1)
          : 0,
    answersByStepId: filterRecord(chapterSession.answersByStepId),
    feedbackByStepId: filterRecord(chapterSession.feedbackByStepId),
    correctnessByStepId,
    evaluatedAnswersByStepId: filterRecord(chapterSession.evaluatedAnswersByStepId),
    completedChapterIndexes: isCompleted ? [0] : [],
  }

  return {
    topicIndex,
    // Bereits generierte Kapitel wurden im alten Modell nur lazy erzeugt, sobald der Nutzer sie öffnete —
    // ein existierendes Blueprint bedeutet also immer "schon freigeschaltet", nie "gesperrt".
    status: isCompleted ? 'mastered' : 'learning',
    entryCheckBlueprint: null,
    entryCheckSession: null,
    substeps: [
      {
        blueprint,
        session: stepSession,
        masteryScore: attempts > 0 ? correct / attempts : 0,
        masteryAttempts: attempts,
        contentReady: true,
        completed: isCompleted,
        practiceFlashcardSetId: null,
      },
    ],
  }
}
