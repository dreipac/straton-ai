/**
 * Schicht 3 — Wahrnehmung, Kompositionswurzel (Kapitel 5.1).
 *
 * Hier laeuft eine Beobachtung vollstaendig durch: Bewertung rein, aktualisiertes Lernerbild,
 * Propagationsabschlaege und ein protokollierbares Evidenzereignis raus.
 *
 * Die beiden zugelassenen Signalquellen werden hier unterschiedlich behandelt — das ist der
 * Kern von Kapitel 5.1 und der Ort, an dem die Invarianten I1 und I2 durchgesetzt werden.
 *
 * Rein — kein DOM, kein I/O. Die Persistenz liegt in `services/`.
 */

import type {
  ApplicationDepth,
  EvidenceEvent,
  EvidenceSource,
  ExaminerVerdict,
  BrainPrerequisiteEdge,
  LearnerConceptImage,
} from '../types'
import { depthRank } from '../types'
import { assertMasteryChangeAllowed } from '../invariants'
import { applyDirectEvidence, effectiveConfidence, effectiveMastery } from '../memory/learnerImage'
import {
  applyPropagation,
  propagateDoubt,
  shouldPropagate,
  type ConfidenceAdjustment,
} from '../memory/propagation'
import { calibrateConfidence, reactionFor } from './examiner'

/**
 * Grundgewicht je Signalquelle (Kapitel 8.1: „Zwanzig Chatnachrichten wiegen weniger als fuenf
 * bewertete Aufgaben").
 *
 * Das Verhaeltnis ist bewusst deutlich: 20 Chatsignale wiegen zusammen 1.0 und damit genauso
 * viel wie EINE bewertete Aufgabe. Reines Zaehlen wuerde Vielrederei zum Ausloeser der
 * Konsolidierung machen, obwohl sie nichts Neues enthaelt.
 */
export const EVIDENCE_BASE_WEIGHT: Record<EvidenceSource, number> = {
  gradedTask: 1,
  chat: 0.05,
}

/**
 * Tiefere Anwendungstiefe wiegt mehr: eine geloeste Transferaufgabe sagt mehr ueber die
 * Beherrschung aus als ein wiedererkannter Begriff.
 */
export const DEPTH_WEIGHT_FACTOR: Record<ApplicationDepth, number> = {
  recognize: 0.8,
  apply: 1,
  transfer: 1.3,
}

/**
 * Gewicht einer einzelnen Beobachtung.
 *
 * Die Zuversicht des Pruefers geht multiplikativ ein: eine Bewertung, die der Pruefer selbst
 * kaum glaubt, wiegt entsprechend wenig (Kapitel 5.3).
 */
export function evidenceWeightFor(args: {
  source: EvidenceSource
  depth: ApplicationDepth
  examinerConfidence: number
}): number {
  const base = EVIDENCE_BASE_WEIGHT[args.source]
  const depthFactor = DEPTH_WEIGHT_FACTOR[args.depth]
  const confidence = Math.max(0, Math.min(1, args.examinerConfidence))
  return base * depthFactor * confidence
}

export type GradedAnswerInput = {
  userId: string
  pathId: string
  conceptId: string
  /** Lernerbild des betroffenen Konzepts; fehlt es, legt der Aufrufer es mit `emptyImage` an. */
  image: LearnerConceptImage
  /** Lernerbilder aller Konzepte des Pfads — Ziel der Propagation. */
  images: Map<string, LearnerConceptImage>
  edges: BrainPrerequisiteEdge[]
  conceptNames?: Map<string, string>
  verdict: ExaminerVerdict
  depth: ApplicationDepth
  format: string
  /** 1..5 */
  difficulty: number
  /** Steht ein Eskalationsmodell fuer den Pruefer bereit? Steuert die Reaktion bei Zweifel. */
  escalationAvailable: boolean
  nowIso: string
}

export type PerceptionResult = {
  /** Der aktualisierte Zustand des bewerteten Konzepts. */
  updated: LearnerConceptImage
  /** Zustaende der Nachbarn, deren SICHERHEIT die Propagation gesenkt hat (I3). */
  propagated: LearnerConceptImage[]
  adjustments: ConfidenceAdjustment[]
  /** Das protokollierbare Ereignis. */
  event: EvidenceEvent
  /** Fall an ein staerkeres Modell weiterreichen (Kapitel 5.3). */
  escalate: boolean
  /** Dieselbe Sache spaeter anders verpackt erneut fragen. */
  reask: boolean
}

/**
 * Eine bewertete Aufgabe verarbeiten — der einzige Pfad, auf dem die Beherrschung steigen kann
 * (Invariante I1).
 *
 * Reihenfolge und ihre Gruende:
 *  1. Die Zuversicht wird kalibriert: unschluessige Teilpunkte senken sie, bevor sie irgendetwas
 *     bewegt.
 *  2. Die Reaktion wird bestimmt. Bei Eskalation ist das Gewicht 0 — das Lernerbild bleibt
 *     unberuehrt, bis das staerkere Modell geantwortet hat. Eine halbe Bewegung auf einen
 *     Zweifel hin waere schlimmer als keine.
 *  3. Erst dann laeuft das Lernerbild-Update.
 *  4. Propagation nur bei einem glaubwuerdigen Fehlschlag, und ausschliesslich auf die Sicherheit.
 */
export function perceiveGradedAnswer(input: GradedAnswerInput): PerceptionResult {
  const verdict = calibrateConfidence(input.verdict)
  const reaction = reactionFor(verdict, { escalationAvailable: input.escalationAvailable })

  const evidenceWeight =
    evidenceWeightFor({
      source: 'gradedTask',
      depth: input.depth,
      examinerConfidence: verdict.confidence,
    }) * reaction.weightFactor

  const transition = applyDirectEvidence({
    image: input.image,
    verdict,
    depth: input.depth,
    difficulty: input.difficulty,
    evidenceWeight,
    nowIso: input.nowIso,
  })

  assertMasteryChangeAllowed('gradedTask', transition.masteryDelta)

  let adjustments: ConfidenceAdjustment[] = []
  let propagated: LearnerConceptImage[] = []
  if (shouldPropagate(verdict.credit, verdict.confidence)) {
    adjustments = propagateDoubt({
      originConceptId: input.conceptId,
      edges: input.edges,
      conceptNames: input.conceptNames,
      // Ein knapper Fehlschlag saet weniger Zweifel als ein vollstaendiger.
      strength: (1 - verdict.credit) * verdict.confidence,
    })
    propagated = applyPropagation(input.images, adjustments)
  }

  const event: EvidenceEvent = {
    userId: input.userId,
    pathId: input.pathId,
    conceptId: input.conceptId,
    source: 'gradedTask',
    verdict,
    depth: input.depth,
    format: input.format,
    difficulty: input.difficulty,
    evidenceWeight,
    escalated: reaction.escalate,
    masteryDelta: transition.masteryDelta,
    confidenceDelta: transition.confidenceDelta,
    occurredAt: input.nowIso,
  }

  return {
    updated: transition.next,
    propagated,
    adjustments,
    event,
    escalate: reaction.escalate,
    reask: reaction.reask,
  }
}

/**
 * Faellige Konzepte (Wiederholung) zum Zeitpunkt `nowIso`.
 *
 * Faellig ist ein Konzept, dessen `nextReviewAt` erreicht ist ODER dessen verfallene
 * Beherrschung unter die Schwelle gerutscht ist. Der zweite Fall faengt die Konzepte ab, die
 * lange kein Update bekamen und deren Faelligkeitsdatum daher aus einer alten, inzwischen
 * ueberholten Einschaetzung stammt.
 */
export function dueConceptIds(
  images: Iterable<LearnerConceptImage>,
  nowIso: string,
  masteryThreshold = 0.6,
): string[] {
  const now = new Date(nowIso).getTime()
  const due: { conceptId: string; mastery: number }[] = []

  for (const image of images) {
    if (image.directEvidenceCount === 0) {
      continue
    }
    const mastery = effectiveMastery(image, nowIso)
    const dueByDate = image.nextReviewAt != null && new Date(image.nextReviewAt).getTime() <= now
    if (dueByDate || mastery < masteryThreshold) {
      due.push({ conceptId: image.conceptId, mastery })
    }
  }

  return due.sort((a, b) => a.mastery - b.mastery).map((entry) => entry.conceptId)
}

/**
 * Konzepte, deren Einschaetzung unbelegt ist: hohe Beherrschung bei niedriger Sicherheit.
 *
 * Genau der Fall, den die Trennung der beiden Werte sichtbar macht — jemand mit einer einzigen
 * richtigen Antwort steht sonst gleichauf mit jemandem, der zwanzig geloest hat.
 */
export function unverifiedConceptIds(
  images: Iterable<LearnerConceptImage>,
  nowIso: string,
  confidenceThreshold = 0.4,
): string[] {
  const out: string[] = []
  for (const image of images) {
    if (effectiveConfidence(image, nowIso) < confidenceThreshold && effectiveMastery(image, nowIso) >= 0.5) {
      out.push(image.conceptId)
    }
  }
  return out
}

/** Naechste sinnvolle Anwendungstiefe fuer ein Konzept: eine Stufe ueber der belegten. */
export function nextDepthFor(image: LearnerConceptImage): ApplicationDepth {
  const order: ApplicationDepth[] = ['recognize', 'apply', 'transfer']
  const currentRank = depthRank(image.depth)
  // Erst festigen, dann steigern: unter 0.7 Beherrschung bleibt die Stufe, wo sie ist.
  if (image.mastery < 0.7) {
    return image.depth
  }
  return order[Math.min(order.length - 1, currentRank + 1)]
}
