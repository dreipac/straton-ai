/**
 * Schicht 6 — was ein Konsolidierungslauf tatsaechlich vorschlaegt (Kapitel 8.2).
 *
 * `restructure.ts` findet Kandidaten und baut einzelne Vorschlaege. Diese Datei entscheidet, was
 * davon den Nutzer erreicht: sie filtert, begrenzt und ordnet. Die Trennung ist nicht Kosmetik —
 * die Kandidatensuche ist eine Aussage ueber die Daten, die Auswahl eine Aussage darueber, was
 * einem Menschen an einem Abend zumutbar ist. Nur die zweite hat Obergrenzen.
 *
 * Drei Operationen, drei verschiedene Wege — nach umkehrbar gegen zerstoererisch, nicht nach
 * gross gegen klein (Kapitel 8.2):
 *
 *   Verschmelzen   ZERSTOERERISCH   wird GEFRAGT (I6), hoechstens zwei Fragen je Lauf
 *   Kante          umkehrbar        laeuft AUTOMATISCH, protokolliert, hoechstens zwei je Lauf
 *   Aufspalten     —                wird ERKANNT, aber nicht vorgeschlagen (Begruendung unten)
 *
 * Rein — kein DOM, kein I/O.
 */

import type { BrainConcept, BrainPrerequisiteEdge, StructureOperation, StructureProposal } from '../types'
import {
  discoverEdges,
  findMergeCandidates,
  findSplitCandidates,
  proposeEdge,
  proposeMerge,
  proposeMergeFromInsight,
  type EvidenceSample,
  type SplitCandidate,
} from './restructure'
import type { ConsolidatorInsights } from './consolidator'

/**
 * Hoechstens zwei Verschmelzungsfragen je Lauf.
 *
 * Eine Verschmelzungsfrage ist keine Benachrichtigung, sondern eine Entscheidung ueber das eigene
 * Material, die der Nutzer nur treffen kann, wenn er beide Begriffe wirklich vergleicht. Fuenf
 * davon nebeneinander werden nicht fuenfmal beantwortet, sondern einmal weggeklickt — und ein
 * weggeklickter Vorschlag ist nach Kapitel 3.7 ein Nein, das dauerhaft gilt. Lieber langsam
 * aufraeumen als die Fragen entwerten. Zwischen zwei Laeufen liegen ohnehin mindestens
 * `CONSOLIDATION_COOLDOWN_HOURS`.
 */
export const MAX_MERGE_QUESTIONS_PER_RUN = 2

/**
 * Hoechstens zwei automatische Kanten je Lauf.
 *
 * Eine Kante wird nicht gefragt, also merkt der Nutzer sie nur an der geaenderten Reihenfolge.
 * Zwei auf einmal sind noch nachvollziehbar, zehn sind ein anderer Lernpfad.
 */
export const MAX_AUTO_EDGES_PER_RUN = 2

/** Ein frueher schon einmal gestellter Vorschlag — unabhaengig davon, wie er ausging. */
export type PriorProposal = {
  operation: StructureOperation
  payload: Record<string, unknown>
}

/** Schluessel eines Verschmelzungsvorschlags. UNGEORDNET: „A mit B" und „B mit A" sind dieselbe Frage. */
export function mergeKeyOf(a: string, b: string): string {
  return a < b ? `mergeConcepts:${a}|${b}` : `mergeConcepts:${b}|${a}`
}

/** Schluessel eines Kantenvorschlags. GEORDNET: eine Voraussetzung hat eine Richtung. */
export function edgeKeyOf(fromConceptId: string, toConceptId: string): string {
  return `addEdge:${fromConceptId}|${toConceptId}`
}

/**
 * Alles, was zu diesem Pfad je vorgeschlagen wurde, als Sperrmenge.
 *
 * Bewusst OHNE Ruecksicht auf den Ausgang. Ein abgelehnter Vorschlag darf nicht wiederkommen —
 * sonst waere das Nein des Nutzers folgenlos und die Frage kaeme alle sechs Stunden erneut. Ein
 * angenommener ist erledigt, ein verfallener wurde bewusst nicht beantwortet (Kapitel 3.7: „bleibt
 * eine Frage unbeantwortet, aendert sich nichts"), und ein offener steht schon da.
 */
export function suppressionKeys(priors: PriorProposal[]): Set<string> {
  const keys = new Set<string>()
  for (const prior of priors) {
    if (prior.operation === 'mergeConcepts') {
      const keep = String(prior.payload.keepConceptId ?? '')
      const merge = String(prior.payload.mergeConceptId ?? '')
      if (keep && merge) {
        keys.add(mergeKeyOf(keep, merge))
      }
      continue
    }
    if (prior.operation === 'addEdge') {
      const from = String(prior.payload.fromConceptId ?? '')
      const to = String(prior.payload.toConceptId ?? '')
      if (from && to) {
        keys.add(edgeKeyOf(from, to))
      }
    }
  }
  return keys
}

export type ConsolidationPlanInput = {
  userId: string
  pathId: string
  concepts: BrainConcept[]
  edges: BrainPrerequisiteEdge[]
  samples: EvidenceSample[]
  /** Was der Konsolidierer beigesteuert hat; leer, wenn der Aufruf ausfiel. */
  insights: ConsolidatorInsights
  priorProposals: PriorProposal[]
  nowIso: string
}

export type PlannedEdge = {
  proposal: StructureProposal
  fromConceptId: string
  toConceptId: string
}

export type ConsolidationPlanResult = {
  /** Werden als offene Fragen gespeichert und in der Einsichten-Karte gezeigt. */
  mergeProposals: StructureProposal[]
  /** Werden angewandt UND als `autoApplied` protokolliert — nie gezeigt. */
  edges: PlannedEdge[]
  /**
   * Erkannt, aber nicht vorgeschlagen.
   *
   * Eine Aufspaltung muss zwei NEUE Konzepte anlegen, und wie die beiden Haelften heissen, weiss
   * nur, wer das Material gelesen hat. Diesen Weg gibt es noch nicht: weder `services/` kann eine
   * Aufspaltung ausfuehren, noch kaeme die Zustimmung des Nutzers irgendwo an. Eine Frage zu
   * stellen, deren Ja folgenlos bleibt, waere schlimmer als zu schweigen — deshalb wird der
   * Kandidat nur gezaehlt und im Lauf-Protokoll festgehalten.
   */
  splitCandidates: SplitCandidate[]
  summary: {
    mergeCandidates: number
    mergeFromInsights: number
    edgeCandidates: number
    splitCandidates: number
    mergeQuestions: number
    autoEdges: number
    suppressed: number
  }
}

/**
 * Den Lauf planen.
 *
 * Reihenfolge der Verschmelzungskandidaten: erst die aus dem Namensvergleich (die Wortueberlappung
 * ist ein nachrechenbarer Beleg), dann die des Konsolidierers (ein Urteil ueber Bedeutung, das
 * niemand nachrechnen kann). Bei gleicher Sachlage gewinnt damit immer der belegbare Vorschlag
 * einen der beiden knappen Plaetze.
 */
export function planConsolidation(input: ConsolidationPlanInput): ConsolidationPlanResult {
  const known = new Map(input.concepts.map((concept) => [concept.id, concept]))
  const suppressed = suppressionKeys(input.priorProposals)
  let suppressedCount = 0

  /*
   * Zwei Konzepte, zwischen denen eine Voraussetzung steht, sind nicht dasselbe — sonst waere es
   * eine Voraussetzung fuer sich selbst. Diese Sperre ist wichtiger als sie aussieht: gerade eng
   * verwandte Nachbarn („Steuersatz" / „Steuersatz berechnen") haben hohe Wortueberlappung UND
   * eine Kante, und eine Verschmelzung wuerde die Abhaengigkeit dauerhaft loeschen.
   */
  const linked = new Set<string>()
  for (const edge of input.edges) {
    linked.add(mergeKeyOf(edge.fromConceptId, edge.toConceptId))
  }

  const nameCandidates = findMergeCandidates(input.concepts)
  const mergeProposals: StructureProposal[] = []
  const takenMergeKeys = new Set<string>()

  const canPropose = (a: string, b: string): boolean => {
    if (!known.has(a) || !known.has(b) || a === b) {
      return false
    }
    const key = mergeKeyOf(a, b)
    if (takenMergeKeys.has(key) || linked.has(key)) {
      return false
    }
    if (suppressed.has(key)) {
      suppressedCount += 1
      return false
    }
    return true
  }

  for (const candidate of nameCandidates) {
    if (mergeProposals.length >= MAX_MERGE_QUESTIONS_PER_RUN) {
      break
    }
    if (!canPropose(candidate.aConceptId, candidate.bConceptId)) {
      continue
    }
    takenMergeKeys.add(mergeKeyOf(candidate.aConceptId, candidate.bConceptId))
    mergeProposals.push(
      proposeMerge({ userId: input.userId, pathId: input.pathId, candidate, nowIso: input.nowIso }),
    )
  }

  for (const insight of input.insights.merges) {
    if (mergeProposals.length >= MAX_MERGE_QUESTIONS_PER_RUN) {
      break
    }
    if (!canPropose(insight.keepConceptId, insight.mergeConceptId)) {
      continue
    }
    takenMergeKeys.add(mergeKeyOf(insight.keepConceptId, insight.mergeConceptId))
    mergeProposals.push(
      proposeMergeFromInsight({
        userId: input.userId,
        pathId: input.pathId,
        keepConceptId: insight.keepConceptId,
        mergeConceptId: insight.mergeConceptId,
        question: insight.question,
        rationale: insight.rationale,
        nowIso: input.nowIso,
      }),
    )
  }

  const edgeCandidates = discoverEdges({
    samples: input.samples,
    existingEdges: input.edges,
    conceptIds: input.concepts.map((concept) => concept.id),
  })

  const edges: PlannedEdge[] = []
  for (const candidate of edgeCandidates) {
    if (edges.length >= MAX_AUTO_EDGES_PER_RUN) {
      break
    }
    if (!known.has(candidate.fromConceptId) || !known.has(candidate.toConceptId)) {
      continue
    }
    const key = edgeKeyOf(candidate.fromConceptId, candidate.toConceptId)
    if (suppressed.has(key)) {
      suppressedCount += 1
      continue
    }
    /*
     * `status: 'autoApplied'` statt `'pending'`: die Kante wird angewandt, nicht gefragt
     * (Kapitel 8.2, „umkehrbar, automatisch"). Der Eintrag bleibt trotzdem stehen — er ist der
     * Grund, warum die Kante da ist, und `insightsView` zeigt nur `pending`, der Nutzer wird also
     * nicht behelligt. Bei einer nicht-zerstoererischen Operation ist das nach I6 zulaessig; die
     * Pruefung dazu laeuft in `createProposal` erneut.
     */
    const proposal = proposeEdge({ userId: input.userId, pathId: input.pathId, candidate, nowIso: input.nowIso })
    edges.push({
      proposal: { ...proposal, status: 'autoApplied' },
      fromConceptId: candidate.fromConceptId,
      toConceptId: candidate.toConceptId,
    })
  }

  const splitCandidates = findSplitCandidates({
    samples: input.samples,
    conceptIds: input.concepts.map((concept) => concept.id),
  })

  return {
    mergeProposals,
    edges,
    splitCandidates,
    summary: {
      mergeCandidates: nameCandidates.length,
      mergeFromInsights: input.insights.merges.length,
      edgeCandidates: edgeCandidates.length,
      splitCandidates: splitCandidates.length,
      mergeQuestions: mergeProposals.length,
      autoEdges: edges.length,
      suppressed: suppressedCount,
    },
  }
}
