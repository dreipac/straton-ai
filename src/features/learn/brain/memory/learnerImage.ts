/**
 * Schicht 2 — Lernerbild (Kapitel 4.2).
 *
 * Fuehrt die drei Werte pro Konzept: Beherrschung, Sicherheit, Anwendungstiefe.
 *
 * Warum die Sicherheit ein eigener Wert ist und nicht aus der Beherrschung ableitbar:
 * ohne sie kann das System nicht zwischen „du kannst das nicht" und „ich weiss es noch nicht"
 * unterscheiden. Jemand mit einer einzigen richtigen Antwort und jemand mit zwanzig staenden
 * beide bei 100 Prozent, obwohl das Gehirn im ersten Fall fast nichts weiss.
 *
 * Rein — kein DOM, kein I/O. `nowIso` wird hereingereicht, damit alles deterministisch testbar ist.
 *
 * Die probabilistische Kernmathematik (BKT) und das Verfallsmodell werden aus der bestehenden
 * `engine/`-Bibliothek wiederverwendet. Das Gehirn baut darauf auf, statt sie zu duplizieren —
 * neu ist hier, WAS sich bewegen darf und wie stark, nicht die Bayes-Rechnung selbst.
 */

import { updateMastery, seedPrior, DEFAULT_BKT_PARAMS } from '../../engine/bkt'
import { applyDecay, daysBetween, MASTERY_FLOOR } from '../../engine/forgetting'
import type { ApplicationDepth, DepthEvidence, ExaminerVerdict, LearnerConceptImage } from '../types'
import { DEPTH_ORDER, depthRank } from '../types'

const MS_PER_DAY = 86_400_000

/**
 * Wie stark die Beherrschung auf eine einzelne Beobachtung reagiert.
 *
 * Kapitel 9: „Waehrend der Kaltstartphase darf sich die Beherrschung in groesseren Schritten
 * bewegen als spaeter. […] Dasselbe Prinzip wie beim Menschen: der erste Eindruck praegt stark,
 * der hundertste kaum noch."
 *
 * Umgesetzt als Reaktionsfaktor, der mit dem aufgelaufenen Evidenzgewicht faellt — kein
 * Sonderfall „Kaltstart an/aus", sondern ein stetiger Uebergang. `coldStart` bleibt trotzdem als
 * Flag im Lernerbild, weil die Oberflaeche den Zustand erklaeren muss (Kapitel 9, Sichtbarkeit).
 */
export const MAX_RESPONSIVENESS = 1
export const MIN_RESPONSIVENESS = 0.35
/** Evidenzgewicht, bei dem die Reaktionsstaerke auf die Haelfte des Spielraums gefallen ist. */
export const RESPONSIVENESS_HALF_LIFE = 6

/** Ab diesem Evidenzgewicht gilt die Kaltstartphase als beendet (Kapitel 9: „fuenf bis sieben Aufgaben"). */
export const COLD_START_EVIDENCE_WEIGHT = 6

/**
 * Ab dieser Beherrschung gilt ein Konzept als gefestigt (Kapitel 6.7).
 *
 * Derselbe Wert, ab dem `nextDepthFor` eine Stufe hoeher geht — beide meinen dasselbe: das
 * Konzept traegt. Steht hier und nicht in `planner/responsibility.ts`, damit das Lernerbild die
 * Schwelle selbst kennt und keine Abhaengigkeit auf die Exekutive entsteht.
 */
export const CONSOLIDATED_MASTERY = 0.7

/** Evidenzgewicht, ab dem die Sicherheit rund 63 Prozent erreicht (1 - 1/e). */
export const CONFIDENCE_SCALE = 5

/** Auch eine Einschaetzung altert: ohne neue Evidenz wird sie langsam weniger belastbar. */
export const CONFIDENCE_DECAY_PER_DAY = 0.015

/** Mindestversuche je Anwendungstiefe, bevor die Stufe als belegt gilt. */
export const DEPTH_MIN_ATTEMPTS = 2
/** Trefferquote, ab der eine Anwendungstiefe als erreicht gilt. */
export const DEPTH_SUCCESS_RATIO = 0.6

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** Ein leeres Lernerbild fuer ein noch nie beruehrtes Konzept. */
export function emptyImage(conceptId: string, difficulty: number): LearnerConceptImage {
  return {
    conceptId,
    // Der kalte Seed ist eine Vermutung aus der Schwierigkeit, kein Wissen — deshalb Sicherheit 0.
    mastery: seedPrior(difficulty),
    confidence: 0,
    depth: 'recognize',
    depthEvidence: {},
    directEvidenceCount: 0,
    directEvidenceWeight: 0,
    propagationConfidencePenalty: 0,
    reviewNeeded: false,
    reviewReason: '',
    decayRate: 0.08,
    coldStart: true,
    everConsolidated: false,
    lastDirectEvidenceAt: null,
    lastSeenAt: null,
    nextReviewAt: null,
  }
}

/**
 * Reaktionsstaerke bei gegebenem Evidenzgewicht. Faellt monoton von MAX auf MIN.
 */
export function responsivenessFor(directEvidenceWeight: number): number {
  const weight = Math.max(0, directEvidenceWeight)
  return MIN_RESPONSIVENESS + (MAX_RESPONSIVENESS - MIN_RESPONSIVENESS) / (1 + weight / RESPONSIVENESS_HALF_LIFE)
}

/**
 * Sicherheit aus dem aufgelaufenen direkten Evidenzgewicht — saettigend.
 *
 * Bewusst nur aus DIREKTER Evidenz: Chat und Propagation duerfen die Sicherheit senken
 * (siehe `propagation.ts`, `chatSignals.ts`), aber nie heben. Sonst waere Vielrederei ein Weg,
 * das Gehirn selbstsicher zu machen.
 */
export function confidenceFromEvidence(directEvidenceWeight: number): number {
  return clamp01(1 - Math.exp(-Math.max(0, directEvidenceWeight) / CONFIDENCE_SCALE))
}

/** Verfallene Beherrschung zum Zeitpunkt `nowIso`. */
export function effectiveMastery(image: LearnerConceptImage, nowIso: string): number {
  if (!image.lastSeenAt) {
    return image.mastery
  }
  return applyDecay(image.mastery, image.decayRate, daysBetween(image.lastSeenAt, nowIso))
}

/**
 * Effektive Sicherheit zum Zeitpunkt `nowIso`: Grundwert aus Evidenz, linear gealtert,
 * abzueglich des Propagationsanteils (Invariante I3 — der Anteil sitzt separat im Zustand).
 */
export function effectiveConfidence(image: LearnerConceptImage, nowIso: string): number {
  const base = image.confidence
  const aged = image.lastDirectEvidenceAt
    ? base - CONFIDENCE_DECAY_PER_DAY * daysBetween(image.lastDirectEvidenceAt, nowIso)
    : base
  return clamp01(aged - image.propagationConfidencePenalty)
}

/**
 * Naechstes Wiederholungsintervall in Tagen.
 *
 * Haengt an beiden Werten: hohe Beherrschung allein reicht nicht, wenn die Einschaetzung auf
 * einer einzigen Antwort beruht. Genau das ist der Grund, warum die Sicherheit ein eigener
 * Wert ist — sie steuert, ob das Gehirn nachfragt oder in Ruhe laesst.
 */
export function nextReviewIntervalDays(mastery: number, confidence: number): number {
  const base = mastery < 0.3 ? 1 : mastery < 0.5 ? 2 : mastery < 0.7 ? 4 : mastery < 0.85 ? 8 : 15
  // Bei Sicherheit 0 wird das Intervall halbiert, bei Sicherheit 1 bleibt es voll.
  const scaled = base * (0.5 + 0.5 * clamp01(confidence))
  return Math.max(1, Math.round(scaled))
}

function isoPlusDays(nowIso: string, days: number): string {
  const base = new Date(nowIso).getTime()
  if (!Number.isFinite(base)) {
    return nowIso
  }
  return new Date(base + days * MS_PER_DAY).toISOString()
}

/** Evidenzzaehler einer Anwendungstiefe fortschreiben. */
function bumpDepthEvidence(evidence: DepthEvidence, depth: ApplicationDepth, correct: boolean): DepthEvidence {
  const current = evidence[depth] ?? { attempts: 0, correct: 0 }
  return {
    ...evidence,
    [depth]: { attempts: current.attempts + 1, correct: current.correct + (correct ? 1 : 0) },
  }
}

/**
 * Hoechste belegte Anwendungstiefe.
 *
 * „Belegt" heisst: genug Versuche auf dieser Stufe UND eine Trefferquote ueber der Schwelle.
 * Eine einzelne gelungene Transferaufgabe macht niemanden zum Uebertrager — das waere genau
 * die geschoente Einschaetzung, die die Sicherheit verhindern soll.
 */
export function resolveDepth(evidence: DepthEvidence): ApplicationDepth {
  let best: ApplicationDepth = 'recognize'
  for (const depth of DEPTH_ORDER) {
    const entry = evidence[depth]
    if (!entry || entry.attempts < DEPTH_MIN_ATTEMPTS) {
      continue
    }
    if (entry.correct / entry.attempts >= DEPTH_SUCCESS_RATIO && depthRank(depth) >= depthRank(best)) {
      best = depth
    }
  }
  return best
}

export type DirectEvidenceInput = {
  image: LearnerConceptImage
  verdict: ExaminerVerdict
  depth: ApplicationDepth
  /** 1..5 */
  difficulty: number
  /** Gewicht dieser Beobachtung (siehe perception/evidence.ts). */
  evidenceWeight: number
  nowIso: string
}

export type ImageTransition = {
  next: LearnerConceptImage
  masteryDelta: number
  confidenceDelta: number
}

/**
 * Eine bewertete Aufgabe auf das Lernerbild anwenden — der einzige Weg, auf dem die
 * Beherrschung steigen darf (Invariante I1).
 *
 * Ablauf:
 *  1. Ausgangswert ist die VERFALLENE bisherige Beherrschung, nicht der gespeicherte Wert.
 *     Sonst wuerde ein Konzept, das drei Wochen lag, von seinem alten Hoch aus weiterrechnen.
 *  2. BKT liefert den Posterior aus Teilpunkten und Schwierigkeit.
 *  3. Der Schritt dorthin wird gedaempft: mit der Reaktionsstaerke (viel Evidenz -> kleine
 *     Schritte) und mit der Zuversicht des Pruefers (Kapitel 5.3 — niedrige Zuversicht bewegt
 *     das Lernerbild nur schwach).
 *  4. Sicherheit, Anwendungstiefe und Faelligkeit werden fortgeschrieben.
 *  5. Der Propagationsabschlag auf die Sicherheit wird abgebaut: es liegt jetzt echte Evidenz
 *     vor, der Zweifel hat sich erledigt.
 */
export function applyDirectEvidence(input: DirectEvidenceInput): ImageTransition {
  const { image, verdict, depth, difficulty, evidenceWeight, nowIso } = input

  const priorMastery = effectiveMastery(image, nowIso)
  const priorConfidence = effectiveConfidence(image, nowIso)

  const correct = verdict.credit >= 0.5
  const posterior = updateMastery(
    priorMastery,
    { correct, difficulty, credit: clamp01(verdict.credit) },
    DEFAULT_BKT_PARAMS,
  )

  const responsiveness = responsivenessFor(image.directEvidenceWeight) * clamp01(verdict.confidence)
  const mastery = clamp01(priorMastery + (posterior - priorMastery) * responsiveness)

  const directEvidenceWeight = image.directEvidenceWeight + Math.max(0, evidenceWeight)
  const confidence = confidenceFromEvidence(directEvidenceWeight)

  const depthEvidence = bumpDepthEvidence(image.depthEvidence, depth, correct)
  const nextDepth = resolveDepth(depthEvidence)

  const next: LearnerConceptImage = {
    ...image,
    mastery,
    confidence,
    depth: nextDepth,
    depthEvidence,
    directEvidenceCount: image.directEvidenceCount + 1,
    directEvidenceWeight,
    // Echte Evidenz loest den propagierten Zweifel auf — dafuer war er da.
    propagationConfidencePenalty: 0,
    reviewNeeded: false,
    reviewReason: '',
    decayRate: image.decayRate,
    coldStart: directEvidenceWeight < COLD_START_EVIDENCE_WEIGHT,
    // Einmal gesetzt, bleibt gesetzt: die Aussage ist „war schon einmal da", nicht „ist gerade da".
    everConsolidated: image.everConsolidated || mastery >= CONSOLIDATED_MASTERY,
    lastDirectEvidenceAt: nowIso,
    lastSeenAt: nowIso,
    nextReviewAt: isoPlusDays(nowIso, nextReviewIntervalDays(mastery, confidence)),
  }

  return {
    next,
    masteryDelta: mastery - priorMastery,
    confidenceDelta: clamp01(confidence) - priorConfidence,
  }
}

/**
 * Verfall auf eine ganze Zustandskarte anwenden — fuer Anzeige und Planung beim Laden.
 * Der gespeicherte Zustand behaelt seinen `lastSeenAt`; der Verfall wird jedes Mal neu gerechnet.
 */
export function decayAll(
  images: Map<string, LearnerConceptImage>,
  nowIso: string,
): Map<string, LearnerConceptImage> {
  const out = new Map<string, LearnerConceptImage>()
  for (const [id, image] of images) {
    out.set(id, {
      ...image,
      mastery: effectiveMastery(image, nowIso),
      confidence: effectiveConfidence(image, nowIso),
    })
  }
  return out
}

export { MASTERY_FLOOR }
