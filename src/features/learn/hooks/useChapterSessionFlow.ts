import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { evaluateQuizAnswerWithAi } from '../../chat/services/chat.service'
import { evaluateInteractiveAnswer } from '../../chat/utils/interactiveQuiz'
import type { ChapterBlueprint, ChapterSession } from '../services/learn.persistence'

type UseChapterSessionFlowArgs = {
  effectiveChapterBlueprints: ChapterBlueprint[]
  chapterSession: ChapterSession
  isEvaluatingChapterStep: boolean
  setChapterSession: Dispatch<SetStateAction<ChapterSession>>
  setIsEvaluatingChapterStep: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
}

export function useChapterSessionFlow(args: UseChapterSessionFlowArgs) {
  const {
    effectiveChapterBlueprints,
    chapterSession,
    isEvaluatingChapterStep,
    setChapterSession,
    setIsEvaluatingChapterStep,
    setError,
  } = args

  const handleEvaluateCurrentChapterQuestion = useCallback(async () => {
    const activeChapter =
      effectiveChapterBlueprints[Math.max(0, Math.min(chapterSession.chapterIndex, effectiveChapterBlueprints.length - 1))]
    const activeStep = activeChapter?.steps[Math.max(0, Math.min(chapterSession.stepIndex, (activeChapter?.steps.length ?? 1) - 1))]
    if (!activeChapter || !activeStep || activeStep.type !== 'question' || isEvaluatingChapterStep) {
      return
    }
    const answer = (chapterSession.answersByStepId[activeStep.id] ?? '').trim()
    if (!answer) {
      return
    }

    setIsEvaluatingChapterStep(true)
    try {
      const cachedAnswer = chapterSession.evaluatedAnswersByStepId[activeStep.id]
      const cachedFeedback = chapterSession.feedbackByStepId[activeStep.id]
      const cachedCorrect = chapterSession.correctnessByStepId[activeStep.id]
      if (cachedAnswer === answer && typeof cachedFeedback === 'string' && typeof cachedCorrect === 'boolean') {
        return
      }

      let result: { isCorrect: boolean; feedback: string }
      if (activeStep.questionType === 'mcq') {
        result = evaluateInteractiveAnswer(answer, {
          id: activeStep.id,
          prompt: activeStep.prompt,
          expectedAnswer: activeStep.expectedAnswer,
          acceptableAnswers: activeStep.acceptableAnswers ?? [],
          evaluation: activeStep.evaluation === 'contains' ? 'contains' : 'exact',
          hint: activeStep.hint,
          explanation: activeStep.explanation,
        })
      } else {
        result = await evaluateQuizAnswerWithAi({
          question: {
            id: activeStep.id,
            prompt: activeStep.prompt,
            expectedAnswer: activeStep.expectedAnswer,
            acceptableAnswers: activeStep.acceptableAnswers ?? [],
            evaluation: activeStep.evaluation === 'contains' ? 'contains' : 'exact',
            hint: activeStep.hint,
            explanation: activeStep.explanation,
          },
          userAnswer: answer,
        })
      }

      setChapterSession((prev) => ({
        ...prev,
        feedbackByStepId: {
          ...prev.feedbackByStepId,
          [activeStep.id]: result.feedback,
        },
        correctnessByStepId: {
          ...prev.correctnessByStepId,
          [activeStep.id]: result.isCorrect,
        },
        evaluatedAnswersByStepId: {
          ...prev.evaluatedAnswersByStepId,
          [activeStep.id]: answer,
        },
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Frage konnte nicht ausgewertet werden.')
    } finally {
      setIsEvaluatingChapterStep(false)
    }
  }, [
    chapterSession.answersByStepId,
    chapterSession.chapterIndex,
    chapterSession.correctnessByStepId,
    chapterSession.evaluatedAnswersByStepId,
    chapterSession.feedbackByStepId,
    chapterSession.stepIndex,
    effectiveChapterBlueprints,
    isEvaluatingChapterStep,
    setChapterSession,
    setError,
    setIsEvaluatingChapterStep,
  ])

  const handleNextChapterStep = useCallback(() => {
    const activeChapter =
      effectiveChapterBlueprints[Math.max(0, Math.min(chapterSession.chapterIndex, effectiveChapterBlueprints.length - 1))]
    const activeStep = activeChapter?.steps[Math.max(0, Math.min(chapterSession.stepIndex, (activeChapter?.steps.length ?? 1) - 1))]
    if (!activeChapter || !activeStep) {
      return
    }

    if (activeStep.type === 'question' && !chapterSession.feedbackByStepId[activeStep.id]) {
      return
    }

    setChapterSession((prev) => {
      const chapter =
        effectiveChapterBlueprints[Math.max(0, Math.min(prev.chapterIndex, effectiveChapterBlueprints.length - 1))]
      if (!chapter) {
        return prev
      }
      if (prev.stepIndex < chapter.steps.length - 1) {
        return {
          ...prev,
          stepIndex: prev.stepIndex + 1,
        }
      }
      const nextChapterIndex = Math.min(effectiveChapterBlueprints.length - 1, prev.chapterIndex + 1)
      const isCompleted = prev.completedChapterIndexes.includes(prev.chapterIndex)
      return {
        ...prev,
        chapterIndex: nextChapterIndex,
        stepIndex: 0,
        completedChapterIndexes: isCompleted ? prev.completedChapterIndexes : [...prev.completedChapterIndexes, prev.chapterIndex],
      }
    })
  }, [
    chapterSession.chapterIndex,
    chapterSession.feedbackByStepId,
    chapterSession.stepIndex,
    effectiveChapterBlueprints,
    setChapterSession,
  ])

  const handlePreviousChapterStep = useCallback(() => {
    setChapterSession((prev) => {
      if (prev.stepIndex > 0) {
        return {
          ...prev,
          stepIndex: prev.stepIndex - 1,
        }
      }
      if (prev.chapterIndex > 0) {
        const previousChapter = effectiveChapterBlueprints[prev.chapterIndex - 1]
        return {
          ...prev,
          chapterIndex: prev.chapterIndex - 1,
          stepIndex: Math.max(0, (previousChapter?.steps.length ?? 1) - 1),
        }
      }
      return prev
    })
  }, [effectiveChapterBlueprints, setChapterSession])

  return {
    handleEvaluateCurrentChapterQuestion,
    handleNextChapterStep,
    handlePreviousChapterStep,
  }
}
