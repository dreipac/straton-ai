import type { ChapterBlueprint } from '../services/learn.persistence'

export type NamespaceChapterStepIdsOptions = {
  /** Nutzen, wenn nur ein Teil-Array namespaced wird (z. B. adaptives Kapitel nach bestehenden Kapiteln). */
  chapterIndexOffset?: number
}

/**
 * Stellt sicher, dass Step-IDs über alle Kapitel hinweg eindeutig sind.
 * KI-Ausgaben wiederholen oft dieselben ids (z. B. "q1") je Kapitel — ohne
 * Namespace kollidieren answersByStepId / feedbackByStepId und spätere
 * Kapitel zeigen fälschlich Inhalte wie im ersten Kapitel.
 */
export function namespaceChapterStepIds(
  blueprints: ChapterBlueprint[],
  options?: NamespaceChapterStepIdsOptions,
): ChapterBlueprint[] {
  const offset = options?.chapterIndexOffset ?? 0
  return blueprints.map((chapter, i) => {
    const chapterIndex = offset + i
    const prefix = `ch${chapterIndex}-`
    return {
      ...chapter,
      steps: chapter.steps.map((step) => {
        const id = step.id.startsWith(prefix) ? step.id : `${prefix}${step.id}`
        return { ...step, id }
      }),
    }
  })
}
