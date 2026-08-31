/**
 * Schicht 2 — Wissensgraph (Kapitel 4.1).
 *
 * Die Landkarte des Stoffs: Konzepte als kleinste pruefbare Teilfaehigkeiten, verbunden durch
 * einen gerichteten Voraussetzungsgraphen. Kante von A nach B bedeutet: B setzt A voraus.
 *
 * Warum gerichtet und nicht hierarchisch: nur eine gerichtete Abhaengigkeit erlaubt
 * Ursachenforschung. Wenn jemand bei der Subnetzmaske scheitert, geht das Gehirn die Kette
 * rueckwaerts und findet die eigentliche Luecke bei den Zweierpotenzen. Eine Hierarchie
 * (Fach -> Thema -> Konzept) sagt, wo etwas steht, nicht warum jemand scheitert.
 *
 * Invariante I10: dieser Graph enthaelt keine personenbezogenen Leistungsdaten. Wo Funktionen
 * hier das Lernerbild lesen, tun sie das ueber einen hereingereichten Parameter — die Struktur
 * selbst bleibt personenfrei und damit spaeter teilbar.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { BrainConcept, BrainPrerequisiteEdge, LearnerConceptImage } from '../types'

/** Voraussetzungen von `conceptId` (Kanten, die dorthin zeigen). */
export function prerequisitesOf(edges: BrainPrerequisiteEdge[], conceptId: string): string[] {
  return edges.filter((e) => e.toConceptId === conceptId).map((e) => e.fromConceptId)
}

/** Konzepte, die `conceptId` voraussetzen (Kanten, die von dort ausgehen). */
export function dependentsOf(edges: BrainPrerequisiteEdge[], conceptId: string): string[] {
  return edges.filter((e) => e.fromConceptId === conceptId).map((e) => e.toConceptId)
}

/**
 * Topologische Sortierung (Kahn): eine Voraussetzung kommt immer vor dem Konzept, das sie
 * braucht. Grundlage der festen Pfadreihenfolge aus Kapitel 11.
 *
 * Deterministische Tie-Breaks — Schwierigkeit, dann ordinal, dann Id. Das ist wichtiger, als es
 * aussieht: eine Reihenfolge, die bei gleicher Ausgangslage zweimal unterschiedlich ausfaellt,
 * macht Kapitel 11 („die Strecke muss stillhalten") unmoeglich.
 *
 * Zyklen werden aufgebrochen statt zu haengen: verbleibende Knoten werden deterministisch
 * angehaengt. Ein Zyklus ist ein Kartografenfehler, kein Grund, den Pfad nicht anzuzeigen.
 */
export function topologicalOrder(concepts: BrainConcept[], edges: BrainPrerequisiteEdge[]): string[] {
  const byId = new Map(concepts.map((c) => [c.id, c]))
  const ids = concepts.map((c) => c.id)
  const idSet = new Set(ids)

  const inDegree = new Map<string, number>(ids.map((id) => [id, 0]))
  const adjacency = new Map<string, string[]>(ids.map((id) => [id, []]))

  for (const edge of edges) {
    if (!idSet.has(edge.fromConceptId) || !idSet.has(edge.toConceptId)) {
      continue
    }
    adjacency.get(edge.fromConceptId)?.push(edge.toConceptId)
    inDegree.set(edge.toConceptId, (inDegree.get(edge.toConceptId) ?? 0) + 1)
  }

  const compare = (a: string, b: string): number => {
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
    ready.sort(compare)
    const id = ready.shift() as string
    if (visited.has(id)) {
      continue
    }
    visited.add(id)
    result.push(id)
    for (const next of adjacency.get(id) ?? []) {
      inDegree.set(next, (inDegree.get(next) ?? 0) - 1)
      if ((inDegree.get(next) ?? 0) === 0 && !visited.has(next)) {
        ready.push(next)
      }
    }
  }

  if (result.length < ids.length) {
    result.push(...ids.filter((id) => !visited.has(id)).sort(compare))
  }
  return result
}

/** Ein Glied der Ursachenkette. */
export type RootCauseLink = {
  conceptId: string
  /** Kantenabstand zum Ausgangskonzept. */
  distance: number
  mastery: number
  confidence: number
}

/**
 * Ursachensuche: von einem Fehlschlag aus die Voraussetzungskette rueckwaerts gehen und die
 * schwaechsten Glieder finden (Kapitel 4.1).
 *
 * Zurueck kommen die Voraussetzungen unterhalb von `masteryThreshold`, sortiert nach
 * Beherrschung aufsteigend — das schwaechste zuerst, denn dort liegt die eigentliche Luecke.
 * Ein Konzept ohne Lernerbild zaehlt als unbekannt (Beherrschung 0) und ist damit ein
 * vollwertiger Verdaechtiger: „noch nie geprueft" ist der haeufigste Grund fuer eine Luecke.
 *
 * `maxDepth` begrenzt die Suche aus demselben Grund wie die Propagation: eine Kette, die zehn
 * Kanten weit zurueckgeht, landet bei „kann rechnen" und hilft niemandem.
 */
export function findRootCauses(args: {
  conceptId: string
  edges: BrainPrerequisiteEdge[]
  images: Map<string, LearnerConceptImage>
  masteryThreshold?: number
  maxDepth?: number
}): RootCauseLink[] {
  const { conceptId, edges, images } = args
  const threshold = args.masteryThreshold ?? 0.6
  const maxDepth = args.maxDepth ?? 3

  const found: RootCauseLink[] = []
  const visited = new Set<string>([conceptId])
  let frontier = [conceptId]

  for (let distance = 1; distance <= maxDepth; distance += 1) {
    const next: string[] = []
    for (const nodeId of frontier) {
      for (const prerequisiteId of prerequisitesOf(edges, nodeId)) {
        if (visited.has(prerequisiteId)) {
          continue
        }
        visited.add(prerequisiteId)
        next.push(prerequisiteId)

        const image = images.get(prerequisiteId)
        const mastery = image?.mastery ?? 0
        if (mastery < threshold) {
          found.push({
            conceptId: prerequisiteId,
            distance,
            mastery,
            confidence: image?.confidence ?? 0,
          })
        }
      }
    }
    frontier = next
    if (frontier.length === 0) {
      break
    }
  }

  return found.sort((a, b) => (a.mastery !== b.mastery ? a.mastery - b.mastery : a.distance - b.distance))
}

/**
 * Die Front (Glossar): die Grenze zwischen dem, was jemand kann, und dem, was noch offen ist.
 *
 * Ein Konzept liegt auf der Front, wenn es selbst noch nicht sitzt, aber alle seine
 * Voraussetzungen sitzen. Genau diese Knoten sind lernbar — alles davor waere Wiederholung,
 * alles dahinter waere ohne Fundament.
 */
export function frontier(args: {
  concepts: BrainConcept[]
  edges: BrainPrerequisiteEdge[]
  images: Map<string, LearnerConceptImage>
  masteryThreshold?: number
}): string[] {
  const { concepts, edges, images } = args
  const threshold = args.masteryThreshold ?? 0.7

  const isMastered = (id: string) => (images.get(id)?.mastery ?? 0) >= threshold

  return concepts
    .filter((concept) => !isMastered(concept.id))
    .filter((concept) => prerequisitesOf(edges, concept.id).every(isMastered))
    .map((concept) => concept.id)
}

/**
 * Herkunftsstatistik eines Pfads (Invariante I4).
 *
 * Spaetestens vor einer Pruefung will ein Nutzer wissen, was aus seinem Stoff stammt und was
 * die KI ergaenzt hat. Diese Zahlen sind die Datengrundlage dafuer.
 *
 * `unknown` zaehlt Altbestand mit nicht rekonstruierbarer Herkunft mit — sichtbar, nicht
 * weggerechnet: eine Herkunftsstatistik, die ihre eigene Luecke verschweigt, ist keine.
 */
export function originBreakdown(concepts: BrainConcept[]): Record<BrainConcept['origin'], number> {
  const counts: Record<BrainConcept['origin'], number> = { material: 0, aiSupplement: 0, user: 0, unknown: 0 }
  for (const concept of concepts) {
    counts[concept.origin] += 1
  }
  return counts
}

/**
 * Konzepte ohne jede Quellenangabe finden.
 *
 * Ein material-Konzept ohne `sourceRef` und ohne `sourceQuote` ist ein Widerspruch: es behauptet,
 * aus dem Dokument zu stammen, kann das aber nicht belegen. Nach I4 ist das ein Datenfehler,
 * den die Ingestion melden muss, statt ihn stillschweigend durchzulassen.
 */
export function conceptsWithoutProvenance(concepts: BrainConcept[]): BrainConcept[] {
  return concepts.filter((concept) => {
    if (concept.origin !== 'material') {
      return false
    }
    const ref = concept.sourceRef
    const hasRef = Boolean(ref.doc || ref.section || ref.pageFrom != null)
    return !hasRef && concept.sourceQuote.trim().length === 0
  })
}
