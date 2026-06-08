import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sendMessage } from '../../chat/services/chat.service'
import type { ChatMessage } from '../../chat/types'
import { parseInteractiveContentWithFallback } from '../../chat/utils/interactiveQuiz'
import type { ChapterBlueprint, ChapterSession, UploadedMaterial } from '../services/learn.persistence'
import { useSystemPrompts } from '../../systemPrompts/useSystemPrompts'
import { formatRelevantMaterialContext } from '../utils/ragLite'
import {
  ADAPTIVE_CHAPTER_GENERATED_ID,
  CHAPTER_GENERATION_MAX_ATTEMPTS,
  CHAPTER_GENERATION_TIMEOUT_MS,
  CHAPTER_MIN_QUESTIONS_ADAPTIVE,
  buildAdaptiveChallengeFallback,
  buildAdaptiveChapterPlaceholder,
  buildChapterGenerationUserPrompt,
  buildChapterMaterialSearchQuery,
  collectWeakQuestionSteps,
  ensureMinimumChapterDepth,
  getChapterMaterialRagOptions,
  getDisplayPathTitle,
  parseChapterBlueprintsFromText,
  validateGeneratedChapter,
} from '../utils/learnPageHelpers'
import { namespaceChapterStepIds } from '../utils/chapterStepIds'

export type UseAdaptiveChapterGenerationArgs = {
  activePathId: string
  activePathTitle: string | undefined
  chapterBlueprints: ChapterBlueprint[]
  chapterSession: ChapterSession
  effectiveTopic: string
  selectedTopic: string
  materials: UploadedMaterial[]
}

export function useAdaptiveChapterGeneration(args: UseAdaptiveChapterGenerationArgs) {
  const { getPrompt } = useSystemPrompts()
  const { activePathId, activePathTitle, chapterBlueprints, chapterSession, effectiveTopic, selectedTopic, materials } =
    args

  const [adaptiveChapterBlueprint, setAdaptiveChapterBlueprint] = useState<ChapterBlueprint | null>(null)
  const [isGeneratingAdaptiveChapter, setIsGeneratingAdaptiveChapter] = useState(false)
  const generationInFlightRef = useRef(false)

  const wrongQuestionSteps = useMemo(
    () => collectWeakQuestionSteps(chapterBlueprints, chapterSession),
    [chapterBlueprints, chapterSession],
  )

  const completedBaseChapterCount = useMemo(
    () =>
      new Set(
        chapterSession.completedChapterIndexes.filter((index) => index >= 0 && index < chapterBlueprints.length),
      ).size,
    [chapterBlueprints, chapterSession],
  )

  const areBaseChaptersCompleted =
    chapterBlueprints.length > 0 && completedBaseChapterCount >= chapterBlueprints.length

  const adaptiveTailChapter = useMemo(
    () => adaptiveChapterBlueprint ?? buildAdaptiveChapterPlaceholder(wrongQuestionSteps.length),
    [adaptiveChapterBlueprint, wrongQuestionSteps.length],
  )

  const effectiveChapterBlueprints = useMemo(
    () => (chapterBlueprints.length > 0 ? [...chapterBlueprints, adaptiveTailChapter] : chapterBlueprints),
    [chapterBlueprints, adaptiveTailChapter],
  )

  const generateAdaptiveWeaknessChapter = useCallback(async () => {
    if (generationInFlightRef.current) {
      return
    }

    const weakQuestions = collectWeakQuestionSteps(chapterBlueprints, chapterSession)
    generationInFlightRef.current = true
    setIsGeneratingAdaptiveChapter(true)

    try {
      const weaknessSummary =
        weakQuestions.length > 0
          ? weakQuestions
              .slice(0, 12)
              .map((step, index) => `${index + 1}. ${step.prompt}`)
              .join('\n')
          : 'Keine explizit falschen Antworten vorhanden. Erzeuge adaptive Fragen auf Basis typischer Stolpersteine im Thema.'

      const chapterTopic = selectedTopic || effectiveTopic || 'KV Grundlagen'
      const adaptiveMaterialContext = formatRelevantMaterialContext(
        buildChapterMaterialSearchQuery(
          effectiveTopic || getDisplayPathTitle(activePathTitle ?? ''),
          selectedTopic,
          `${chapterTopic} Schwachstellen Training`,
        ),
        materials,
        getChapterMaterialRagOptions(materials.length),
      )

      let validationHint = ''
      let generatedAdaptive: ChapterBlueprint | null = null

      for (let attempt = 1; attempt <= CHAPTER_GENERATION_MAX_ATTEMPTS; attempt += 1) {
        const request: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: buildChapterGenerationUserPrompt({
            pathTitle: getDisplayPathTitle(activePathTitle ?? ''),
            chapterTopic,
            aiGuidance: '',
            proficiencyLevel: '',
            materialContext: adaptiveMaterialContext,
            entryQuizInsight: 'Adaptives Abschlusskapitel — fokussiere auf Schwachstellen aus dem Lernverlauf.',
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
            window.setTimeout(() => reject(new Error('Adaptive Kapitelgenerierung dauert zu lange.')), CHAPTER_GENERATION_TIMEOUT_MS)
          }),
        ])

        const parsed = parseInteractiveContentWithFallback(response.assistantMessage.content)
        const parsedContent = parsed.cleanText || response.assistantMessage.content
        const candidate = parseChapterBlueprintsFromText(parsedContent)[0]
        if (!candidate) {
          validationHint = 'Kein auslesbares Kapitel-JSON erhalten'
          continue
        }
        const validation = validateGeneratedChapter(candidate, { minQuestions: CHAPTER_MIN_QUESTIONS_ADAPTIVE })
        if (!validation.valid) {
          validationHint = validation.reason
          continue
        }
        generatedAdaptive =
          namespaceChapterStepIds(ensureMinimumChapterDepth([candidate]), {
            chapterIndexOffset: chapterBlueprints.length,
          })[0] ?? null
        break
      }

      if (generatedAdaptive) {
        setAdaptiveChapterBlueprint({
          ...generatedAdaptive,
          id: ADAPTIVE_CHAPTER_GENERATED_ID,
          title: generatedAdaptive.title.trim() || 'Schwachstellen-Fokus',
        })
      } else {
        setAdaptiveChapterBlueprint(
          namespaceChapterStepIds([buildAdaptiveChallengeFallback(weakQuestions)], {
            chapterIndexOffset: chapterBlueprints.length,
          })[0],
        )
      }
    } catch (err) {
      console.error('Lernbereich: Adaptives Schwachstellen-Kapitel konnte nicht generiert werden', err)
      setAdaptiveChapterBlueprint(
        namespaceChapterStepIds([buildAdaptiveChallengeFallback(weakQuestions)], {
          chapterIndexOffset: chapterBlueprints.length,
        })[0],
      )
    } finally {
      setIsGeneratingAdaptiveChapter(false)
      generationInFlightRef.current = false
    }
  }, [activePathTitle, chapterBlueprints, chapterSession, effectiveTopic, getPrompt, materials, selectedTopic])

  useEffect(() => {
    if (!areBaseChaptersCompleted || adaptiveChapterBlueprint || isGeneratingAdaptiveChapter) {
      return
    }
    void generateAdaptiveWeaknessChapter()
  }, [adaptiveChapterBlueprint, areBaseChaptersCompleted, generateAdaptiveWeaknessChapter, isGeneratingAdaptiveChapter])

  useEffect(() => {
    setAdaptiveChapterBlueprint(null)
    setIsGeneratingAdaptiveChapter(false)
    generationInFlightRef.current = false
  }, [activePathId, chapterBlueprints])

  return { effectiveChapterBlueprints }
}
