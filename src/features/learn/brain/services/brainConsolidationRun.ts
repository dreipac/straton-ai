/**
 * Der Konsolidierungslauf (Kapitel 8 und 10) — die Stelle, an der Schicht 6 tatsaechlich losgeht.
 *
 * Bis hierher war die Konsolidierung vollstaendig gebaut und nie gestartet: Ausloeser, Wertregeln,
 * Kandidatensuche, Vorschlagsbau, Persistenz, Bestaetigungsdialog und Ruecknahmeprotokoll standen
 * da, aber `evaluateTrigger` hatte keine Aufrufstelle und die Rolle „konsolidierer" wurde nie
 * gefragt. Der sichtbare Preis dafuer waren doppelte Konzepte, die nie wieder verschwanden — es
 * gab keinen Mechanismus, der aufraeumt.
 *
 * Diese Datei ist bewusst nur Ablauf, keine Entscheidung:
 *  - OB gelaufen wird, entscheidet `consolidation/trigger.ts`,
 *  - WAS vorgeschlagen wird, entscheidet `consolidation/plan.ts`,
 *  - WIE Werte behandelt werden, entscheidet `consolidation/restructure.ts`.
 * Hier steht die Reihenfolge der Schreibvorgaenge — und die ist nicht beliebig (Kapitel 8.4:
 * Protokoll vor Aenderung).
 */

import { evaluateTrigger } from '../consolidation/trigger'
import { planConsolidation } from '../consolidation/plan'
import { buildLogEntry, undoPayloadForAddEdge } from '../consolidation/restructure'
import { groupObservations, upsertPattern, type ErrorObservation } from '../consolidation/patterns'
import { askConsolidator, NO_INSIGHTS, type ConsolidatorInsights } from '../consolidation/consolidator'
import type { ConsolidatorRequest } from '../agents/contracts'
import type { ErrorPattern } from '../types'
import { loadKnowledgeGraph, addPrerequisiteEdge } from './brainMemory.persistence'
import { loadErrorObservations, loadEvidenceSamples } from './brainEvidence.persistence'
import {
  attachObservationsToPattern,
  createProposal,
  finishConsolidation,
  loadConsolidationState,
  loadErrorPatterns,
  loadProposalHistory,
  recordStructureChange,
  upsertErrorPattern,
} from './brainConsolidation.persistence'

/**
 * Wie viele Beobachtungen der Konsolidierer hoechstens zu sehen bekommt.
 *
 * Die Musterbildung selbst laeuft ueber ALLE geladenen Beobachtungen (deterministisch, in
 * `groupObservations`). Begrenzt wird nur, was ins Modell geht — eine Anfrage mit fuenfhundert
 * Beobachtungen kostet viel und bringt nichts: Muster zeigen sich in den ersten Dutzend.
 */
const MAX_OBSERVATIONS_FOR_AGENT = 60

/** Wieviel Verlauf die Musterbildung liest. */
const OBSERVATION_LIMIT = 500

export type ConsolidationRunResult =
  | { ran: false; reason: 'notEnoughEvidence' | 'cooldown' | 'nothingPending' | 'noGraph' | 'failed' }
  | {
      ran: true
      /** Offene Verschmelzungsfragen, die neu in der Einsichten-Karte stehen. */
      mergeQuestions: number
      /** Automatisch angewandte Voraussetzungskanten. */
      autoEdges: number
      /** Fortgeschriebene oder neu getaufte Fehlermuster. */
      patterns: number
      /** Erkannte, aber bewusst nicht vorgeschlagene Aufspaltungen. */
      splitCandidates: number
    }

/**
 * Einen Lauf durchfuehren, falls er faellig ist.
 *
 * Wirft nie. Ein fehlgeschlagener Lauf darf weder eine Sitzungszusammenfassung aufhalten noch als
 * Fehler beim Nutzer landen — er ist Hintergrundarbeit, und die naechste Gelegenheit kommt
 * ohnehin. Bei einem Abbruch wird `finishConsolidation` NICHT gerufen: der Zaehler bleibt stehen,
 * damit der naechste Lauf dieselbe Evidenz noch einmal auswerten kann.
 */
export async function runConsolidationIfDue(args: {
  userId: string
  pathId: string
  signal?: AbortSignal
  nowIso?: string
}): Promise<ConsolidationRunResult> {
  const nowIso = args.nowIso ?? new Date().toISOString()

  try {
    const state = await loadConsolidationState({ userId: args.userId, pathId: args.pathId })
    const trigger = evaluateTrigger(state, nowIso)
    if (!trigger.shouldRun) {
      return { ran: false, reason: trigger.reason }
    }

    const graph = await loadKnowledgeGraph(args.pathId)
    if (graph.concepts.length === 0) {
      return { ran: false, reason: 'noGraph' }
    }

    const [samples, priorProposals, observations, existingPatterns] = await Promise.all([
      loadEvidenceSamples({ userId: args.userId, pathId: args.pathId }),
      loadProposalHistory({ userId: args.userId, pathId: args.pathId }),
      // Nutzerweit, nicht pfadweit: der Musterkatalog liegt eine Ebene hoeher (Kapitel 10).
      loadErrorObservations({ userId: args.userId, limit: OBSERVATION_LIMIT }),
      loadErrorPatterns(args.userId),
    ])

    const insights = await gatherInsights({
      concepts: graph.concepts,
      observations,
      existingPatterns: existingPatterns.map((pattern) => pattern.name),
      ...(args.signal ? { signal: args.signal } : {}),
    })

    const plan = planConsolidation({
      userId: args.userId,
      pathId: args.pathId,
      concepts: graph.concepts,
      edges: graph.edges,
      samples,
      insights,
      priorProposals,
      nowIso,
    })

    // 1. Verschmelzungsfragen: nur schreiben, nie anwenden (I6).
    for (const proposal of plan.mergeProposals) {
      await createProposal(proposal)
    }

    // 2. Kanten: Vorschlagseintrag, dann Protokoll, dann erst die Kante (Kapitel 8.4).
    let autoEdges = 0
    for (const planned of plan.edges) {
      const proposalId = await createProposal(planned.proposal)
      await recordStructureChange(
        buildLogEntry({
          userId: args.userId,
          pathId: args.pathId,
          proposalId,
          operation: 'addEdge',
          payload: {
            fromConceptId: planned.fromConceptId,
            toConceptId: planned.toConceptId,
            source: 'consolidation',
          },
          evidence: planned.proposal.evidence,
          undoPayload: undoPayloadForAddEdge(planned.fromConceptId, planned.toConceptId),
          nowIso,
        }),
      )
      await addPrerequisiteEdge({
        pathId: args.pathId,
        fromConceptId: planned.fromConceptId,
        toConceptId: planned.toConceptId,
        origin: 'consolidator',
      })
      autoEdges += 1
    }

    // 3. Fehlermuster fortschreiben.
    const patterns = await writePatterns({
      userId: args.userId,
      observations,
      existingByName: new Map(existingPatterns.map((pattern) => [pattern.name, pattern])),
      nameByObservation: insights.patternNameByObservation,
      nowIso,
    })

    await finishConsolidation({
      userId: args.userId,
      pathId: args.pathId,
      summary: { ...plan.summary, patterns, at: nowIso },
    })

    return {
      ran: true,
      mergeQuestions: plan.mergeProposals.length,
      autoEdges,
      patterns,
      splitCandidates: plan.splitCandidates.length,
    }
  } catch (error) {
    console.error('[brain] Konsolidierungslauf abgebrochen', error)
    return { ran: false, reason: 'failed' }
  }
}

/**
 * Den Konsolidierer fragen — mit den Beobachtungen, deren Konzept in DIESEM Pfad benennbar ist.
 *
 * Der Musterkatalog ist zwar nutzerweit, aber ein Konzeptname aus einem anderen Pfad liegt hier
 * nicht vor, und eine nackte UUID im Prompt ist fuer das Modell wertlos. Die uebrigen
 * Beobachtungen gehen deshalb nur in die deterministische Gruppierung ein; sie zaehlen weiter
 * fuer Schwelle und Geltungsbereich, bekommen aber keinen Namen vom Modell.
 */
async function gatherInsights(args: {
  concepts: { id: string; name: string }[]
  observations: Awaited<ReturnType<typeof loadErrorObservations>>
  existingPatterns: string[]
  signal?: AbortSignal
}): Promise<ConsolidatorInsights> {
  const nameById = new Map(args.concepts.map((concept) => [concept.id, concept.name]))

  const namedObservations: ConsolidatorRequest['observations'] = []
  for (const observation of args.observations) {
    const conceptName = nameById.get(observation.conceptId)
    if (!conceptName) {
      continue
    }
    namedObservations.push({
      id: observation.id,
      conceptId: observation.conceptId,
      conceptName,
      kind: observation.kind,
      object: observation.object,
      rawDescription: observation.rawDescription,
      subject: observation.subject,
      occurredAt: observation.occurredAt,
    })
    if (namedObservations.length >= MAX_OBSERVATIONS_FOR_AGENT) {
      break
    }
  }

  /*
   * Ohne Beobachtungen bleibt vom Rollenauftrag nur die Haelfte — aber genau die, um die es beim
   * Zwillingsproblem geht: zwei Konzeptnamen, die dasselbe meinen. Deshalb wird auch dann gefragt.
   */
  return askConsolidator({
    request: {
      observations: namedObservations,
      existingPatternNames: args.existingPatterns,
      concepts: args.concepts.map((concept) => ({ id: concept.id, name: concept.name })),
    },
    concepts: args.concepts,
    ...(args.signal ? { signal: args.signal } : {}),
  }).catch(() => NO_INSIGHTS)
}

/**
 * Muster gruppieren, taufen und fortschreiben.
 *
 * Der Name kommt vom Modell, wenn es einen fuer diese Gruppe geliefert hat, sonst aus `nameFor`.
 * Fuer ein BESTEHENDES Muster gilt weiterhin ausschliesslich der alte Name (I12) — das entscheidet
 * `upsertPattern`, nicht diese Funktion.
 */
async function writePatterns(args: {
  userId: string
  observations: Awaited<ReturnType<typeof loadErrorObservations>>
  existingByName: Map<string, ErrorPattern>
  nameByObservation: Map<string, string>
  nowIso: string
}): Promise<number> {
  const candidates = groupObservations(args.observations.map(toObservation))
  let written = 0

  for (const candidate of candidates) {
    // Der haeufigste Modellname unter den Beobachtungen dieser Gruppe. Die Gruppierung selbst
    // bleibt deterministisch — das Modell darf benennen, nicht einteilen.
    const votes = new Map<string, number>()
    for (const observation of candidate.observations) {
      const suggested = args.nameByObservation.get(observation.id)
      if (suggested) {
        votes.set(suggested, (votes.get(suggested) ?? 0) + 1)
      }
    }
    let preferredName = ''
    let best = 0
    for (const [name, count] of votes) {
      if (count > best) {
        best = count
        preferredName = name
      }
    }

    const existing = preferredName ? (args.existingByName.get(preferredName) ?? null) : null
    const pattern = upsertPattern({
      candidate,
      existing,
      userId: args.userId,
      nowIso: args.nowIso,
      ...(preferredName ? { preferredName } : {}),
    })

    // Der Upsert greift ueber (user_id, name) — ein bereits getauftes Muster wird damit
    // fortgeschrieben, ohne dass sein Name je angefasst wird.
    const patternId = await upsertErrorPattern(pattern)
    await attachObservationsToPattern({
      observationIds: candidate.observations.map((observation) => observation.id),
      patternId,
    })
    written += 1
  }

  return written
}

function toObservation(row: Awaited<ReturnType<typeof loadErrorObservations>>[number]): ErrorObservation {
  return {
    id: row.id,
    conceptId: row.conceptId,
    kind: row.kind,
    object: row.object,
    rawDescription: row.rawDescription,
    subject: row.subject,
    occurredAt: row.occurredAt,
  }
}
