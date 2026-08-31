/**
 * Konzept-Graph-Operationen — Schicht 1/2/3.
 *
 * Reine Graph-Algorithmen ueber Konzepte + typisierte Kanten:
 *  - topologische Sortierung (respektiert Voraussetzungen) fuer die Curriculum-Reihenfolge,
 *  - Nachbar-Abfragen nach Kantentyp,
 *  - Graph-gestuetzter Prior (gemeisterte Voraussetzungen/Verwandte heben den Startwert).
 *
 * ENTFERNT: die Signal-Propagation an verwandte/voraussetzende Konzepte.
 *
 * `propagateSignal` und `applyPropagation` haben die BEHERRSCHUNG der Nachbarknoten verschoben —
 * bei einer richtigen Antwort sogar nach oben. Das verletzt zwei Invarianten des
 * Architekturdokuments (`straton-gehirn-architektur.md`, Kapitel 1) gleichzeitig:
 *
 *   I1  Nur direkte Evidenz veraendert die Beherrschung eines Konzepts.
 *   I3  Propagation im Graphen veraendert nie die Beherrschung, ausschliesslich die Sicherheit.
 *
 * Kapitel 1 gilt „an keiner Stelle der Implementierung […] auch nicht temporaer". Die Funktionen
 * sind deshalb ersatzlos entfallen statt auskommentiert: eine exportierte Funktion, die eine
 * Invariante bricht, wird irgendwann wieder importiert.
 *
 * Der Ersatz steht im Gehirn-Modul: `brain/memory/propagation.ts` verteilt denselben Zweifel,
 * bewegt dabei aber ausschliesslich die Sicherheit (`ConfidenceAdjustment` hat kein
 * Beherrschungsfeld).
 */

import type { Concept, ConceptEdge, EdgeType, LearnerConceptState } from './types'

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function uniq(values: string[]): string[] {
  return [...new Set(values)]
}

/** Nachbarn eines Konzepts nach Kantentyp und Richtung. */
export function neighbors(
  edges: ConceptEdge[],
  conceptId: string,
  type: EdgeType,
  direction: 'out' | 'in' = 'out',
): string[] {
  return edges
    .filter((e) => e.type === type && (direction === 'out' ? e.fromConceptId === conceptId : e.toConceptId === conceptId))
    .map((e) => (direction === 'out' ? e.toConceptId : e.fromConceptId))
}

/** Die Voraussetzungs-Konzepte, die `conceptId` benoetigt (Kanten prerequisite -> conceptId). */
export function prerequisitesOf(edges: ConceptEdge[], conceptId: string): string[] {
  return neighbors(edges, conceptId, 'prerequisite', 'in')
}

/**
 * Topologische Sortierung (Kahn) ueber prerequisite-Kanten: eine Voraussetzung kommt vor ihrem
 * abhaengigen Konzept. Deterministische Tie-Breaks: Schwierigkeit aufsteigend, dann ordinal, dann id.
 * Zyklen werden aufgebrochen (verbleibende Knoten deterministisch angehaengt), nie Endlosschleife.
 */
export function topologicalOrder(concepts: Concept[], edges: ConceptEdge[]): string[] {
  const byId = new Map(concepts.map((c) => [c.id, c]))
  const ids = concepts.map((c) => c.id)
  const idSet = new Set(ids)

  const inDegree = new Map<string, number>(ids.map((id) => [id, 0]))
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const e of edges) {
    if (e.type !== 'prerequisite' || !idSet.has(e.fromConceptId) || !idSet.has(e.toConceptId)) {
      continue
    }
    adj.get(e.fromConceptId)?.push(e.toConceptId)
    inDegree.set(e.toConceptId, (inDegree.get(e.toConceptId) ?? 0) + 1)
  }

  const cmp = (a: string, b: string): number => {
    const ca = byId.get(a)
    const cb = byId.get(b)
    if (!ca || !cb) {
      return a < b ? -1 : a > b ? 1 : 0
    }
    if (ca.difficulty !== cb.difficulty) {
      return ca.difficulty - cb.difficulty
    }
    if (ca.ordinal !== cb.ordinal) {
      return ca.ordinal - cb.ordinal
    }
    return ca.id < cb.id ? -1 : ca.id > cb.id ? 1 : 0
  }

  const ready = ids.filter((id) => (inDegree.get(id) ?? 0) === 0)
  const visited = new Set<string>()
  const result: string[] = []

  while (ready.length > 0) {
    ready.sort(cmp)
    const id = ready.shift() as string
    if (visited.has(id)) {
      continue
    }
    visited.add(id)
    result.push(id)
    for (const next of adj.get(id) ?? []) {
      inDegree.set(next, (inDegree.get(next) ?? 0) - 1)
      if ((inDegree.get(next) ?? 0) === 0 && !visited.has(next)) {
        ready.push(next)
      }
    }
  }

  if (result.length < ids.length) {
    // Zyklus-Rest deterministisch anhaengen.
    result.push(...ids.filter((id) => !visited.has(id)).sort(cmp))
  }
  return result
}

/**
 * Graph-gestuetzter Startwert (Prior) fuer ein Konzept: der "kalte" Seed (nur Schwierigkeit) wird
 * durch bereits gemeisterte Voraussetzungen stark, durch gemeisterte Verwandte leicht angehoben.
 */
export function priorFromGraph(
  concept: Concept,
  edges: ConceptEdge[],
  statesById: Map<string, LearnerConceptState>,
  coldSeed: number,
): number {
  let prior = clamp01(coldSeed)

  const prereqIds = prerequisitesOf(edges, concept.id)
  if (prereqIds.length > 0) {
    const avg = mean(prereqIds.map((id) => statesById.get(id)?.pMastery ?? 0))
    prior += 0.3 * avg * (1 - prior)
  }

  const relatedIds = uniq([
    ...neighbors(edges, concept.id, 'related', 'out'),
    ...neighbors(edges, concept.id, 'related', 'in'),
  ])
  if (relatedIds.length > 0) {
    const avg = mean(relatedIds.map((id) => statesById.get(id)?.pMastery ?? 0))
    prior += 0.1 * avg * (1 - prior)
  }

  return clamp01(prior)
}

/*
 * Hier standen `Propagation`, `propagateSignal` und `applyPropagation`.
 * Warum sie entfallen sind, steht im Dateikopf (Invarianten I1 und I3).
 */
