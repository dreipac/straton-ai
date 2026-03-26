import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

type UseEntryQuizUiFlowArgs = {
  entryQuizCloseTimerRef: MutableRefObject<number | null>
  modalAnimationMs: number
  entryQuizTotalQuestions: number
  setIsEntryQuizMounted: Dispatch<SetStateAction<boolean>>
  setIsEntryQuizVisible: Dispatch<SetStateAction<boolean>>
  setEntryQuizQuestionIndex: Dispatch<SetStateAction<number>>
  setEntryQuizAnswers: Dispatch<SetStateAction<Record<string, string>>>
}

export function useEntryQuizUiFlow(args: UseEntryQuizUiFlowArgs) {
  const {
    entryQuizCloseTimerRef,
    modalAnimationMs,
    entryQuizTotalQuestions,
    setIsEntryQuizMounted,
    setIsEntryQuizVisible,
    setEntryQuizQuestionIndex,
    setEntryQuizAnswers,
  } = args

  const openEntryQuizModal = useCallback(() => {
    if (entryQuizCloseTimerRef.current) {
      window.clearTimeout(entryQuizCloseTimerRef.current)
      entryQuizCloseTimerRef.current = null
    }
    setIsEntryQuizMounted(true)
    setEntryQuizQuestionIndex(0)
    window.requestAnimationFrame(() => {
      setIsEntryQuizVisible(true)
    })
  }, [entryQuizCloseTimerRef, setEntryQuizQuestionIndex, setIsEntryQuizMounted, setIsEntryQuizVisible])

  const closeEntryQuizModal = useCallback(() => {
    setIsEntryQuizVisible(false)
    entryQuizCloseTimerRef.current = window.setTimeout(() => {
      setIsEntryQuizMounted(false)
      entryQuizCloseTimerRef.current = null
    }, modalAnimationMs)
  }, [entryQuizCloseTimerRef, modalAnimationMs, setIsEntryQuizMounted, setIsEntryQuizVisible])

  const handleEntryQuizAnswerChange = useCallback(
    (questionId: string, value: string) => {
      setEntryQuizAnswers((prev) => ({
        ...prev,
        [questionId]: value,
      }))
    },
    [setEntryQuizAnswers],
  )

  const handlePreviousEntryQuestion = useCallback(() => {
    setEntryQuizQuestionIndex((prev) => Math.max(0, prev - 1))
  }, [setEntryQuizQuestionIndex])

  const handleNextEntryQuestion = useCallback(() => {
    setEntryQuizQuestionIndex((prev) => Math.min(Math.max(0, entryQuizTotalQuestions - 1), prev + 1))
  }, [entryQuizTotalQuestions, setEntryQuizQuestionIndex])

  return {
    openEntryQuizModal,
    closeEntryQuizModal,
    handleEntryQuizAnswerChange,
    handlePreviousEntryQuestion,
    handleNextEntryQuestion,
  }
}
