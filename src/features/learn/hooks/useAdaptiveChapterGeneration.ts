import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sendMessage } from '../../chat/services/chat.service'
import type { ChatMessage } from '../../chat/types'
import { parseInteractiveContentWithFallback } from '../../chat/utils/interactiveQuiz'
import type { ChapterBlueprint, ChapterSession, UploadedMaterial } from '../services/learn.persistence'
import { useSystemPrompts } from '../../systemPrompts/useSystemPrompts'
import { formatRelevantMaterialContext } from '../utils/ragLite'
import {
  ADAPTIVE_CHAPTER_GENERATED_ID,
  CHAPTER_GENERATION_TIMEOUT_MS,
  CHAPTER_LEARNING_FIDELITY_RULES,
  WORKSHEET_EXERCISE_FIDELITY_RULES,
  buildAdaptiveChallengeFallback,
  buildAdaptiveChapterPlaceholder,
  collectWeakQuestionSteps,
  ensureMinimumChapterDepth,
  getDisplayPathTitle,
  parseChapterBlueprintsFromText,
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

      const adaptiveMaterialContext = formatRelevantMaterialContext(
        `${effectiveTopic || getDisplayPathTitle(activePathTitle ?? '')} ${selectedTopic} Schwachstellen Training Uebung Aufgabe Berechnung`,
        materials,
        materials.length > 0
          ? {
              maxChunks: materials.length > 2 ? 10 : 7,
              maxChars: materials.length > 2 ? 7200 : 5600,
              denseChunks: true,
              emphasizePersonalSources: true,
            }
          : { maxChunks: 6, maxChars: 3200 },
      )

      const request: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: [
          'Erstelle genau EIN Abschlusskapitel fuer Schwachstellen als JSON-Array mit genau 1 Kapitelobjekt.',
          'Nur JSON ohne Erklaerung.',
          'Das Kapitel muss 1 kurze Einfuehrung, dann 6-10 Fragen und am Ende 1 Recap enthalten.',
          'In Erklaerungs-Steps: je Step ein kurzes Mini-Beispiel im content (1-3 Saetze) oder in den bullets.',
          'Fokussiere auf erkannte Schwachstellen aus den falsch beantworteten Fragen.',
          'Nutze vorhandene Unterlagen als primaere Quelle: mindestens die Haelfte der Fragen soll Inhalte aus den Materialauszuegen aufgreifen (Begriffe, Zusammenhaenge, Zuordnungen).',
          WORKSHEET_EXERCISE_FIDELITY_RULES,
          CHAPTER_LEARNING_FIDELITY_RULES,
          `Thema: ${selectedTopic || effectiveTopic || 'Informatik Grundlagen'}`,
          `Schwachstellen aus bisherigem Lernverlauf:\n${weaknessSummary}`,
          adaptiveMaterialContext
            ? `Materialauszuege (Fragen und Erklaerungen hierauf beziehen):\n${adaptiveMaterialContext}`
            : 'Materialauszuege: keine — nutze realistische IT-Beispiele in Erklaerungen und Aufgaben.',
          'Fragetypen mischen: mcq, text, match und/oder true_false (expectedAnswer "Wahr" oder "Falsch").',
          'Schema pro Kapitel (Beispiele): {"id":"adaptive-1","title":"...","description":"...","steps":[{"id":"...","type":"explanation","title":"...","content":"...","bullets":["..."]},{"id":"...","type":"question","questionType":"mcq","prompt":"...","options":["a","b","c"],"expectedAnswer":"...","acceptableAnswers":[],"evaluation":"exact","hint":"...","explanation":"..."},{"id":"...","type":"question","questionType":"text","prompt":"...","expectedAnswer":"...","acceptableAnswers":[],"evaluation":"contains","hint":"...","explanation":"..."},{"id":"...","type":"question","questionType":"true_false","prompt":"...","expectedAnswer":"Falsch","hint":"...","explanation":"..."},{"id":"...","type":"question","questionType":"match","prompt":"...","matchLeft":["x","y"],"matchRight":["1","2"],"expectedAnswer":"0,1","hint":"...","explanation":"..."},{"id":"...","type":"recap","title":"...","content":"...","bullets":["..."]}]}',
          'Pflicht bei JEDEM question-Step: Feld "hint" mit 1-2 Saetzen Mini-Hilfe (ohne die Musterloesung zu verraten).',
        ].join('\n\n'),
        createdAt: new Date().toISOString(),
      }

      const response = await Promise.race([
        sendMessage([request], {
          interactiveQuizPrompt: getPrompt('interactive_quiz'),
          systemPrompt: getPrompt('learn_tutor'),
          useLearnPathModel: true,
        }),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('Adaptive Kapitelgenerierung dauert zu lange.')), CHAPTER_GENERATION_TIMEOUT_MS)
        }),
      ])

      const parsed = parseInteractiveContentWithFallback(response.assistantMessage.content)
      const parsedContent = parsed.cleanText || response.assistantMessage.content
      const parsedBlueprints = namespaceChapterStepIds(
        ensureMinimumChapterDepth(parseChapterBlueprintsFromText(parsedContent)),
        { chapterIndexOffset: chapterBlueprints.length },
      )
      const generatedAdaptive = parsedBlueprints[0] ?? null

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
