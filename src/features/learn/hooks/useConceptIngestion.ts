import { useEffect, useRef } from 'react'
import { sendMessage } from '../../chat/services/chat.service'
import { formatRelevantMaterialContext } from '../utils/ragLite'
import { sectionMaterials } from '../utils/materialSectioning'
import type { LearnGenerationMode, UploadedMaterial } from '../services/learn.persistence'
import type { Concept, ConceptEdge } from '../engine/types'
import { buildPlaceholderConceptGraph, placeholderDelay } from '../utils/learnPlaceholder'
import {
  buildConceptIngestionPrompt,
  parseConceptGraphFromText,
  validateConceptGraph,
  mergeConceptGraphs,
  CONCEPT_INGESTION_MAX_ATTEMPTS,
  type IngestedGraph,
} from '../utils/conceptIngestion'
import { loadConceptGraph, saveConceptGraph } from '../services/learnConceptGraph.persistence'

/** Map-Reduce-Parameter: pro Abschnitt eine KI-Anfrage, mit begrenzter Parallelitaet gegen Rate-Limits. */
const INGEST_SECTION_TARGET_CHARS = 7000
const INGEST_MAX_SECTIONS = 12
const INGEST_CONCURRENCY = 3

export type ConceptGraphSnapshot = { concepts: Concept[]; edges: ConceptEdge[] }

type UseConceptIngestionArgs = {
  userId: string | null
  activePathId: string | null
  isSetupComplete: boolean
  generationMode: LearnGenerationMode
  materials: UploadedMaterial[]
  effectiveTopic: string
  selectedTopic: string
  getPrompt: (key: 'learn_tutor') => string
  /** true = der Pfad hat bereits Legacy-Inhalt (Syllabus/Themen) → NICHT neu ingesten (nur laden),
   *  verhindert ueberraschende KI-Calls beim Oeffnen alter Pfade ohne Konzept-Netz. */
  hasExistingContent: boolean
  /** Wird mit dem persistierten Netz aufgerufen (frisch generiert ODER bereits vorhanden). */
  onGraphReady: (graph: ConceptGraphSnapshot) => void
  /** Meldet, ob ein Netz bereitsteht ('ready') oder der Pfad ohne Netz auf Legacy faellt ('absent').
   *  Koordiniert Curriculum-Generator (bei 'ready') vs. Legacy-Syllabus-Fallback (bei 'absent'). */
  onStatus: (status: 'ready' | 'absent') => void
}

/**
 * Content-Ingestion (Schicht 1): sobald das Setup eines Pfads abgeschlossen ist, wird aus dem Material
 * einmal ein Konzept-Netz generiert und in die normalisierten Tabellen persistiert. Reitet auf dem
 * bestehenden Learn-Completion-Pfad (kein Edge-Function-Deploy noetig). Idempotent: existiert bereits ein
 * Netz, wird es nur geladen. Scheitert die Generierung, degradiert der Flow still (kein Netz -> spaetere
 * Schichten fallen auf das Legacy-Verhalten zurueck).
 */
export function useConceptIngestion(args: UseConceptIngestionArgs) {
  const generationRef = useRef<string | null>(null)

  useEffect(() => {
    const { userId, activePathId, isSetupComplete } = args
    if (!userId || !activePathId || !isSetupComplete) {
      return
    }
    if (generationRef.current === activePathId) {
      return
    }
    generationRef.current = activePathId
    let cancelled = false

    const run = async () => {
      // Bereits vorhanden? Dann nur laden (Idempotenz gegen Doppel-Generierung / Reload).
      try {
        const existing = await loadConceptGraph(activePathId)
        if (cancelled) {
          return
        }
        if (existing.concepts.length > 0) {
          args.onGraphReady(existing)
          args.onStatus('ready')
          return
        }
      } catch {
        // Ladefehler ignorieren und Generierung versuchen.
      }

      // Kein Netz vorhanden: nur bei einem FRISCHEN Pfad neu ingesten. Ein Pfad mit bereits vorhandenem
      // Legacy-Inhalt (alte Architektur) wird nicht nachtraeglich per KI zerlegt.
      if (args.hasExistingContent) {
        args.onStatus('absent')
        return
      }

      const topicHint = (args.selectedTopic.trim() || args.effectiveTopic.trim()).slice(0, 120)
      let graph: IngestedGraph | null = null

      if (args.generationMode === 'placeholder') {
        await placeholderDelay()
        if (cancelled) {
          return
        }
        graph = buildPlaceholderConceptGraph(topicHint)
      } else {
        // Map-Reduce: das Material vollständig in Abschnitte teilen, JEDEN Abschnitt einzeln analysieren
        // (statt nur eines RAG-Auszugs), dann alle Teilnetze zu einem deduplizierten Netz zusammenführen.
        // So trägt jeder Teil des Dokuments bei — nichts wird durch einen Relevanz-Filter verworfen.
        const sections = sectionMaterials(args.materials, {
          targetChars: INGEST_SECTION_TARGET_CHARS,
          maxSections: INGEST_MAX_SECTIONS,
        })

        // Eine einzelne Ingestion-Anfrage (tolerantes Parsen; die Mindestmengen-Validierung greift erst
        // nach dem Merge, da ein einzelner Abschnitt legitim wenige Konzepte liefern kann).
        const ingestContext = async (materialContext: string): Promise<IngestedGraph | null> => {
          for (let attempt = 1; attempt <= CONCEPT_INGESTION_MAX_ATTEMPTS; attempt += 1) {
            if (cancelled) {
              return null
            }
            try {
              const result = await sendMessage(
                [
                  {
                    id: crypto.randomUUID(),
                    role: 'user',
                    content: buildConceptIngestionPrompt({ topicHint, materialContext, attempt, validationHint: '' }),
                    createdAt: new Date().toISOString(),
                  },
                ],
                {
                  systemPrompt: args.getPrompt('learn_tutor'),
                  useLearnPathModel: true,
                  learnTelemetryMode: 'learn_tutor',
                  learnPathSystemPromptMode: 'tutor_only',
                },
              )
              if (cancelled) {
                return null
              }
              const parsed = parseConceptGraphFromText(result.assistantMessage.content)
              if (parsed.concepts.length > 0) {
                return parsed
              }
            } catch {
              // Abschnitt überspringen / nächster Versuch — andere Abschnitte tragen weiter bei.
            }
          }
          return null
        }

        if (sections.length === 0) {
          // Kein auswertbares Material: einmalig nur aus dem Thema ableiten (Legacy-Fallback).
          const ctx = formatRelevantMaterialContext(
            [topicHint, 'Konzepte Wissenseinheiten Voraussetzungen Abhaengigkeiten'].filter(Boolean).join(' '),
            args.materials,
            { maxChunks: 8, maxChars: 6000 },
          )
          graph = await ingestContext(ctx)
        } else {
          const graphs: IngestedGraph[] = []
          for (let i = 0; i < sections.length && !cancelled; i += INGEST_CONCURRENCY) {
            const batch = sections.slice(i, i + INGEST_CONCURRENCY)
            const results = await Promise.all(
              batch.map((section) => ingestContext(`Materialabschnitt (${section.label}):\n${section.text}`)),
            )
            for (const g of results) {
              if (g) {
                graphs.push(g)
              }
            }
          }
          if (cancelled) {
            return
          }
          graph = graphs.length > 0 ? mergeConceptGraphs(graphs) : null
        }
      }

      if (cancelled || !graph || !validateConceptGraph(graph).valid) {
        // Stille Degradation: ohne (gueltiges) Netz laufen spaetere Schichten auf dem Legacy-Pfad.
        if (!cancelled) {
          args.onStatus('absent')
        }
        return
      }

      try {
        const saved = await saveConceptGraph(activePathId, graph)
        if (cancelled) {
          return
        }
        args.onGraphReady(saved)
        args.onStatus('ready')
      } catch (error) {
        if (!cancelled) {
          console.error('Lernbereich: Konzept-Netz konnte nicht gespeichert werden', error)
          args.onStatus('absent')
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
    // activePathId-Wechsel triggert neu; die generationRef-Guard verhindert Mehrfachlauf pro Pfad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.userId, args.activePathId, args.isSetupComplete])
}
