/**
 * Konzept-Graph-Operationen — Schicht 1/2/3.
 *
 * Reine Graph-Algorithmen ueber Konzepte + typisierte Kanten:
 *  - topologische Sortierung (respektiert Voraussetzungen) fuer die Curriculum-Reihenfolge,
 *  - Nachbar-Abfragen nach Kantentyp,
 *  - Graph-gestuetzter Prior (gemeisterte Voraussetzungen/Verwandte heben den Startwert),
 *  - Signal-Propagation an verwandte/voraussetzende Konzepte.
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

export type Propagation = { conceptId: string; direction: 'up' | 'down'; strength: number }

/**
 * Nachbar-Konzepte, die von einer Beobachtung mitgezogen werden: Verwandte in gleicher Richtung
 * (leicht), Voraussetzungen nur bei richtiger Antwort leicht nach oben (du beherrschst sie offenbar).
 */
export function propagateSignal(conceptId: string, correct: boolean, edges: ConceptEdge[]): Propagation[] {
  const nudges: Propagation[] = []
  const related = uniq([
    ...neighbors(edges, conceptId, 'related', 'out'),
    ...neighbors(edges, conceptId, 'related', 'in'),
  ])
  for (const id of related) {
    nudges.push({ conceptId: id, direction: correct ? 'up' : 'down', strength: 0.05 })
  }
  if (correct) {
    for (const id of prerequisitesOf(edges, conceptId)) {
      nudges.push({ conceptId: id, direction: 'up', strength: 0.03 })
    }
  }
  return nudges
}

/** Eine Propagation auf einen P(Mastery)-Wert anwenden (multiplikativ Richtung 1 bzw. 0). */
export function applyPropagation(pMastery: number, p: Propagation): number {
  const value = p.direction === 'up' ? pMastery + (1 - pMastery) * p.strength : pMastery * (1 - p.strength)
  return clamp01(value)
}
