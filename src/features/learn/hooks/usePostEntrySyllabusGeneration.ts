import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { sendMessage } from '../../chat/services/chat.service'
import { formatRelevantMaterialContext } from '../utils/ragLite'
import type {
  LearnGenerationMode,
  LearnTutorState,
  SyllabusEntry,
  TutorChatEntry,
  UploadedMaterial,
} from '../services/learn.persistence'
import { buildPlaceholderSyllabus, placeholderDelay } from '../utils/learnPlaceholder'
import {
  buildFallbackSyllabus,
  buildSyllabusGenerationUserPrompt,
  getDisplayPathTitle,
  parseSyllabusFromText,
  POST_ENTRY_PREP_STEPS,
  SYLLABUS_GENERATION_MAX_ATTEMPTS,
  validateGeneratedSyllabus,
} from '../utils/learnPageHelpers'
import { buildSyllabusReadyTutorMessage } from '../utils/learnTutorCoachMessages'

type UsePostEntrySyllabusGenerationArgs = {
  activePathId: string | null
  activePathTitle: string
  generationMode: LearnGenerationMode
  tutorState: LearnTutorState
  targetChapterCount: number
  syllabus: SyllabusEntry[]
  effectiveTopic: string
  selectedTopic: string
  aiGuidance: string
  proficiencyLevel: '' | 'low' | 'medium' | 'high'
  materials: UploadedMaterial[]
  getPrompt: (key: 'learn_tutor') => string
  setSyllabus: Dispatch<SetStateAction<SyllabusEntry[]>>
  setLearningChapters: Dispatch<SetStateAction<string[]>>
  setTutorMessages: Dispatch<SetStateAction<TutorChatEntry[]>>
  setIsPostEntryPrepLoading: Dispatch<SetStateAction<boolean>>
  setPostEntryPrepStepIndex: Dispatch<SetStateAction<number>>
  setPostEntryPrepPercents: Dispatch<SetStateAction<number[]>>
  setError: Dispatch<SetStateAction<string | null>>
  /** Wird nach Abschluss der Generierung aufgerufen (auch beim Fallback) — z. B. fürs Onboarding-Overlay.
   *  MUSS referenzstabil sein (useCallback), sonst startet der Generierungs-Effekt neu. */
  onGenerationComplete?: () => void
}

export function usePostEntrySyllabusGeneration(args: UsePostEntrySyllabusGenerationArgs) {
  const generationRef = useRef<string | null>(null)

  useEffect(() => {
    const {
      activePathId,
      tutorState,
      targetChapterCount,
      syllabus,
    } = args

    if (!activePathId || tutorState !== 'entry_quiz_done') {
      return
    }
    if (syllabus.length >= targetChapterCount && targetChapterCount > 0) {
      return
    }
    if (generationRef.current === activePathId) {
      return
    }

    generationRef.current = activePathId
    let cancelled = false

    const run = async () => {
      args.setIsPostEntryPrepLoading(true)
      args.setPostEntryPrepStepIndex(0)
      args.setPostEntryPrepPercents(POST_ENTRY_PREP_STEPS.map(() => 0))

      const mainTopic =
        args.selectedTopic.trim() ||
        args.effectiveTopic.trim() ||
        getDisplayPathTitle(args.activePathTitle)
      const materialContext = formatRelevantMaterialContext(
        [mainTopic, args.selectedTopic, 'Unterthema Lernziel Gliederung Auftrag'].filter(Boolean).join(' '),
        args.materials,
        args.materials.length > 0
          ? {
              maxChunks: args.materials.length > 2 ? 12 : 10,
              maxChars: args.materials.length > 2 ? 9000 : 7200,
              denseChunks: true,
              emphasizePersonalSources: true,
            }
          : { maxChunks: 8, maxChars: 6000 },
      )

      let validationHint = ''
      let generated: SyllabusEntry[] = []

      // Platzhalter-Modus: Mock-Lernplan ohne KI — Prep-Screens laufen kurz sichtbar durch,
      // die Generierungs-Schleife unten wird übersprungen.
      if (args.generationMode === 'placeholder') {
        args.setPostEntryPrepPercents([70, 25])
        await placeholderDelay()
        if (cancelled) {
          return
        }
        generated = buildPlaceholderSyllabus(mainTopic, targetChapterCount)
      }

      for (let attempt = 1; generated.length === 0 && attempt <= SYLLABUS_GENERATION_MAX_ATTEMPTS; attempt += 1) {
        if (cancelled) {
          return
        }
        args.setPostEntryPrepStepIndex(attempt > 1 ? 1 : 0)
        args.setPostEntryPrepPercents([attempt > 1 ? 100 : 35, 0])

        try {
          const result = await sendMessage(
            [
              {
                id: crypto.randomUUID(),
                role: 'user',
                content: buildSyllabusGenerationUserPrompt({
                  pathTitle: getDisplayPathTitle(args.activePathTitle),
                  mainTopic,
                  selectedTopic: args.selectedTopic,
                  aiGuidance: args.aiGuidance,
                  proficiencyLevel: args.proficiencyLevel,
                  materialContext,
                  chapterCount: targetChapterCount,
                  validationHint,
                  attempt,
                }),
                createdAt: new Date().toISOString(),
              },
            ],
            {
              systemPrompt: args.getPrompt('learn_tutor'),
              useLearnPathModel: true,
              learnTelemetryMode: 'learn_syllabus',
            },
          )
          if (cancelled) {
            return
          }
          const parsed = parseSyllabusFromText(result.assistantMessage.content)
          const validation = validateGeneratedSyllabus(parsed, targetChapterCount)
          if (!validation.valid) {
            validationHint = validation.reason
            continue
          }
          generated = parsed
          break
        } catch (error) {
          if (cancelled) {
            return
          }
          validationHint = error instanceof Error ? error.message : 'Syllabus-Generierung fehlgeschlagen'
        }
      }

      if (cancelled) {
        return
      }

      const finalSyllabus =
        generated.length === targetChapterCount
          ? generated
          : buildFallbackSyllabus(mainTopic, targetChapterCount)

      args.setPostEntryPrepPercents([100, 100])
      args.setSyllabus(finalSyllabus)
      args.setLearningChapters(finalSyllabus.map((entry) => entry.topic))
      args.setTutorMessages([
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: buildSyllabusReadyTutorMessage(),
          action: 'start-next-chapter',
        },
      ])

      if (generated.length !== targetChapterCount) {
        args.setError(
          'Der Lernplan konnte nicht vollständig von der KI erstellt werden — es wurde ein Standard-Lernplan verwendet.',
        )
      }

      args.setIsPostEntryPrepLoading(false)
      args.onGenerationComplete?.()
    }

    void run().catch((error) => {
      if (cancelled) {
        return
      }
      console.error('Lernbereich: Syllabus-Generierung fehlgeschlagen', error)
      const mainTopic =
        args.selectedTopic.trim() ||
        args.effectiveTopic.trim() ||
        getDisplayPathTitle(args.activePathTitle)
      const fallback = buildFallbackSyllabus(mainTopic, targetChapterCount)
      args.setSyllabus(fallback)
      args.setLearningChapters(fallback.map((entry) => entry.topic))
      args.setTutorMessages([
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: buildSyllabusReadyTutorMessage(),
          action: 'start-next-chapter',
        },
      ])
      args.setError(error instanceof Error ? error.message : 'Lernplan konnte nicht erstellt werden.')
      args.setIsPostEntryPrepLoading(false)
      args.onGenerationComplete?.()
    })

    return () => {
      cancelled = true
      if (generationRef.current === activePathId) {
        generationRef.current = null
      }
    }
  }, [
    args.activePathId,
    args.activePathTitle,
    args.aiGuidance,
    args.generationMode,
    args.effectiveTopic,
    args.getPrompt,
    args.materials,
    args.proficiencyLevel,
    args.selectedTopic,
    args.setError,
    args.setIsPostEntryPrepLoading,
    args.setLearningChapters,
    args.setPostEntryPrepPercents,
    args.setPostEntryPrepStepIndex,
    args.setSyllabus,
    args.setTutorMessages,
    args.onGenerationComplete,
    args.syllabus.length,
    args.targetChapterCount,
    args.tutorState,
  ])
}
