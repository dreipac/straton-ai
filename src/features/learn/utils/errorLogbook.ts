import type { InteractiveQuizPayload } from '../../chat/utils/interactiveQuiz'
import type {
  ChapterBlueprint,
  ChapterSession,
  ChapterStep,
  EntryQuizResult,
  LearnWorksheetItem,
} from '../services/learn.persistence'

export type ErrorLogbookSource = 'entry_quiz' | 'chapter' | 'worksheet'

export type ErrorLogbookEntry = {
  id: string
  source: ErrorLogbookSource
  sourceLabel: string
  contextLabel: string
  prompt: string
  userAnswer: string
  feedback: string
  /** Kapitel-Schritt: für spätere Navigation */
  chapterStepId?: string
  chapterIndex?: number
  worksheetItemId?: string
  worksheetChapterIndex?: number
}

export type ErrorLogbookFilter = 'all' | ErrorLogbookSource

export type ErrorLogbookInput = {
  entryQuiz: InteractiveQuizPayload | null
  entryQuizAnswers: Record<string, string>
  entryQuizResult: EntryQuizResult | null
  chapterBlueprints: ChapterBlueprint[]
  chapterSession: ChapterSession
  learningChapters: string[]
  learnWorksheets: LearnWorksheetItem[]
}

export type ErrorLogbookStats = {
  total: number
  entryQuiz: number
  chapter: number
  worksheet: number
}

const SOURCE_LABEL: Record<ErrorLogbookSource, string> = {
  entry_quiz: 'Einstiegstest',
  chapter: 'Kapitel',
  worksheet: 'Arbeitsblatt',
}

function trimOrDash(value: string | undefined): string {
  const t = value?.trim()
  return t ? t : '—'
}

function chapterTitleForIndex(blueprints: ChapterBlueprint[], learningChapters: string[], index: number): string {
  const fromBlueprint = blueprints[index]?.title?.trim()
  if (fromBlueprint) {
    return fromBlueprint
  }
  const fromList = learningChapters[index]?.trim()
  if (fromList) {
    return fromList
  }
  return `Kapitel ${index + 1}`
}

function formatChapterUserAnswer(step: Extract<ChapterStep, { type: 'question' }>, raw: string): string {
  const answer = raw.trim()
  if (!answer) {
    return '—'
  }
  if (step.questionType === 'match' && step.matchLeft?.length && step.matchRight?.length) {
    return answer
  }
  return answer
}

export function buildErrorLogbookEntries(input: ErrorLogbookInput): ErrorLogbookEntry[] {
  const entries: ErrorLogbookEntry[] = []

  if (input.entryQuiz && input.entryQuizResult) {
    const correctness = input.entryQuizResult.correctnessByQuestionId ?? {}
    const feedbackMap = input.entryQuizResult.feedbackByQuestionId ?? {}
    const evaluatedAnswers = input.entryQuizResult.evaluatedAnswersByQuestionId ?? {}
    for (const question of input.entryQuiz.questions) {
      if (correctness[question.id] !== false) {
        continue
      }
      entries.push({
        id: `entry-${question.id}`,
        source: 'entry_quiz',
        sourceLabel: SOURCE_LABEL.entry_quiz,
        contextLabel: input.entryQuiz.title?.trim() || 'Einstiegstest',
        prompt: question.prompt.trim(),
        userAnswer: trimOrDash(
          evaluatedAnswers[question.id] ?? input.entryQuizAnswers[question.id],
        ),
        feedback: trimOrDash(feedbackMap[question.id] ?? question.explanation),
      })
    }
  }

  for (let chapterIndex = 0; chapterIndex < input.chapterBlueprints.length; chapterIndex += 1) {
    const chapter = input.chapterBlueprints[chapterIndex]
    if (!chapter) {
      continue
    }
    const contextLabel = chapterTitleForIndex(input.chapterBlueprints, input.learningChapters, chapterIndex)
    for (const step of chapter.steps) {
      if (step.type !== 'question') {
        continue
      }
      if (input.chapterSession.correctnessByStepId[step.id] !== false) {
        continue
      }
      entries.push({
        id: `chapter-${chapter.id}-${step.id}`,
        source: 'chapter',
        sourceLabel: SOURCE_LABEL.chapter,
        contextLabel,
        prompt: step.prompt.trim(),
        userAnswer: formatChapterUserAnswer(
          step,
          input.chapterSession.answersByStepId[step.id] ?? '',
        ),
        feedback: trimOrDash(
          input.chapterSession.feedbackByStepId[step.id] ?? step.explanation,
        ),
        chapterStepId: step.id,
        chapterIndex,
      })
    }
  }

  for (const item of input.learnWorksheets) {
    if (item.evaluated !== true || item.lastCorrect !== false) {
      continue
    }
    const chapterIndex =
      typeof item.chapterIndex === 'number' && item.chapterIndex >= 0 ? item.chapterIndex : undefined
    const contextLabel =
      chapterIndex !== undefined
        ? chapterTitleForIndex(input.chapterBlueprints, input.learningChapters, chapterIndex)
        : 'Arbeitsblatt'
    entries.push({
      id: `worksheet-${item.id}`,
      source: 'worksheet',
      sourceLabel: SOURCE_LABEL.worksheet,
      contextLabel,
      prompt: item.prompt.trim(),
      userAnswer: trimOrDash(item.savedAnswer),
      feedback: 'Als nicht korrekt markiert (Kreis-Prüfung).',
      worksheetItemId: item.id,
      worksheetChapterIndex: chapterIndex,
    })
  }

  return entries
}

export function getErrorLogbookStats(entries: ErrorLogbookEntry[]): ErrorLogbookStats {
  let entryQuiz = 0
  let chapter = 0
  let worksheet = 0
  for (const entry of entries) {
    if (entry.source === 'entry_quiz') {
      entryQuiz += 1
    } else if (entry.source === 'chapter') {
      chapter += 1
    } else if (entry.source === 'worksheet') {
      worksheet += 1
    }
  }
  return {
    total: entries.length,
    entryQuiz,
    chapter,
    worksheet,
  }
}

export function filterErrorLogbookEntries(
  entries: ErrorLogbookEntry[],
  filter: ErrorLogbookFilter,
): ErrorLogbookEntry[] {
  if (filter === 'all') {
    return entries
  }
  return entries.filter((e) => e.source === filter)
}

const ERROR_HINT_DISMISS_STORAGE_PREFIX = 'straton-learn-error-hint-dismissed:'

/** Gespeicherte Lücken-Anzahl beim Schließen des Hinweises (pro Lernpfad). */
export function getErrorHintDismissedCount(pathId: string): number | null {
  if (typeof window === 'undefined' || !pathId.trim()) {
    return null
  }
  const raw = window.localStorage.getItem(`${ERROR_HINT_DISMISS_STORAGE_PREFIX}${pathId}`)
  if (raw === null) {
    return null
  }
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function setErrorHintDismissed(pathId: string, errorCount: number): void {
  if (typeof window === 'undefined' || !pathId.trim()) {
    return
  }
  window.localStorage.setItem(`${ERROR_HINT_DISMISS_STORAGE_PREFIX}${pathId}`, String(Math.max(0, errorCount)))
}

/** Hinweis-Karte / Tab-Hervorhebung, solange nicht geschlossen oder neue Lücken dazu kamen. */
export function shouldShowErrorLogbookHint(pathId: string, currentErrorTotal: number): boolean {
  if (!pathId.trim() || currentErrorTotal <= 0) {
    return false
  }
  const dismissedAt = getErrorHintDismissedCount(pathId)
  if (dismissedAt === null) {
    return true
  }
  return currentErrorTotal > dismissedAt
}
