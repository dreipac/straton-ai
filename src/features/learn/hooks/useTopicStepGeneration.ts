import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sendMessage } from '../../chat/services/chat.service'
import type { ChatMessage } from '../../chat/types'
import { parseInteractiveContentWithFallback } from '../../chat/utils/interactiveQuiz'
import type { ChapterBlueprint, LearnGenerationMode, TopicSession, UploadedMaterial } from '../services/learn.persistence'
import { useSystemPrompts } from '../../systemPrompts/useSystemPrompts'
import { formatRelevantMaterialContext } from '../utils/ragLite'
import {
  CHAPTER_GENERATION_MAX_ATTEMPTS,
  CHAPTER_GENERATION_TIMEOUT_MS,
  TOPIC_MASTERY_THRESHOLD,
  TOPIC_MAX_STEPS,
  TOPIC_STEP_MIN_QUESTIONS,
  buildChapterGenerationUserPrompt,
  buildChapterMaterialSearchQuery,
  buildTopicStepFallback,
  buildTopicStepPlaceholder,
  collectTopicWeakQuestionSteps,
  ensureMinimumChapterDepth,
  getChapterMaterialRagOptions,
  getDisplayPathTitle,
  hasUnansweredTopicStep,
  parseChapterBlueprintsFromText,
  validateGeneratedChapter,
} from '../utils/learnPageHelpers'
import { namespaceChapterStepIds } from '../utils/chapterStepIds'
import { placeholderDelay } from '../utils/learnPlaceholder'

export type UseTopicStepGenerationArgs = {
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
  /** Wird mit dem fertig generierten (oder Fallback-)Blueprint aufgerufen — Aufrufer hängt ihn an stepBlueprints an. */
  onStepGenerated: (topicIndex: number, blueprint: ChapterBlueprint) => void
}

/**
 * Landkarte Phase 1: generiert — analog zu useAdaptiveChapterGeneration.ts — jeweils EINEN
 * Zwischenschritt für ein Thema, solange dessen Mastery unter der Schwelle liegt. Läuft pro Thema
 * wiederholt (nicht nur einmalig wie der bestehende Schwachstellen-Abschluss-Hook).
 */
export function useTopicStepGeneration(args: UseTopicStepGenerationArgs) {
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
    onStepGenerated,
  } = args

  const [isGeneratingTopicStep, setIsGeneratingTopicStep] = useState(false)
  const generationInFlightRef = useRef(false)

  const nextStepNumber = (topicSession?.stepBlueprints.length ?? 0) + 1

  const stepPlaceholder = useMemo(() => buildTopicStepPlaceholder(nextStepNumber), [nextStepNumber])

  const shouldGenerateNextStep = Boolean(
    topicSession &&
      topicSession.status === 'learning' &&
      topicSession.masteryScore < TOPIC_MASTERY_THRESHOLD &&
      topicSession.stepBlueprints.length < TOPIC_MAX_STEPS &&
      // Ein Zwischenschritt nach dem anderen: erst weiter, wenn der vorige beantwortet ist (kein Burst).
      !hasUnansweredTopicStep(topicSession) &&
      !isGeneratingTopicStep &&
      !generationInFlightRef.current,
  )

  const generateNextTopicStep = useCallback(async () => {
    if (!topicSession || generationInFlightRef.current) {
      return
    }

    const weakQuestions = collectTopicWeakQuestionSteps(topicSession)
    const stepNumber = topicSession.stepBlueprints.length + 1
    generationInFlightRef.current = true
    setIsGeneratingTopicStep(true)

    try {
      const weaknessSummary =
        weakQuestions.length > 0
          ? weakQuestions
              .slice(0, 12)
              .map((step, index) => `${index + 1}. ${step.prompt}`)
              .join('\n')
          : 'Noch keine explizit falschen Antworten in diesem Thema. Erzeuge einen fokussierten Lernschritt zu typischen Stolpersteinen.'

      const materialContext = formatRelevantMaterialContext(
        buildChapterMaterialSearchQuery(effectiveTopic, selectedTopic, topicTopic),
        materials,
        getChapterMaterialRagOptions(materials.length),
      )

      let validationHint = ''
      let generatedStep: ChapterBlueprint | null = null

      // Platzhalter-Modus: der bestehende Fallback-Baustein (Schwachstellen-Wiederholung) ersetzt
      // die KI-Generierung — die Schleife unten wird übersprungen.
      if (generationMode === 'placeholder') {
        await placeholderDelay()
        generatedStep =
          namespaceChapterStepIds([buildTopicStepFallback(weakQuestions, stepNumber)], {
            chapterIndexOffset: topicSession.stepBlueprints.length,
          })[0] ?? null
      }

      for (let attempt = 1; !generatedStep && attempt <= CHAPTER_GENERATION_MAX_ATTEMPTS; attempt += 1) {
        const request: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: buildChapterGenerationUserPrompt({
            pathTitle: getDisplayPathTitle(activePathTitle ?? ''),
            chapterTopic: topicTopic,
            learningGoal: topicLearningGoal,
            aiGuidance: '',
            proficiencyLevel: '',
            materialContext,
            entryQuizInsight: `Zwischenschritt ${stepNumber} innerhalb des Themas "${topicTopic}" — fokussiere gezielt auf offene Schwachstellen aus Diagnosetest und bisherigen Zwischenschritten.`,
            validationHint,
            attempt,
            adaptive: true,
            weaknessSummary,
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
              () => reject(new Error('Generierung des Zwischenschritts dauert zu lange.')),
              CHAPTER_GENERATION_TIMEOUT_MS,
            )
          }),
        ])

        const parsed = parseInteractiveContentWithFallback(response.assistantMessage.content)
        const parsedContent = parsed.cleanText || response.assistantMessage.content
        const candidate = parseChapterBlueprintsFromText(parsedContent)[0]
        if (!candidate) {
          validationHint = 'Kein auslesbares Kapitel-JSON erhalten'
          continue
        }
        const validation = validateGeneratedChapter(candidate, {
          minQuestions: TOPIC_STEP_MIN_QUESTIONS,
          requireRecap: false,
        })
        if (!validation.valid) {
          validationHint = validation.reason
          continue
        }
        generatedStep =
          namespaceChapterStepIds(ensureMinimumChapterDepth([candidate]), {
            chapterIndexOffset: topicSession.stepBlueprints.length,
          })[0] ?? null
        break
      }

      const finalStep =
        generatedStep ??
        namespaceChapterStepIds([buildTopicStepFallback(weakQuestions, stepNumber)], {
          chapterIndexOffset: topicSession.stepBlueprints.length,
        })[0]!

      onStepGenerated(topicIndex, {
        ...finalStep,
        title: finalStep.title.trim() || `Lernschritt ${stepNumber}`,
      })
    } catch (err) {
      console.error('Lernbereich: Zwischenschritt konnte nicht generiert werden', err)
      const fallback = namespaceChapterStepIds([buildTopicStepFallback(weakQuestions, stepNumber)], {
        chapterIndexOffset: topicSession.stepBlueprints.length,
      })[0]!
      onStepGenerated(topicIndex, fallback)
    } finally {
      setIsGeneratingTopicStep(false)
      generationInFlightRef.current = false
    }
  }, [
    activePathTitle,
    effectiveTopic,
    generationMode,
    getPrompt,
    materials,
    onStepGenerated,
    selectedTopic,
    topicIndex,
    topicLearningGoal,
    topicSession,
    topicTopic,
  ])

  useEffect(() => {
    if (!shouldGenerateNextStep) {
      return
    }
    void generateNextTopicStep()
  }, [generateNextTopicStep, shouldGenerateNextStep])

  useEffect(() => {
    generationInFlightRef.current = false
    setIsGeneratingTopicStep(false)
  }, [activePathId, topicIndex])

  return { isGeneratingTopicStep, stepPlaceholder }
}
