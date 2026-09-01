/**
 * Schicht 6 — Strukturumbau (Kapitel 8.2 bis 8.4).
 *
 * Der Konsolidierer darf sowohl das Lernerbild als auch den Wissensgraphen veraendern. Vier
 * Operationen sind vorgesehen, unterschieden nach UMKEHRBAR gegen ZERSTOERERISCH — nicht nach
 * gross gegen klein:
 *
 *   Voraussetzungskante hinzufuegen/entfernen  umkehrbar        automatisch
 *   Konzept aufspalten                          teilw. umkehrbar automatisch, mit Wertregel (8.3)
 *   Konzepte verschmelzen                       ZERSTOERERISCH   Nutzerbestaetigung (I6)
 *   Fehlermuster befoerdern                     umkehrbar        automatisch
 *
 * Eine Kante laesst sich wieder entfernen. Eine Verschmelzung loescht die Unterscheidung
 * dauerhaft — deshalb I6, deshalb das Protokoll mit Ruecknahme (Kapitel 8.4).
 *
 * Rein — kein DOM, kein I/O. Die Persistenz liegt in `services/`.
 */

import type {
  BrainConcept,
  BrainPrerequisiteEdge,
  LearnerConceptImage,
  StructureLogEntry,
  StructureProposal,
} from '../types'
import { isDestructive } from '../types'
import { assertLogEntryComplete, assertProposalSafe } from '../invariants'
import { confidenceFromEvidence } from '../memory/learnerImage'

// ---------------------------------------------------------------------------
// 8.3 — Wertbehandlung bei Strukturumbau. Grundsatz: konservativ.
// ---------------------------------------------------------------------------

/**
 * Verschmelzen: der NIEDRIGERE Beherrschungswert gewinnt.
 *
 * Auch die Sicherheit und das Evidenzgewicht werden auf den kleineren Wert gesetzt. Das ist
 * nicht bloss Symmetrie: die Sicherheit wird in `learnerImage` aus dem Evidenzgewicht
 * abgeleitet. Wuerden die Gewichte addiert, stuende der verschmolzene Knoten selbstsicherer da
 * als jede seiner Haelften — obwohl die Evidenz der einen Haelfte ueber die andere gar nichts
 * aussagt.
 *
 * Zur Nebenwirkung (Kapitel 8.3): werden 80 Prozent und 30 Prozent zusammengelegt, steht der
 * neue Knoten bei 30 Prozent — der Nutzer sieht Fortschritt verschwinden. Das waere normalerweise
 * der Moment, in dem sich eine App kaputt anfuehlt. Weil Verschmelzungen aber ohnehin eine
 * Bestaetigung erfordern, gibt es genau dort einen Dialog, in dem es erklaert werden kann. Der
 * Verlust ist damit angekuendigt statt mysterioes.
 *
 * Diese beiden Entscheidungen greifen ineinander und sollten nicht einzeln geaendert werden.
 */
export function mergeImages(
  a: LearnerConceptImage,
  b: LearnerConceptImage,
  targetConceptId: string,
): LearnerConceptImage {
  const weaker = a.mastery <= b.mastery ? a : b
  const directEvidenceWeight = Math.min(a.directEvidenceWeight, b.directEvidenceWeight)

  return {
    ...weaker,
    conceptId: targetConceptId,
    mastery: Math.min(a.mastery, b.mastery),
    confidence: confidenceFromEvidence(directEvidenceWeight),
    directEvidenceCount: Math.min(a.directEvidenceCount, b.directEvidenceCount),
    directEvidenceWeight,
    depthEvidence: weaker.depthEvidence,
    depth: weaker.depth,
    propagationConfidencePenalty: Math.max(a.propagationConfidencePenalty, b.propagationConfidencePenalty),
    /*
     * Konservativ auch hier (Kapitel 8.3): gefestigt ist der neue Knoten nur, wenn BEIDE Haelften
     * es waren. Sonst erbte ein nie gefestigtes Konzept ueber die Verschmelzung den Zugang zum
     * Wiederholungsstapel, obwohl es dort nach Kapitel 6.7 nichts zu suchen hat.
     */
    everConsolidated: a.everConsolidated && b.everConsolidated,
    reviewNeeded: true,
    reviewReason: 'Zwei Konzepte wurden zusammengelegt — der Wert ist neu zu belegen.',
    lastSeenAt: a.lastSeenAt && b.lastSeenAt ? (a.lastSeenAt > b.lastSeenAt ? a.lastSeenAt : b.lastSeenAt) : (a.lastSeenAt ?? b.lastSeenAt),
  }
}

/**
 * Rest-Evidenzgewicht nach dem Aufspalten. Erzeugt eine Sicherheit von rund 5 Prozent —
 * „nahezu null", aber nicht exakt null, damit der Zustand vom nie geprueften unterscheidbar bleibt.
 */
export const SPLIT_RESIDUAL_EVIDENCE_WEIGHT = 0.25

/**
 * Aufspalten: beide Haelften erben den urspruenglichen Beherrschungswert, die Sicherheit faellt
 * auf nahezu null.
 *
 * Warum diese Asymmetrie zum Verschmelzen stimmig ist: beim Aufspalten gibt es keinen zweiten
 * Wert, aus dem man den niedrigeren waehlen koennte. Konservativ bedeutet hier: keinen sichtbaren
 * Fortschritt wegnehmen, aber die Einschaetzung als unbelegt markieren.
 *
 * Weil unsichere Werte beim Planer Ueberpruefungsbedarf erzeugen, stellt er beide Haelften von
 * selbst zeitnah auf die Probe. Nach zwei bis drei Aufgaben trennen sich die Werte anhand echter
 * Evidenz. Das nutzt genau die Trennung von Beherrschung und Sicherheit aus Kapitel 4.2 aus.
 */
export function splitImage(
  source: LearnerConceptImage,
  targetConceptIds: [string, string],
): [LearnerConceptImage, LearnerConceptImage] {
  const halve = (conceptId: string): LearnerConceptImage => ({
    ...source,
    conceptId,
    mastery: source.mastery,
    confidence: confidenceFromEvidence(SPLIT_RESIDUAL_EVIDENCE_WEIGHT),
    directEvidenceCount: 0,
    directEvidenceWeight: SPLIT_RESIDUAL_EVIDENCE_WEIGHT,
    depthEvidence: {},
    propagationConfidencePenalty: 0,
    /*
     * Beide Haelften erben die Beherrschung (Kapitel 8.3) — aber nicht die Aussage „war schon
     * einmal gefestigt". Belegt war das GROESSERE Konzept; ob die einzelne Haelfte traegt, weiss
     * niemand. Bis dahin gehoeren beide in den Pfad, nicht in den Stapel.
     */
    everConsolidated: false,
    reviewNeeded: true,
    reviewReason: 'Aus einem groesseren Konzept aufgespalten — der Wert ist noch nicht belegt.',
    coldStart: true,
    lastDirectEvidenceAt: null,
    nextReviewAt: source.lastSeenAt,
  })

  return [halve(targetConceptIds[0]), halve(targetConceptIds[1])]
}

// ---------------------------------------------------------------------------
// Entdeckung — was die Daten zeigen, das der Kartograf nicht gezeichnet hat
// ---------------------------------------------------------------------------

/** Eine Beobachtung, reduziert auf das, was die Entdeckung braucht. */
export type EvidenceSample = {
  conceptId: string
  /** Teilpunkte 0..1. */
  credit: number
  at: string
}

/** Mindestzahl gepaarter Beobachtungen, bevor eine Kante ueberhaupt vorgeschlagen wird. */
export const EDGE_DISCOVERY_MIN_PAIRS = 6

/** Mindestunterschied der Fehlerquoten, damit die Kante als entdeckt gilt. */
export const EDGE_DISCOVERY_MIN_LIFT = 0.4

export const WEAK_CREDIT_THRESHOLD = 0.5

export type EdgeCandidate = {
  fromConceptId: string
  toConceptId: string
  /** Unterschied der Fehlerquoten von B, je nachdem ob A zuletzt sass oder nicht. */
  lift: number
  pairedSamples: number
  failureRateWhenWeak: number
  failureRateWhenStrong: number
}

/**
 * Neue Voraussetzungskanten aus den Daten entdecken (Kapitel 8.2, der staerkste Fall).
 *
 * „Ueber Wochen wird sichtbar, dass niemand Konzept B schafft, der A nicht hat. Der Kartograf
 *  hat diese Kante nie gezeichnet, die Daten zeigen sie trotzdem."
 *
 * Verfahren: fuer jedes Paar (A, B) wird jede B-Beobachtung danach eingeteilt, ob die letzte
 * A-Beobachtung DAVOR gelungen war. Weichen die Fehlerquoten der beiden Gruppen deutlich
 * voneinander ab, ist A eine Voraussetzung von B.
 *
 * Der zeitliche Bezug ist wesentlich: „A sass, als B gefragt wurde" ist etwas anderes als
 * „A sitzt heute". Ohne diese Reihenfolge waere jede Korrelation zwischen zwei starken
 * Konzepten eine Kante.
 */
export function discoverEdges(args: {
  samples: EvidenceSample[]
  existingEdges: BrainPrerequisiteEdge[]
  conceptIds: string[]
}): EdgeCandidate[] {
  const { samples, existingEdges, conceptIds } = args

  const byConcept = new Map<string, EvidenceSample[]>()
  for (const sample of samples) {
    const bucket = byConcept.get(sample.conceptId)
    if (bucket) {
      bucket.push(sample)
    } else {
      byConcept.set(sample.conceptId, [sample])
    }
  }
  for (const bucket of byConcept.values()) {
    bucket.sort((a, b) => (a.at < b.at ? -1 : 1))
  }

  const existing = new Set(existingEdges.map((edge) => `${edge.fromConceptId}->${edge.toConceptId}`))
  const candidates: EdgeCandidate[] = []

  for (const fromId of conceptIds) {
    const fromSamples = byConcept.get(fromId) ?? []
    if (fromSamples.length === 0) {
      continue
    }

    for (const toId of conceptIds) {
      if (fromId === toId || existing.has(`${fromId}->${toId}`)) {
        continue
      }
      const toSamples = byConcept.get(toId) ?? []
      if (toSamples.length < EDGE_DISCOVERY_MIN_PAIRS) {
        continue
      }

      let weakTotal = 0
      let weakFailures = 0
      let strongTotal = 0
      let strongFailures = 0

      for (const toSample of toSamples) {
        // Letzte A-Beobachtung strikt VOR dieser B-Beobachtung.
        let previous: EvidenceSample | null = null
        for (const fromSample of fromSamples) {
          if (fromSample.at < toSample.at) {
            previous = fromSample
          } else {
            break
          }
        }
        if (!previous) {
          continue
        }

        const failed = toSample.credit < WEAK_CREDIT_THRESHOLD
        if (previous.credit < WEAK_CREDIT_THRESHOLD) {
          weakTotal += 1
          weakFailures += failed ? 1 : 0
        } else {
          strongTotal += 1
          strongFailures += failed ? 1 : 0
        }
      }

      const paired = weakTotal + strongTotal
      if (paired < EDGE_DISCOVERY_MIN_PAIRS || weakTotal === 0 || strongTotal === 0) {
        continue
      }

      const failureRateWhenWeak = weakFailures / weakTotal
      const failureRateWhenStrong = strongFailures / strongTotal
      const lift = failureRateWhenWeak - failureRateWhenStrong

      if (lift >= EDGE_DISCOVERY_MIN_LIFT) {
        candidates.push({
          fromConceptId: fromId,
          toConceptId: toId,
          lift,
          pairedSamples: paired,
          failureRateWhenWeak,
          failureRateWhenStrong,
        })
      }
    }
  }

  return candidates.sort((a, b) => (b.lift !== a.lift ? b.lift - a.lift : a.toConceptId < b.toConceptId ? -1 : 1))
}

/** Mindestzahl an Beobachtungen, bevor ein Konzept auf Zweiteilung geprueft wird. */
export const SPLIT_MIN_SAMPLES = 6
/** Mindestabstand zwischen den beiden Gruppen, damit sie als getrennt gelten. */
export const SPLIT_MIN_GAP = 0.45

export type SplitCandidate = {
  conceptId: string
  lowGroupSize: number
  highGroupSize: number
  gap: number
}

/**
 * Zu grobe Konzepte finden (Kapitel 8.2, „Aufspalten").
 *
 * „Erkennbar daran, dass die Leistungsdaten eines Konzepts in zwei Gruppen zerfallen."
 *
 * Umgesetzt als Suche nach der groessten Luecke in den sortierten Teilpunkten. Zerfallen die
 * Werte in eine Gruppe nahe 0 und eine nahe 1, misst der Knoten offenbar zwei verschiedene
 * Dinge — und ein Mittelwert dazwischen beschreibt keines davon.
 */
export function findSplitCandidates(args: { samples: EvidenceSample[]; conceptIds: string[] }): SplitCandidate[] {
  const out: SplitCandidate[] = []

  for (const conceptId of args.conceptIds) {
    const credits = args.samples
      .filter((sample) => sample.conceptId === conceptId)
      .map((sample) => sample.credit)
      .sort((a, b) => a - b)

    if (credits.length < SPLIT_MIN_SAMPLES) {
      continue
    }

    let bestGap = 0
    let splitIndex = -1
    for (let i = 1; i < credits.length; i += 1) {
      const gap = credits[i] - credits[i - 1]
      if (gap > bestGap) {
        bestGap = gap
        splitIndex = i
      }
    }

    if (bestGap < SPLIT_MIN_GAP || splitIndex < 0) {
      continue
    }

    const lowGroupSize = splitIndex
    const highGroupSize = credits.length - splitIndex
    // Beide Gruppen brauchen Substanz — ein einzelner Ausreisser ist keine zweite Gruppe.
    if (lowGroupSize < 2 || highGroupSize < 2) {
      continue
    }

    out.push({ conceptId, lowGroupSize, highGroupSize, gap: bestGap })
  }

  return out.sort((a, b) => b.gap - a.gap)
}

/**
 * Doppelungen finden (Kapitel 8.2, „Zusammenlegen").
 *
 * Doppelungen entstehen zwangslaeufig, wenn Material aus verschiedenen Quellen eingelesen wurde:
 * dasselbe Konzept heisst im Skript anders als in den Folien.
 */
export const MERGE_NAME_SIMILARITY = 0.6

export type MergeCandidate = {
  aConceptId: string
  bConceptId: string
  similarity: number
  aName: string
  bName: string
}

function nameTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2),
  )
}

export function findMergeCandidates(concepts: BrainConcept[]): MergeCandidate[] {
  const out: MergeCandidate[] = []

  for (let i = 0; i < concepts.length; i += 1) {
    for (let j = i + 1; j < concepts.length; j += 1) {
      const a = concepts[i]
      const b = concepts[j]
      const tokensA = nameTokens(a.name)
      const tokensB = nameTokens(b.name)
      if (tokensA.size === 0 || tokensB.size === 0) {
        continue
      }

      let intersection = 0
      for (const token of tokensA) {
        if (tokensB.has(token)) {
          intersection += 1
        }
      }
      const similarity = intersection / (tokensA.size + tokensB.size - intersection)

      if (similarity >= MERGE_NAME_SIMILARITY) {
        out.push({ aConceptId: a.id, bConceptId: b.id, similarity, aName: a.name, bName: b.name })
      }
    }
  }

  return out.sort((a, b) => b.similarity - a.similarity)
}

// ---------------------------------------------------------------------------
// Vorschlaege und Protokoll
// ---------------------------------------------------------------------------

/** Wie lange ein Vorschlag offen bleibt, bevor er stillschweigend verfaellt. */
export const PROPOSAL_TTL_DAYS = 21

function expiryFrom(nowIso: string, days = PROPOSAL_TTL_DAYS): string {
  return new Date(new Date(nowIso).getTime() + days * 86_400_000).toISOString()
}

/**
 * Vorschlag zum Zusammenlegen zweier Konzepte.
 *
 * Die Frage wird in der SPRACHE DES NUTZERS gestellt, nicht in Graphensprache (Kapitel 8.2):
 * „Meinen ‚Subnetzmaske' und ‚Netzmaske berechnen' dasselbe?" ist keine Fachfrage, sondern eine
 * ueber sein eigenes Material — und damit beantwortbar.
 */
export function proposeMerge(args: {
  userId: string
  pathId: string
  candidate: MergeCandidate
  nowIso: string
}): StructureProposal {
  const proposal: StructureProposal = {
    userId: args.userId,
    pathId: args.pathId,
    operation: 'mergeConcepts',
    payload: { keepConceptId: args.candidate.aConceptId, mergeConceptId: args.candidate.bConceptId },
    evidence: { nameSimilarity: Number(args.candidate.similarity.toFixed(3)) },
    question: `Meinen „${args.candidate.aName}" und „${args.candidate.bName}" dasselbe?`,
    rationale:
      'Beide tauchen in deinem Material auf und beschreiben offenbar dieselbe Sache. ' +
      'Wenn ich sie zusammenlege, gilt der vorsichtigere der beiden Werte.',
    requiresConfirmation: true,
    status: 'pending',
    // I7: niemals mitten im Lernen.
    surfaceContext: 'mapReview',
    expiresAt: expiryFrom(args.nowIso),
  }
  assertProposalSafe(proposal)
  return proposal
}

/**
 * Vorschlag zum Zusammenlegen, so wie der Konsolidierer ihn formuliert hat.
 *
 * Der Unterschied zu `proposeMerge` ist nicht technisch, sondern die Herkunft der Behauptung, und
 * genau die steht in `evidence`:
 *  - `proposeMerge` stuetzt sich auf Wortueberlappung — nachrechenbar, aber blind fuer zwei Namen
 *    ohne gemeinsames Wort.
 *  - Hier hat ein Modell geurteilt, dass zwei Begriffe dasselbe MEINEN. Das findet mehr und laesst
 *    sich nicht nachrechnen; deshalb wird die Frage vom Modell selbst formuliert (es kennt den
 *    Grund) und der Nutzer entscheidet wie bei jeder Verschmelzung (I6).
 *
 * Die IDs sind vom Aufrufer bereits gegen den Graphen geprueft — eine halluzinierte ID darf hier
 * nicht mehr ankommen.
 */
export function proposeMergeFromInsight(args: {
  userId: string
  pathId: string
  keepConceptId: string
  mergeConceptId: string
  question: string
  rationale: string
  nowIso: string
}): StructureProposal {
  const proposal: StructureProposal = {
    userId: args.userId,
    pathId: args.pathId,
    operation: 'mergeConcepts',
    payload: { keepConceptId: args.keepConceptId, mergeConceptId: args.mergeConceptId },
    evidence: { source: 'konsolidierer' },
    question: args.question,
    rationale:
      args.rationale.trim() ||
      'Beide beschreiben offenbar dieselbe Sache. Wenn ich sie zusammenlege, gilt der vorsichtigere ' +
        'der beiden Werte.',
    requiresConfirmation: true,
    status: 'pending',
    surfaceContext: 'mapReview',
    expiresAt: expiryFrom(args.nowIso),
  }
  assertProposalSafe(proposal)
  return proposal
}

/** Vorschlag fuer eine entdeckte Voraussetzungskante — umkehrbar, laeuft automatisch. */
export function proposeEdge(args: {
  userId: string
  pathId: string
  candidate: EdgeCandidate
  nowIso: string
}): StructureProposal {
  const proposal: StructureProposal = {
    userId: args.userId,
    pathId: args.pathId,
    operation: 'addEdge',
    payload: { fromConceptId: args.candidate.fromConceptId, toConceptId: args.candidate.toConceptId },
    evidence: {
      lift: Number(args.candidate.lift.toFixed(3)),
      pairedSamples: args.candidate.pairedSamples,
      failureRateWhenWeak: Number(args.candidate.failureRateWhenWeak.toFixed(3)),
      failureRateWhenStrong: Number(args.candidate.failureRateWhenStrong.toFixed(3)),
    },
    question: '',
    rationale:
      'Deine Ergebnisse zeigen, dass das zweite Konzept regelmaessig scheitert, solange das erste ' +
      'nicht sitzt. Diese Abhaengigkeit stand bisher nicht auf der Karte.',
    requiresConfirmation: false,
    status: 'pending',
    surfaceContext: 'mapReview',
    expiresAt: expiryFrom(args.nowIso),
  }
  assertProposalSafe(proposal)
  return proposal
}

/** Vorschlag zum Aufspalten — teilweise umkehrbar, laeuft automatisch mit Wertregel 8.3. */
export function proposeSplit(args: {
  userId: string
  pathId: string
  candidate: SplitCandidate
  conceptName: string
  nowIso: string
}): StructureProposal {
  const proposal: StructureProposal = {
    userId: args.userId,
    pathId: args.pathId,
    operation: 'splitConcept',
    payload: { conceptId: args.candidate.conceptId },
    evidence: {
      lowGroupSize: args.candidate.lowGroupSize,
      highGroupSize: args.candidate.highGroupSize,
      gap: Number(args.candidate.gap.toFixed(3)),
    },
    question: '',
    rationale:
      `Deine Ergebnisse zu „${args.conceptName}" zerfallen in zwei klar getrennte Gruppen. ` +
      'Das deutet darauf hin, dass hier zwei verschiedene Faehigkeiten unter einem Namen stehen.',
    requiresConfirmation: false,
    status: 'pending',
    surfaceContext: 'mapReview',
    expiresAt: expiryFrom(args.nowIso),
  }
  assertProposalSafe(proposal)
  return proposal
}

/**
 * Einen Protokolleintrag bauen (Kapitel 8.4) — inklusive der Anleitung zur Ruecknahme.
 *
 * Der Ruecknahme-Payload ist Pflicht und wird geprueft. Ohne ihn waere das Protokoll da, aber
 * wertlos: das System koennte sagen, WAS es getan hat, aber nicht, wie man es zurueckdreht — und
 * damit waere der Fehler weder fuer den Betreiber noch fuer den Nutzer diagnostizierbar.
 */
export function buildLogEntry(args: {
  userId: string
  pathId: string
  proposalId: string | null
  operation: StructureProposal['operation']
  payload: Record<string, unknown>
  evidence: Record<string, unknown>
  undoPayload: Record<string, unknown>
  nowIso: string
}): StructureLogEntry {
  const entry: StructureLogEntry = {
    userId: args.userId,
    pathId: args.pathId,
    proposalId: args.proposalId,
    operation: args.operation,
    payload: args.payload,
    evidence: args.evidence,
    undoPayload: args.undoPayload,
    destructive: isDestructive(args.operation),
    appliedAt: args.nowIso,
    revertedAt: null,
  }
  assertLogEntryComplete(entry)
  return entry
}

/**
 * Ruecknahme-Payload fuer eine Verschmelzung.
 *
 * Muss die beiden urspruenglichen Lernerbilder VOLLSTAENDIG enthalten. Nach dem Zusammenlegen
 * sind sie sonst nicht mehr rekonstruierbar — das ist ja gerade der Grund, warum eine
 * Verschmelzung als zerstoererisch gilt.
 */
export function undoPayloadForMerge(args: {
  keptConceptId: string
  mergedConceptId: string
  keptImageBefore: LearnerConceptImage
  mergedImageBefore: LearnerConceptImage
  mergedConceptSnapshot: BrainConcept
  reattachedEdges: BrainPrerequisiteEdge[]
}): Record<string, unknown> {
  return {
    kind: 'restoreMerge',
    keptConceptId: args.keptConceptId,
    mergedConceptId: args.mergedConceptId,
    keptImageBefore: args.keptImageBefore,
    mergedImageBefore: args.mergedImageBefore,
    mergedConceptSnapshot: args.mergedConceptSnapshot,
    reattachedEdges: args.reattachedEdges,
  }
}

/** Ruecknahme-Payload fuer eine hinzugefuegte Kante: sie wieder entfernen. */
export function undoPayloadForAddEdge(fromConceptId: string, toConceptId: string): Record<string, unknown> {
  return { kind: 'removeEdge', fromConceptId, toConceptId }
}

/** Ruecknahme-Payload fuer eine Aufspaltung: die beiden Haelften wieder zusammenfuehren. */
export function undoPayloadForSplit(args: {
  sourceConceptId: string
  sourceImageBefore: LearnerConceptImage
  createdConceptIds: string[]
}): Record<string, unknown> {
  return {
    kind: 'restoreSplit',
    sourceConceptId: args.sourceConceptId,
    sourceImageBefore: args.sourceImageBefore,
    createdConceptIds: args.createdConceptIds,
  }
}
