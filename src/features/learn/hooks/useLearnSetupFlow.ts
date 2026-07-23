import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { sendMessage } from '../../chat/services/chat.service'
import { useSystemPrompts } from '../../systemPrompts/useSystemPrompts'
import type { ChatMessage } from '../../chat/types'
import type {
  ChapterBlueprint,
  ChapterSession,
  LearnGenerationMode,
  LearnTutorState,
  SkillMasteryBySkillId,
  SyllabusEntry,
  TopicSession,
  TutorChatEntry,
  UploadedMaterial,
} from '../services/learn.persistence'
import { formatRelevantMaterialContext } from '../utils/ragLite'
import { DEFAULT_CHAPTER_SESSION } from '../utils/learnPageHelpers'
import { PLACEHOLDER_TOPIC, placeholderDelay } from '../utils/learnPlaceholder'

type UseLearnSetupFlowArgs = {
  isUploading: boolean
  isAnalyzingSetupTopic: boolean
  materials: UploadedMaterial[]
  proficiencyLevel: '' | 'low' | 'medium' | 'high'
  generationMode: LearnGenerationMode
  setError: Dispatch<SetStateAction<string | null>>
  setIsAnalyzingSetupTopic: Dispatch<SetStateAction<boolean>>
  setSetupAnalysisPercent: Dispatch<SetStateAction<number>>
  setTopic: Dispatch<SetStateAction<string>>
  setSelectedTopic: Dispatch<SetStateAction<string>>
  setTopicSuggestions: Dispatch<SetStateAction<string[]>>
  setSetupStep: Dispatch<SetStateAction<1 | 2 | 3 | 4>>
  setIsPostEntryPrepLoading: Dispatch<SetStateAction<boolean>>
  setPostEntryPrepStepIndex: Dispatch<SetStateAction<number>>
  setPostEntryPrepPercents: Dispatch<SetStateAction<number[]>>
  setIsSetupComplete: Dispatch<SetStateAction<boolean>>
  setTargetChapterCount: Dispatch<SetStateAction<number>>
  setTutorState: Dispatch<SetStateAction<LearnTutorState>>
  setTutorMessages: Dispatch<SetStateAction<TutorChatEntry[]>>
  setSyllabus: Dispatch<SetStateAction<SyllabusEntry[]>>
  setLearningChapters: Dispatch<SetStateAction<string[]>>
  setChapterBlueprints: Dispatch<SetStateAction<ChapterBlueprint[]>>
  setChapterSession: Dispatch<SetStateAction<ChapterSession>>
  setTopicSessions: Dispatch<SetStateAction<TopicSession[]>>
  setActiveTopicFlowIndex: Dispatch<SetStateAction<number | null>>
  setSkillMasteryBySkillId: Dispatch<SetStateAction<SkillMasteryBySkillId>>
}

export function useLearnSetupFlow(args: UseLearnSetupFlowArgs) {
  const { getPrompt } = useSystemPrompts()
  const {
    isUploading,
    isAnalyzingSetupTopic,
    materials,
    proficiencyLevel,
    generationMode,
    setError,
    setIsAnalyzingSetupTopic,
    setSetupAnalysisPercent,
    setTopic,
    setSelectedTopic,
    setTopicSuggestions,
    setSetupStep,
    setIsPostEntryPrepLoading,
    setPostEntryPrepStepIndex,
    setPostEntryPrepPercents,
    setIsSetupComplete,
    setTargetChapterCount,
    setTutorState,
    setTutorMessages,
    setSyllabus,
    setLearningChapters,
    setChapterBlueprints,
    setChapterSession,
    setTopicSessions,
    setActiveTopicFlowIndex,
    setSkillMasteryBySkillId,
  } = args

  const handleContinueSetupStepOne = useCallback(() => {
    if (isUploading || isAnalyzingSetupTopic) {
      return
    }

    // Platzhalter-Modus: keine Datei-Pflicht, kein KI-Aufruf — festes Testthema nach kurzer
    // simulierter Analyse, damit der Ablauf (Ladebalken → Thema → Schritt 2) sichtbar bleibt.
    if (generationMode === 'placeholder') {
      setError(null)
      setIsAnalyzingSetupTopic(true)
      void placeholderDelay()
        .then(() => {
          setSetupAnalysisPercent(100)
          return placeholderDelay(180)
        })
        .then(() => {
          setTopic(PLACEHOLDER_TOPIC)
          setSelectedTopic(PLACEHOLDER_TOPIC)
          setTopicSuggestions([])
          setSetupStep(2)
        })
        .finally(() => {
          setIsAnalyzingSetupTopic(false)
        })
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
      learnTelemetryMode: 'learn_setup_topic',
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
    generationMode,
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
      setError('Bitte wähle deine Selbsteinschätzung aus.')
      return
    }
    setError(null)
    setSetupStep(4)
  }, [proficiencyLevel, setError, setSetupStep])

  /** Setup fertig → sofort weiter zur Syllabus-Generierung (kein Einstiegstest mehr dazwischen).
   *  `tutorState = 'entry_quiz_done'` ist der bestehende Trigger für usePostEntrySyllabusGeneration —
   *  Name bewusst beibehalten (keine Persistenz-Migration nötig), bedeutet inhaltlich jetzt „Setup fertig".
   *  Die Themenanzahl kam früher aus dem Einstiegstest-Score; ohne Test dient die Selbsteinschätzung aus
   *  Schritt 3 als Ersatzsignal (schwächer → mehr, kleinere Themen). */
  const handleFinishSetup = useCallback(() => {
    if (!proficiencyLevel) {
      setError('Bitte wähle deine Selbsteinschätzung aus.')
      return
    }
    const recommendedChapterCount = proficiencyLevel === 'low' ? 4 : proficiencyLevel === 'medium' ? 3 : 2
    setError(null)
    setIsPostEntryPrepLoading(false)
    setPostEntryPrepStepIndex(0)
    setPostEntryPrepPercents([0, 0])
    setIsSetupComplete(true)
    setTutorMessages([])
    setSyllabus([])
    setLearningChapters([])
    setChapterBlueprints([])
    setChapterSession(DEFAULT_CHAPTER_SESSION)
    setTopicSessions([])
    setActiveTopicFlowIndex(null)
    setSkillMasteryBySkillId({})
    setTargetChapterCount(recommendedChapterCount)
    setTutorState('entry_quiz_done')
  }, [
    proficiencyLevel,
    setChapterBlueprints,
    setChapterSession,
    setSkillMasteryBySkillId,
    setError,
    setIsPostEntryPrepLoading,
    setIsSetupComplete,
    setSyllabus,
    setLearningChapters,
    setTopicSessions,
    setActiveTopicFlowIndex,
    setTargetChapterCount,
    setPostEntryPrepPercents,
    setPostEntryPrepStepIndex,
    setTutorState,
    setTutorMessages,
  ])

  return {
    handleContinueSetupStepOne,
    handleContinueSetupStepTwo,
    handleContinueSetupStepThree,
    handleFinishSetup,
  }
}
