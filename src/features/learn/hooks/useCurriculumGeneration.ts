import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { sendMessage } from '../../chat/services/chat.service'
import type { LearnGenerationMode, SyllabusEntry, TutorChatEntry } from '../services/learn.persistence'
import type { Concept, ConceptEdge } from '../engine/types'
import { topologicalOrder } from '../engine/conceptGraph'
import { buildPlaceholderCurriculum, placeholderDelay } from '../utils/learnPlaceholder'
import { aiBackoffDelayMs, isTransientAiFailure, sleep } from '../utils/aiRetry'
import { buildSyllabusReadyTutorMessage } from '../utils/learnTutorCoachMessages'
import {
  buildCurriculumPrompt,
  parseCurriculumFromText,
  validateCurriculum,
  orderCurriculum,
  buildFallbackCurriculum,
  CURRICULUM_MAX_ATTEMPTS,
  type Curriculum,
} from '../utils/curriculumGeneration'
import {
  loadCurriculum,
  saveCurriculum,
  type PersistedCurriculum,
} from '../services/learnCurriculum.persistence'

export type IngestionStatus = 'running' | 'ready' | 'absent'

type UseCurriculumGenerationArgs = {
  userId: string | null
  activePathId: string | null
  /** Trigger: nur wenn das Konzept-Netz bereit ist ('ready'). */
  ingestionStatus: IngestionStatus
  conceptGraph: { concepts: Concept[]; edges: ConceptEdge[] }
  /** Basis-Themenname (nur für Platzhalter-Titel; Slugs bleiben fix). */
  topicHint: string
  generationMode: LearnGenerationMode
  getPrompt: (key: 'learn_tutor') => string
  setSyllabus: Dispatch<SetStateAction<SyllabusEntry[]>>
  setLearningChapters: Dispatch<SetStateAction<string[]>>
  setTargetChapterCount: Dispatch<SetStateAction<number>>
  setTutorMessages: Dispatch<SetStateAction<TutorChatEntry[]>>
  setIsPostEntryPrepLoading: Dispatch<SetStateAction<boolean>>
  setPostEntryPrepStepIndex: Dispatch<SetStateAction<number>>
  setPostEntryPrepPercents: Dispatch<SetStateAction<number[]>>
  setError: Dispatch<SetStateAction<string | null>>
  onCurriculumReady: (curriculum: PersistedCurriculum) => void
  onGenerationComplete?: () => void
}

/** Aus dem persistierten Curriculum die (Legacy-)Syllabus-Anzeige ableiten — Bruecke zur bestehenden UI. */
function syllabusFromCurriculum(curriculum: PersistedCurriculum): SyllabusEntry[] {
  return curriculum.topics.map((t) => ({ topic: t.title, learningGoal: t.learningGoal }))
}

/**
 * Curriculum-Generator (Schicht 2, live): sobald das Konzept-Netz bereit ist, wird daraus ein
 * konzept-geclustertes, topologisch geordnetes Curriculum generiert + persistiert und die bestehende
 * `syllabus`-Anzeige daraus abgeleitet (Landkarte/Workspace rendern konzept-getriebene Themen).
 * Idempotent: existiert bereits ein Curriculum, wird es nur geladen.
 */
export function useCurriculumGeneration(args: UseCurriculumGenerationArgs) {
  const generationRef = useRef<string | null>(null)

  useEffect(() => {
    const { userId, activePathId, ingestionStatus } = args
    if (!userId || !activePathId || ingestionStatus !== 'ready') {
      return
    }
    if (args.conceptGraph.concepts.length === 0) {
      return
    }
    if (generationRef.current === activePathId) {
      return
    }
    generationRef.current = activePathId
    let cancelled = false

    const applyCurriculum = (saved: PersistedCurriculum) => {
      const syllabus = syllabusFromCurriculum(saved)
      args.setPostEntryPrepPercents([100, 100])
      args.setSyllabus(syllabus)
      args.setLearningChapters(syllabus.map((e) => e.topic))
      args.setTargetChapterCount(Math.max(1, syllabus.length))
      args.setTutorMessages([
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: buildSyllabusReadyTutorMessage(),
          action: 'start-next-chapter',
        },
      ])
      args.setIsPostEntryPrepLoading(false)
      args.onCurriculumReady(saved)
      args.onGenerationComplete?.()
    }

    const run = async () => {
      const { concepts, edges } = args.conceptGraph

      // Bereits vorhandenes Curriculum? Dann nur laden (Idempotenz bei Reopen).
      try {
        const existing = await loadCurriculum(activePathId)
        if (cancelled) {
          return
        }
        if (existing.topics.length > 0) {
          applyCurriculum(existing)
          return
        }
      } catch {
        // Ladefehler ignorieren, generieren.
      }

      args.setIsPostEntryPrepLoading(true)
      args.setPostEntryPrepStepIndex(0)
      args.setPostEntryPrepPercents([0, 0])

      const slugById = new Map(concepts.map((c) => [c.id, c.slug]))
      const conceptIdBySlug = new Map(concepts.map((c) => [c.slug, c.id]))
      const orderedSlugs = topologicalOrder(concepts, edges)
        .map((id) => slugById.get(id))
        .filter((slug): slug is string => Boolean(slug))
      const knownSlugs = concepts.map((c) => c.slug)

      let curriculum: Curriculum | null = null

      if (args.generationMode === 'placeholder') {
        await placeholderDelay()
        if (cancelled) {
          return
        }
        // Platzhalter: dediziertes Mehr-Themen-Curriculum (6 Cluster) statt Größe-6-Fallback-Chunking,
        // damit die Landkarte wie früher mehrere Themen-Knoten zeigt. Nur Slugs binden — auf die im
        // Netz nicht vorhandenen beschränken (Robustheit, falls das Netz abweicht).
        const knownSlugSet = new Set(knownSlugs)
        const placeholder = buildPlaceholderCurriculum(args.topicHint)
        const filtered: Curriculum = {
          topics: placeholder.topics
            .map((t) => ({
              ...t,
              conceptSlugs: t.conceptSlugs.filter((s) => knownSlugSet.has(s)),
              steps: t.steps
                .map((st) => ({ ...st, conceptSlugs: st.conceptSlugs.filter((s) => knownSlugSet.has(s)) }))
                .filter((st) => st.conceptSlugs.length > 0),
            }))
            .filter((t) => t.conceptSlugs.length > 0),
        }
        curriculum = filtered.topics.length > 0
          ? filtered
          : buildFallbackCurriculum(concepts.map((c) => ({ slug: c.slug, name: c.name })))
      } else {
        args.setPostEntryPrepStepIndex(1)
        args.setPostEntryPrepPercents([100, 35])
        const conceptsForPrompt = concepts.map((c) => ({ slug: c.slug, name: c.name, difficulty: c.difficulty }))
        const edgesForPrompt = edges
          .map((e) => ({
            fromSlug: slugById.get(e.fromConceptId) ?? '',
            toSlug: slugById.get(e.toConceptId) ?? '',
            type: e.type,
          }))
          .filter((e) => e.fromSlug && e.toSlug)
        let validationHint = ''
        for (let attempt = 1; !curriculum && attempt <= CURRICULUM_MAX_ATTEMPTS; attempt += 1) {
          if (cancelled) {
            return
          }
          let lastErrorTransient = false
          try {
            const result = await sendMessage(
              [
                {
                  id: crypto.randomUUID(),
                  role: 'user',
                  content: buildCurriculumPrompt({
                    concepts: conceptsForPrompt,
                    edges: edgesForPrompt,
                    attempt,
                    validationHint,
                  }),
                  createdAt: new Date().toISOString(),
                },
              ],
              {
                systemPrompt: args.getPrompt('learn_tutor'),
                useLearnPathModel: true,
                learnTelemetryMode: 'learn_syllabus',
                learnPathSystemPromptMode: 'tutor_only',
              },
            )
            if (cancelled) {
              return
            }
            const parsed = parseCurriculumFromText(result.assistantMessage.content, knownSlugs)
            const validation = validateCurriculum(parsed, knownSlugs)
            if (validation.valid) {
              curriculum = parsed
              break
            }
            validationHint = validation.reason
          } catch (error) {
            if (cancelled) {
              return
            }
            validationHint = error instanceof Error ? error.message : 'Curriculum-Generierung fehlgeschlagen'
            lastErrorTransient = isTransientAiFailure(error)
          }
          // Bei vorübergehender Überlast kurz warten, bevor das nächste Modell-Anfrage-Fenster genutzt wird.
          if (!curriculum && lastErrorTransient && attempt < CURRICULUM_MAX_ATTEMPTS) {
            await sleep(aiBackoffDelayMs(attempt))
            if (cancelled) {
              return
            }
          }
        }
        if (!curriculum) {
          curriculum = buildFallbackCurriculum(concepts.map((c) => ({ slug: c.slug, name: c.name })))
        }
      }

      if (cancelled) {
        return
      }

      const ordered = orderCurriculum(curriculum, orderedSlugs)
      try {
        const saved = await saveCurriculum(activePathId, ordered, conceptIdBySlug)
        if (cancelled) {
          return
        }
        applyCurriculum(saved)
      } catch (error) {
        if (cancelled) {
          return
        }
        console.error('Lernbereich: Curriculum konnte nicht gespeichert werden', error)
        args.setError(error instanceof Error ? error.message : 'Curriculum konnte nicht erstellt werden.')
        args.setIsPostEntryPrepLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
    // ingestionStatus-Wechsel triggert; generationRef verhindert Mehrfachlauf pro Pfad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.userId, args.activePathId, args.ingestionStatus])
}

export type { UseCurriculumGenerationArgs }
