import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { evaluateQuizAnswerWithAi } from '../../chat/services/chat.service'
import type { InteractiveQuizPayload } from '../../chat/utils/interactiveQuiz'
import type { ChapterBlueprint, ChapterSession, EntryQuizResult, LearnTutorState, TutorChatEntry } from '../services/learn.persistence'
import { DEFAULT_CHAPTER_SESSION } from '../utils/learnPageHelpers'
import { buildPostEntryQuizTutorMessage } from '../utils/learnTutorCoachMessages'

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
  setChapterBlueprints: Dispatch<SetStateAction<ChapterBlueprint[]>>
  setChapterSession: Dispatch<SetStateAction<ChapterSession>>
}

export function useEntryQuizSubmissionFlow(args: UseEntryQuizSubmissionFlowArgs) {
  const {
    entryQuiz,
    isSubmittingEntryQuiz,
    entryQuizAnswers,
    entryQuizResult,
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
      }> = []
      let hadRateLimitIssue = false

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
          })
          continue
        }

        try {
          const result = await evaluateQuizAnswerWithAi({
            question,
            userAnswer: answer,
          })
          evaluations.push({
            questionId: question.id,
            answer,
            isCorrect: result.isCorrect,
            feedback: result.feedback,
          })
        } catch (error) {
          if (isRateLimitError(error)) {
            hadRateLimitIssue = true
          }
          evaluations.push({
            questionId: question.id,
            answer,
            isCorrect: false,
            feedback:
              'Die KI-Bewertung war kurz ausgelastet. Diese Antwort wurde vorerst als Lernpotenzial markiert.',
          })
        }

        // Reduziert Burst-Requests und senkt 429-Risiko bei mehreren Freitextfragen.
        await delay(140)
      }

      const score = evaluations.filter((entry) => entry.isCorrect).length
      const feedbackByQuestionId = evaluations.reduce<Record<string, string>>((acc, entry) => {
        acc[entry.questionId] = entry.feedback
        return acc
      }, {})
      const correctnessByQuestionId = evaluations.reduce<Record<string, boolean>>((acc, entry) => {
        acc[entry.questionId] = entry.isCorrect
        return acc
      }, {})
      const evaluatedAnswersByQuestionId = evaluations.reduce<Record<string, string>>((acc, entry) => {
        acc[entry.questionId] = entry.answer
        return acc
      }, {})

      setEntryQuizResult({
        score,
        total: entryQuiz.questions.length,
        feedbackByQuestionId,
        correctnessByQuestionId,
        evaluatedAnswersByQuestionId,
      })

      closeEntryQuizModal()
      setTutorMessages([])
      setIsChapterPreviewVisible(false)
      setLearningChapters([])
      setChapterBlueprints([])
      setChapterSession(DEFAULT_CHAPTER_SESSION)
      const scoreRatio = entryQuiz.questions.length > 0 ? score / entryQuiz.questions.length : 0
      const recommendedChapterCount = scoreRatio < 0.4 ? 4 : scoreRatio < 0.7 ? 3 : 2
      setTutorState('entry_quiz_done')
      setCurrentChapterIndex(0)
      setTargetChapterCount(recommendedChapterCount)
      setUnlockedChapterCount(1)
      setPostEntryPrepStepIndex(0)
      setPostEntryPrepPercents([0, 0])
      setIsPostEntryPrepLoading(false)

      setTutorMessages([
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: buildPostEntryQuizTutorMessage(score, entryQuiz.questions.length),
          action: 'start-next-chapter',
        },
      ])
      if (hadRateLimitIssue) {
        setError('Hinweis: Einzelne Antworten wurden wegen KI-Auslastung vorläufig konservativ bewertet.')
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
