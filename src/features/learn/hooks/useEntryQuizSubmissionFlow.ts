import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { evaluateQuizAnswerWithAi } from '../../chat/services/chat.service'
import type { InteractiveQuizPayload } from '../../chat/utils/interactiveQuiz'
import type { ChapterBlueprint, ChapterSession, EntryQuizResult, LearnGenerationMode, LearnTutorState, SyllabusEntry, TutorChatEntry } from '../services/learn.persistence'
import { DEFAULT_CHAPTER_SESSION } from '../utils/learnPageHelpers'
import { evaluatePlaceholderAnswer } from '../utils/learnPlaceholder'

function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  const message = error.message.toLowerCase()
  return message.includes('429') || message.includes('rate limit') || message.includes('too many requests')
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

type UseEntryQuizSubmissionFlowArgs = {
  entryQuiz: InteractiveQuizPayload | null
  isSubmittingEntryQuiz: boolean
  entryQuizAnswers: Record<string, string>
  entryQuizResult: EntryQuizResult | null
  generationMode: LearnGenerationMode
  closeEntryQuizModal: () => void
  setError: Dispatch<SetStateAction<string | null>>
  setIsSubmittingEntryQuiz: Dispatch<SetStateAction<boolean>>
  setEntryQuizResult: Dispatch<SetStateAction<EntryQuizResult | null>>
  setTutorState: Dispatch<SetStateAction<LearnTutorState>>
  setCurrentChapterIndex: Dispatch<SetStateAction<number>>
  setTargetChapterCount: Dispatch<SetStateAction<number>>
  setUnlockedChapterCount: Dispatch<SetStateAction<number>>
  setTutorMessages: Dispatch<SetStateAction<TutorChatEntry[]>>
  setIsChapterPreviewVisible: Dispatch<SetStateAction<boolean>>
  setIsPostEntryPrepLoading: Dispatch<SetStateAction<boolean>>
  setPostEntryPrepStepIndex: Dispatch<SetStateAction<number>>
  setPostEntryPrepPercents: Dispatch<SetStateAction<number[]>>
  setLearningChapters: Dispatch<SetStateAction<string[]>>
  setSyllabus: Dispatch<SetStateAction<SyllabusEntry[]>>
  setChapterBlueprints: Dispatch<SetStateAction<ChapterBlueprint[]>>
  setChapterSession: Dispatch<SetStateAction<ChapterSession>>
}

export function useEntryQuizSubmissionFlow(args: UseEntryQuizSubmissionFlowArgs) {
  const {
    entryQuiz,
    isSubmittingEntryQuiz,
    entryQuizAnswers,
    entryQuizResult,
    generationMode,
    closeEntryQuizModal,
    setError,
    setIsSubmittingEntryQuiz,
    setEntryQuizResult,
    setTutorState,
    setCurrentChapterIndex,
    setTargetChapterCount,
    setUnlockedChapterCount,
    setTutorMessages,
    setIsChapterPreviewVisible,
    setIsPostEntryPrepLoading,
    setPostEntryPrepStepIndex,
    setPostEntryPrepPercents,
    setLearningChapters,
    setSyllabus,
    setChapterBlueprints,
    setChapterSession,
  } = args

  const handleSubmitEntryQuiz = useCallback(async () => {
    if (!entryQuiz || isSubmittingEntryQuiz) {
      return
    }

    setError(null)
    setIsSubmittingEntryQuiz(true)

    try {
      const cachedFeedback = entryQuizResult?.feedbackByQuestionId ?? {}
      const cachedCorrectness = entryQuizResult?.correctnessByQuestionId ?? {}
      const cachedAnswers = entryQuizResult?.evaluatedAnswersByQuestionId ?? {}

      const evaluations: Array<{
        questionId: string
        answer: string
        isCorrect: boolean
        feedback: string
        /** false = KI-Bewertung fehlgeschlagen → NICHT als falsch werten, sondern als „nicht bewertet". */
        evaluated: boolean
      }> = []
      let unevaluatedCount = 0

      for (const question of entryQuiz.questions) {
        const answer = (entryQuizAnswers[question.id] ?? '').trim()
        const canReuseCachedEvaluation =
          cachedAnswers[question.id] === answer &&
          typeof cachedFeedback[question.id] === 'string' &&
          typeof cachedCorrectness[question.id] === 'boolean'

        if (canReuseCachedEvaluation) {
          evaluations.push({
            questionId: question.id,
            answer,
            isCorrect: cachedCorrectness[question.id],
            feedback: cachedFeedback[question.id],
            evaluated: true,
          })
          continue
        }

        // Platzhalter-Modus: lokale Bewertung ohne KI (MCQ/Match exakt, Freitext via exact/contains).
        if (generationMode === 'placeholder') {
          const local = evaluatePlaceholderAnswer(question, answer)
          evaluations.push({
            questionId: question.id,
            answer,
            isCorrect: local.isCorrect,
            feedback: local.feedback,
            evaluated: true,
          })
          continue
        }

        // Bis zu 3 Versuche mit Backoff: senkt transiente 429-Fehler deutlich, bevor wir aufgeben.
        let evaluated = false
        let isCorrect = false
        let feedback = ''
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            const result = await evaluateQuizAnswerWithAi({ question, userAnswer: answer })
            isCorrect = result.isCorrect
            feedback = result.feedback
            evaluated = true
            break
          } catch (error) {
            if (attempt < 3 && isRateLimitError(error)) {
              await delay(400 * attempt)
              continue
            }
            break
          }
        }

        if (evaluated) {
          evaluations.push({ questionId: question.id, answer, isCorrect, feedback, evaluated: true })
        } else {
          unevaluatedCount += 1
          evaluations.push({ questionId: question.id, answer, isCorrect: false, feedback: '', evaluated: false })
        }

        // Reduziert Burst-Requests und senkt 429-Risiko bei mehreren Freitextfragen.
        await delay(140)
      }

      // Nur erfolgreich bewertete Fragen zählen — „nicht bewertet" verfälscht weder Score,
      // noch Schwachstellen-Analyse (Kapitelgenerierung) noch das Fehlerlogbuch.
      const evaluatedEntries = evaluations.filter((entry) => entry.evaluated)
      const score = evaluatedEntries.filter((entry) => entry.isCorrect).length
      const total = evaluatedEntries.length
      const feedbackByQuestionId = evaluatedEntries.reduce<Record<string, string>>((acc, entry) => {
        acc[entry.questionId] = entry.feedback
        return acc
      }, {})
      const correctnessByQuestionId = evaluatedEntries.reduce<Record<string, boolean>>((acc, entry) => {
        acc[entry.questionId] = entry.isCorrect
        return acc
      }, {})
      const evaluatedAnswersByQuestionId = evaluatedEntries.reduce<Record<string, string>>((acc, entry) => {
        acc[entry.questionId] = entry.answer
        return acc
      }, {})

      setEntryQuizResult({
        score,
        total,
        feedbackByQuestionId,
        correctnessByQuestionId,
        evaluatedAnswersByQuestionId,
      })

      closeEntryQuizModal()
      setTutorMessages([])
      setIsChapterPreviewVisible(false)
      setLearningChapters([])
      setSyllabus([])
      setChapterBlueprints([])
      setChapterSession(DEFAULT_CHAPTER_SESSION)
      const scoreRatio = total > 0 ? score / total : 0
      const recommendedChapterCount = scoreRatio < 0.4 ? 4 : scoreRatio < 0.7 ? 3 : 2
      setTutorState('entry_quiz_done')
      setCurrentChapterIndex(0)
      setTargetChapterCount(recommendedChapterCount)
      setUnlockedChapterCount(1)
      setPostEntryPrepStepIndex(0)
      setPostEntryPrepPercents([0, 0])
      setIsPostEntryPrepLoading(true)

      setTutorMessages([])
      if (unevaluatedCount > 0) {
        setError(
          `Hinweis: ${unevaluatedCount} Frage${unevaluatedCount === 1 ? '' : 'n'} konnten wegen KI-Auslastung nicht bewertet werden und zählen nicht ins Ergebnis. Öffne den Einstiegstest erneut und gib ihn nochmals ab, um sie nachzubewerten.`,
        )
      }
    } catch (err) {
      console.error('Lernbereich: Einstiegstest-Auswertung fehlgeschlagen', err)
      setError(err instanceof Error ? err.message : 'Einstiegstest konnte nicht abgegeben werden.')
    } finally {
      setIsPostEntryPrepLoading(false)
      setIsSubmittingEntryQuiz(false)
    }
  }, [
    closeEntryQuizModal,
    entryQuiz,
    entryQuizAnswers,
    entryQuizResult,
    generationMode,
    isSubmittingEntryQuiz,
    setChapterBlueprints,
    setChapterSession,
    setEntryQuizResult,
    setError,
    setCurrentChapterIndex,
    setIsChapterPreviewVisible,
    setIsPostEntryPrepLoading,
    setIsSubmittingEntryQuiz,
    setTargetChapterCount,
    setLearningChapters,
    setSyllabus,
    setTutorState,
    setUnlockedChapterCount,
    setPostEntryPrepPercents,
    setPostEntryPrepStepIndex,
    setTutorMessages,
  ])

  return {
    handleSubmitEntryQuiz,
  }
}
