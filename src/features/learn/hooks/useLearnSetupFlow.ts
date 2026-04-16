import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { sendMessage } from '../../chat/services/chat.service'
import { useSystemPrompts } from '../../systemPrompts/useSystemPrompts'
import type { ChatMessage } from '../../chat/types'
import type {
  ChapterBlueprint,
  ChapterSession,
  EntryQuizResult,
  TutorChatEntry,
  UploadedMaterial,
} from '../services/learn.persistence'
import type { InteractiveQuizPayload } from '../../chat/utils/interactiveQuiz'
import { formatRelevantMaterialContext } from '../utils/ragLite'
import { DEFAULT_CHAPTER_SESSION } from '../utils/learnPageHelpers'

type UseLearnSetupFlowArgs = {
  isUploading: boolean
  isAnalyzingSetupTopic: boolean
  materials: UploadedMaterial[]
  proficiencyLevel: '' | 'low' | 'medium' | 'high'
  setError: Dispatch<SetStateAction<string | null>>
  setIsAnalyzingSetupTopic: Dispatch<SetStateAction<boolean>>
  setSetupAnalysisPercent: Dispatch<SetStateAction<number>>
  setTopic: Dispatch<SetStateAction<string>>
  setSelectedTopic: Dispatch<SetStateAction<string>>
  setTopicSuggestions: Dispatch<SetStateAction<string[]>>
  setSetupStep: Dispatch<SetStateAction<1 | 2 | 3 | 4>>
  setHasTriedEntryQuizGeneration: Dispatch<SetStateAction<boolean>>
  setIsEntryQuizLoading: Dispatch<SetStateAction<boolean>>
  setIsEntryPrepClosing: Dispatch<SetStateAction<boolean>>
  setEntryPrepStepIndex: Dispatch<SetStateAction<number>>
  setEntryPrepPercents: Dispatch<SetStateAction<number[]>>
  setIsPostEntryPrepLoading: Dispatch<SetStateAction<boolean>>
  setPostEntryPrepStepIndex: Dispatch<SetStateAction<number>>
  setPostEntryPrepPercents: Dispatch<SetStateAction<number[]>>
  setIsSetupComplete: Dispatch<SetStateAction<boolean>>
  setTutorMessages: Dispatch<SetStateAction<TutorChatEntry[]>>
  setEntryQuiz: Dispatch<SetStateAction<InteractiveQuizPayload | null>>
  setEntryQuizAnswers: Dispatch<SetStateAction<Record<string, string>>>
  setEntryQuizResult: Dispatch<SetStateAction<EntryQuizResult | null>>
  setLearningChapters: Dispatch<SetStateAction<string[]>>
  setChapterBlueprints: Dispatch<SetStateAction<ChapterBlueprint[]>>
  setChapterSession: Dispatch<SetStateAction<ChapterSession>>
  setEntryQuizQuestionIndex: Dispatch<SetStateAction<number>>
}

export function useLearnSetupFlow(args: UseLearnSetupFlowArgs) {
  const { getPrompt } = useSystemPrompts()
  const {
    isUploading,
    isAnalyzingSetupTopic,
    materials,
    proficiencyLevel,
    setError,
    setIsAnalyzingSetupTopic,
    setSetupAnalysisPercent,
    setTopic,
    setSelectedTopic,
    setTopicSuggestions,
    setSetupStep,
    setHasTriedEntryQuizGeneration,
    setIsEntryQuizLoading,
    setIsEntryPrepClosing,
    setEntryPrepStepIndex,
    setEntryPrepPercents,
    setIsPostEntryPrepLoading,
    setPostEntryPrepStepIndex,
    setPostEntryPrepPercents,
    setIsSetupComplete,
    setTutorMessages,
    setEntryQuiz,
    setEntryQuizAnswers,
    setEntryQuizResult,
    setLearningChapters,
    setChapterBlueprints,
    setChapterSession,
    setEntryQuizQuestionIndex,
  } = args

  const handleContinueSetupStepOne = useCallback(() => {
    if (isUploading || isAnalyzingSetupTopic) {
      return
    }

    if (materials.length === 0) {
      setError('Bitte lade zuerst mindestens eine Datei hoch.')
      return
    }

    const previewText =
      formatRelevantMaterialContext('Thema aus Unterlagen erkennen', materials, {
        maxChunks: 10,
        maxChars: 6800,
        denseChunks: true,
        emphasizePersonalSources: true,
      }) || '(Kein auswertbarer Text gefunden)'

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: [
        'Analysiere die hochgeladenen Unterlagen und bestimme genau ein passendes Lernthema.',
        'Antwortformat:',
        'THEMA: <kurzer Titel>',
        '',
        previewText,
      ].join('\n'),
      createdAt: new Date().toISOString(),
    }

    setError(null)
    setIsAnalyzingSetupTopic(true)
    void sendMessage([userMessage], {
      interactiveQuizPrompt: getPrompt('interactive_quiz'),
      systemPrompt: getPrompt('learn_setup_topic'),
      useLearnPathModel: true,
    })
      .then(async ({ assistantMessage }) => {
        const raw = assistantMessage.content.trim()
        const themeLine = raw
          .split('\n')
          .map((line) => line.trim())
          .find((line) => line.toUpperCase().startsWith('THEMA:'))
        const detectedTopic = (themeLine ? themeLine.slice(6) : raw)
          .replace(/["']/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 80)

        if (!detectedTopic) {
          setError('Thema konnte aus den Dateien nicht erkannt werden. Bitte versuche es erneut.')
          return
        }

        setSetupAnalysisPercent(100)
        await new Promise<void>((resolve) => {
          window.setTimeout(() => resolve(), 180)
        })
        setTopic(detectedTopic)
        setSelectedTopic(detectedTopic)
        setTopicSuggestions([])
        setSetupStep(2)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Dateien konnten nicht analysiert werden.')
      })
      .finally(() => {
        setIsAnalyzingSetupTopic(false)
      })
  }, [
    getPrompt,
    isAnalyzingSetupTopic,
    isUploading,
    materials,
    setError,
    setIsAnalyzingSetupTopic,
    setSelectedTopic,
    setSetupAnalysisPercent,
    setSetupStep,
    setTopic,
    setTopicSuggestions,
  ])

  const handleContinueSetupStepTwo = useCallback(() => {
    setError(null)
    setSetupStep(3)
  }, [setError, setSetupStep])

  const handleContinueSetupStepThree = useCallback(() => {
    if (!proficiencyLevel) {
      setError('Bitte waehle deine Selbsteinschaetzung aus.')
      return
    }
    setError(null)
    setSetupStep(4)
  }, [proficiencyLevel, setError, setSetupStep])

  const handleFinishSetup = useCallback(() => {
    if (!proficiencyLevel) {
      setError('Bitte waehle deine Selbsteinschaetzung aus.')
      return
    }
    setError(null)
    setHasTriedEntryQuizGeneration(false)
    setIsEntryQuizLoading(false)
    setIsEntryPrepClosing(false)
    setEntryPrepStepIndex(0)
    setEntryPrepPercents([0, 0, 0])
    setIsPostEntryPrepLoading(false)
    setPostEntryPrepStepIndex(0)
    setPostEntryPrepPercents([0, 0])
    setIsSetupComplete(true)
    setTutorMessages([])
    setEntryQuiz(null)
    setEntryQuizAnswers({})
    setEntryQuizResult(null)
    setLearningChapters([])
    setChapterBlueprints([])
    setChapterSession(DEFAULT_CHAPTER_SESSION)
    setEntryQuizQuestionIndex(0)
  }, [
    proficiencyLevel,
    setChapterBlueprints,
    setChapterSession,
    setEntryPrepPercents,
    setEntryPrepStepIndex,
    setEntryQuiz,
    setEntryQuizAnswers,
    setEntryQuizQuestionIndex,
    setEntryQuizResult,
    setError,
    setHasTriedEntryQuizGeneration,
    setIsEntryPrepClosing,
    setIsEntryQuizLoading,
    setIsPostEntryPrepLoading,
    setIsSetupComplete,
    setLearningChapters,
    setPostEntryPrepPercents,
    setPostEntryPrepStepIndex,
    setTutorMessages,
  ])

  return {
    handleContinueSetupStepOne,
    handleContinueSetupStepTwo,
    handleContinueSetupStepThree,
    handleFinishSetup,
  }
}
