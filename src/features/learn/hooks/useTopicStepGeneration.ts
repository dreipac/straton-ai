import { useCallback, useEffect, useRef, useState } from 'react'
import { sendMessage } from '../../chat/services/chat.service'
import type { ChatMessage } from '../../chat/types'
import { parseInteractiveContentWithFallback } from '../../chat/utils/interactiveQuiz'
import type { LearnGenerationMode, TopicSession, UploadedMaterial } from '../services/learn.persistence'
import { useSystemPrompts } from '../../systemPrompts/useSystemPrompts'
import { formatRelevantMaterialContext } from '../utils/ragLite'
import {
  CHAPTER_GENERATION_MAX_ATTEMPTS,
  CHAPTER_GENERATION_TIMEOUT_MS,
  TOPIC_SUBSTEP_MAX,
  TOPIC_SUBSTEP_MIN,
  buildChapterMaterialSearchQuery,
  buildSubstepOutlineFallback,
  buildSubstepOutlinePrompt,
  collectTopicWeakQuestionSteps,
  getChapterMaterialRagOptions,
  getDisplayPathTitle,
  parseSubstepTitlesFromText,
} from '../utils/learnPageHelpers'
import { placeholderDelay } from '../utils/learnPlaceholder'

export type UseTopicSubstepOutlineArgs = {
  activePathId: string
  activePathTitle: string | undefined
  generationMode: LearnGenerationMode
  topicIndex: number
  topicTopic: string
  topicLearningGoal: string
  topicSession: TopicSession | undefined
  effectiveTopic: string
  selectedTopic: string
  materials: UploadedMaterial[]
  /** Wird einmalig mit der fertigen Teilthemen-Liste aufgerufen — Aufrufer legt daraus die Substeps an. */
  onOutlineReady: (topicIndex: number, substepTitles: string[]) => void
}

/**
 * Neues Modell: sobald ein Thema in den Status `analyzing` wechselt (Einstiegscheck fertig), leitet dieser
 * Hook aus den Einstiegscheck-Antworten EINMALIG eine Liste von Teilthemen (3–6) ab. Der Aufrufer legt daraus
 * die Zwischenschritte an (Status → `learning`); der Vollinhalt jedes Zwischenschritts wird später lazy erzeugt.
 */
export function useTopicSubstepOutline(args: UseTopicSubstepOutlineArgs) {
  const { getPrompt } = useSystemPrompts()
  const {
    activePathId,
    activePathTitle,
    generationMode,
    topicIndex,
    topicTopic,
    topicLearningGoal,
    topicSession,
    effectiveTopic,
    selectedTopic,
    materials,
    onOutlineReady,
  } = args

  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false)
  const generationInFlightRef = useRef(false)

  const shouldGenerateOutline = Boolean(
    topicSession &&
      topicSession.status === 'analyzing' &&
      topicSession.substeps.length === 0 &&
      !isGeneratingOutline &&
      !generationInFlightRef.current,
  )

  const generateOutline = useCallback(async () => {
    if (!topicSession || generationInFlightRef.current) {
      return
    }
    generationInFlightRef.current = true
    setIsGeneratingOutline(true)

    try {
      const weakQuestions = collectTopicWeakQuestionSteps(topicSession)
      const weaknessSummary = weakQuestions
        .slice(0, 12)
        .map((step, index) => `${index + 1}. ${step.prompt}`)
        .join('\n')
      const entryCorrectness = topicSession.entryCheckSession?.correctnessByStepId ?? {}
      const total = Object.keys(entryCorrectness).length
      const correct = Object.values(entryCorrectness).filter(Boolean).length
      const entryCheckSummary =
        total > 0
          ? `Einstiegscheck: ${correct} von ${total} Fragen richtig beantwortet.`
          : 'Einstiegscheck ohne auswertbare Antworten — leite typische Teilthemen ab.'

      // Platzhalter-Modus: ohne KI direkt Fallback-Titel.
      if (generationMode === 'placeholder') {
        await placeholderDelay()
        onOutlineReady(topicIndex, buildSubstepOutlineFallback(topicTopic))
        return
      }

      const materialContext = formatRelevantMaterialContext(
        buildChapterMaterialSearchQuery(effectiveTopic, selectedTopic, topicTopic),
        materials,
        getChapterMaterialRagOptions(materials.length),
      )

      let validationHint = ''
      let titles: string[] = []
      for (let attempt = 1; titles.length === 0 && attempt <= CHAPTER_GENERATION_MAX_ATTEMPTS; attempt += 1) {
        const request: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: buildSubstepOutlinePrompt({
            pathTitle: getDisplayPathTitle(activePathTitle ?? ''),
            topicTitle: topicTopic,
            learningGoal: topicLearningGoal,
            entryCheckSummary,
            weaknessSummary,
            materialContext,
            attempt,
            validationHint,
          }),
          createdAt: new Date().toISOString(),
        }
        const response = await Promise.race([
          sendMessage([request], {
            systemPrompt: getPrompt('learn_tutor'),
            useLearnPathModel: true,
            learnTelemetryMode: 'learn_tutor',
            learnPathSystemPromptMode: 'tutor_only',
          }),
          new Promise<never>((_, reject) => {
            window.setTimeout(
              () => reject(new Error('Analyse der Teilthemen dauert zu lange.')),
              CHAPTER_GENERATION_TIMEOUT_MS,
            )
          }),
        ])
        const parsed = parseInteractiveContentWithFallback(response.assistantMessage.content)
        const parsedTitles = parseSubstepTitlesFromText(parsed.cleanText || response.assistantMessage.content)
        if (parsedTitles.length < TOPIC_SUBSTEP_MIN) {
          validationHint = `Zu wenige Teilthemen (mind. ${TOPIC_SUBSTEP_MIN}).`
          continue
        }
        titles = parsedTitles.slice(0, TOPIC_SUBSTEP_MAX)
        break
      }

      onOutlineReady(topicIndex, titles.length > 0 ? titles : buildSubstepOutlineFallback(topicTopic))
    } catch (err) {
      console.error('Lernbereich: Teilthemen-Outline konnte nicht generiert werden', err)
      onOutlineReady(topicIndex, buildSubstepOutlineFallback(topicTopic))
    } finally {
      setIsGeneratingOutline(false)
      generationInFlightRef.current = false
    }
  }, [
    activePathTitle,
    effectiveTopic,
    generationMode,
    getPrompt,
    materials,
    onOutlineReady,
    selectedTopic,
    topicIndex,
    topicLearningGoal,
    topicSession,
    topicTopic,
  ])

  useEffect(() => {
    if (!shouldGenerateOutline) {
      return
    }
    void generateOutline()
  }, [generateOutline, shouldGenerateOutline])

  useEffect(() => {
    generationInFlightRef.current = false
    setIsGeneratingOutline(false)
  }, [activePathId, topicIndex])

  return { isGeneratingOutline }
}
