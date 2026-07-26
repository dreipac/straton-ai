import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Concept, ConceptEdge, LearnerConceptState } from '../engine/types'
import { applyConceptObservation, effectiveMastery } from '../engine/learnerModel'
import { topicScore } from '../engine/masteryScoring'
import { normalizeConceptSlug } from '../utils/conceptIngestion'
import { loadConceptStates, upsertConceptStates } from '../services/learnConceptGraph.persistence'

type ConceptGraphSnapshot = { concepts: Concept[]; edges: ConceptEdge[] }

type UseConceptLearnerModelArgs = {
  userId: string | null
  activePathId: string | null
  conceptGraph: ConceptGraphSnapshot
}

export type ConceptLearnerModel = {
  /** Aktuelle (persistierten) Konzept-Zustaende, geladen inkl. angewandtem Verfall. */
  conceptStatesById: Map<string, LearnerConceptState>
  /**
   * Wendet eine ausgewertete Antwort auf das durch `skillTag` bezeichnete Konzept an (BKT + Verfall +
   * Propagation) und persistiert den neuen Zustand atomar. Gibt `true` zurueck, wenn das Signal ein
   * Konzept im aktuellen Netz getroffen hat (sonst faellt der Aufrufer auf das Legacy-EWMA zurueck).
   */
  applyConceptSignalByTag: (
    skillTag: string | undefined,
    outcome: { correct: boolean; difficulty?: number; credit?: number },
  ) => Promise<boolean>
  /** Verfall-bereinigte effektive Mastery eines Konzepts per Slug (0..1), oder null wenn ungesehen. */
  masteryForSlug: (slug: string | undefined) => number | null
  /** BKT-gestuetzter Gesamt-Score des Pfads (schwierigkeits-gewichtet, 0..100) — fuers Fortschritts-Display. */
  conceptPathPercent: number
}

/**
 * Lerner-Modell live (Schicht 3): laedt die persistierten Konzept-Zustaende eines Pfads (mit Verfall beim
 * Laden), wendet jede ausgewertete Antwort als echtes BKT-Update an (statt des Skalar-EWMA) und schreibt
 * den neuen Zustand atomar via RPC zurueck. Rein additiv/graph-gated: ohne geladenes Netz passiert nichts,
 * dann laeuft weiter der Legacy-Mastery-Pfad.
 */
export function useConceptLearnerModel(args: UseConceptLearnerModelArgs): ConceptLearnerModel {
  const { userId, activePathId, conceptGraph } = args

  const statesRef = useRef<Map<string, LearnerConceptState>>(new Map())
  const [statesById, setStatesById] = useState<Map<string, LearnerConceptState>>(new Map())
  const loadedForPathRef = useRef<string | null>(null)

  const conceptBySlug = useMemo(
    () => new Map(conceptGraph.concepts.map((c) => [c.slug, c])),
    [conceptGraph.concepts],
  )
  const conceptById = useMemo(
    () => new Map(conceptGraph.concepts.map((c) => [c.id, c])),
    [conceptGraph.concepts],
  )

  const commit = useCallback((map: Map<string, LearnerConceptState>) => {
    statesRef.current = map
    setStatesById(map)
  }, [])

  // Zustaende laden, sobald das Netz fuer den aktiven Pfad bereitsteht (einmal je Pfad).
  useEffect(() => {
    if (!userId || !activePathId || conceptGraph.concepts.length === 0) {
      return
    }
    if (loadedForPathRef.current === activePathId) {
      return
    }
    loadedForPathRef.current = activePathId
    let cancelled = false

    const run = async () => {
      try {
        const rows = await loadConceptStates(conceptGraph.concepts.map((c) => c.id))
        if (cancelled) {
          return
        }
        commit(new Map(rows.map((s) => [s.conceptId, s])))
      } catch (error) {
        if (!cancelled) {
          console.error('Lernbereich: Konzept-Zustaende konnten nicht geladen werden', error)
          loadedForPathRef.current = null
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [userId, activePathId, conceptGraph.concepts, commit])

  const applyConceptSignalByTag = useCallback<ConceptLearnerModel['applyConceptSignalByTag']>(
    async (skillTag, outcome) => {
      if (!userId) {
        return false
      }
      const slug = normalizeConceptSlug(skillTag)
      if (!slug) {
        return false
      }
      const concept = conceptBySlug.get(slug)
      if (!concept) {
        return false
      }

      const nowIso = new Date().toISOString()
      const working = new Map(statesRef.current)
      const { updated, propagated } = applyConceptObservation({
        concept,
        edges: conceptGraph.edges,
        statesById: working,
        correct: outcome.correct,
        credit: outcome.credit,
        difficulty: outcome.difficulty,
        nowIso,
      })
      working.set(updated.conceptId, updated)
      for (const p of propagated) {
        working.set(p.conceptId, p)
      }
      commit(working)

      try {
        await upsertConceptStates(userId, [updated, ...propagated])
      } catch (error) {
        console.error('Lernbereich: Konzept-Zustand konnte nicht gespeichert werden', error)
      }
      return true
    },
    [userId, conceptBySlug, conceptGraph.edges, commit],
  )

  const masteryForSlug = useCallback<ConceptLearnerModel['masteryForSlug']>(
    (slug) => {
      const normalized = normalizeConceptSlug(slug)
      if (!normalized) {
        return null
      }
      const concept = conceptBySlug.get(normalized)
      if (!concept) {
        return null
      }
      const state = statesById.get(concept.id)
      if (!state) {
        return null
      }
      return effectiveMastery(state, new Date().toISOString())
    },
    [conceptBySlug, statesById],
  )

  const conceptPathPercent = useMemo(() => {
    if (statesById.size === 0) {
      return 0
    }
    const nowIso = new Date().toISOString()
    const entries = [...statesById.values()]
      .map((state) => {
        const concept = conceptById.get(state.conceptId)
        if (!concept) {
          return null
        }
        return { pMastery: effectiveMastery(state, nowIso), difficulty: concept.difficulty }
      })
      .filter((e): e is { pMastery: number; difficulty: number } => e !== null)
    if (entries.length === 0) {
      return 0
    }
    return Math.round(topicScore(entries) * 100)
  }, [statesById, conceptById])

  return { conceptStatesById: statesById, applyConceptSignalByTag, masteryForSlug, conceptPathPercent }
}
