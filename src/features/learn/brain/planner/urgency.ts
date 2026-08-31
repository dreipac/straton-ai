/**
 * Schicht 4 — die vier konkurrierenden Ansprueche (Kapitel 6.2).
 *
 * Zu jedem Zeitpunkt melden vier Quellen eine Dringlichkeit an:
 *
 *   Wiederholung   Konzepte am Verfallen
 *   Ursachensuche  Verdacht auf Grundlagenluecke (Propagation hat Zweifel markiert)
 *   Ziel           Termin und Umfang
 *   Motivation     Frustrationsschutz
 *
 * Konfliktloesung: gewichtete Dringlichkeit, wobei ein gesetztes Ziel uebersteuert. Verworfen
 * wurde eine feste Prioritaetenreihenfolge — die haette keine Abwaegung erlaubt, sondern nur
 * ein Durchreichen.
 *
 * Invariante I11: hier entscheidet kein Modell. Diese Datei importiert nichts aus `agents/`
 * und wird es nie tun. Feste Logik ist hier eindeutig ueberlegen — nachvollziehbar, sofort,
 * kostenlos, testbar. Die Intelligenz sitzt in den Signalen, die hereinlaufen, nicht in der
 * Auswahl.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { LearnerConceptImage, LearningGoal, UrgencyClaim, UrgencySignal } from '../types'
import { effectiveConfidence, effectiveMastery } from '../memory/learnerImage'
import { isInGoalScope } from './goal'

/**
 * Gewichte der vier Ansprueche.
 *
 * Das Ziel liegt deutlich ueber den anderen — das ist die technische Form von „Ziel
 * uebersteuert". Es ist bewusst ein GEWICHT und keine Vorrangregel: ein Konzept, das direkt
 * vor dem Verfall steht, kann ein schwach dringliches Zielkonzept immer noch schlagen. Genau
 * das soll passieren, sonst waere die Mindestreserve (I9) die einzige Bremse.
 */
export const CLAIM_WEIGHTS: Record<UrgencyClaim, number> = {
  goal: 2.2,
  rootCause: 1.4,
  review: 1,
  motivation: 1.1,
  coldStart: 1.6,
}

const MS_PER_DAY = 86_400_000

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function daysOverdue(nextReviewAt: string | null, nowIso: string): number {
  if (!nextReviewAt) {
    return 0
  }
  const due = new Date(nextReviewAt).getTime()
  const now = new Date(nowIso).getTime()
  if (!Number.isFinite(due) || !Number.isFinite(now)) {
    return 0
  }
  return Math.max(0, (now - due) / MS_PER_DAY)
}

/**
 * Anspruch „Wiederholung": Konzepte am Verfallen.
 *
 * Steigt mit der Ueberfaelligkeit und mit dem Abstand der verfallenen Beherrschung zur Schwelle.
 * Konzepte ohne direkte Evidenz melden hier nichts — es gibt nichts zu wiederholen, was nie
 * belegt war.
 */
export function reviewUrgency(image: LearnerConceptImage, nowIso: string): UrgencySignal | null {
  if (image.directEvidenceCount === 0) {
    return null
  }

  const overdue = daysOverdue(image.nextReviewAt, nowIso)
  const mastery = effectiveMastery(image, nowIso)
  const slipped = Math.max(0, 0.7 - mastery) / 0.7

  // Ueberfaelligkeit saettigt nach zwei Wochen — danach ist „laenger her" kein staerkeres Argument.
  const overdueScore = clamp01(overdue / 14)
  const urgency = clamp01(0.6 * overdueScore + 0.4 * slipped)

  if (urgency <= 0) {
    return null
  }

  return {
    claim: 'review',
    conceptId: image.conceptId,
    urgency,
    reason:
      overdue >= 1
        ? `Seit ${Math.round(overdue)} Tagen faellig — ohne Auffrischung verfaellt das.`
        : 'Das faengt an zu verblassen.',
  }
}

/**
 * Anspruch „Ursachensuche": Verdacht auf eine Grundlagenluecke.
 *
 * Speist sich aus der Markierung, die die Propagation gesetzt hat (Kapitel 4.3), und aus dem
 * Auseinanderfallen von Beherrschung und Sicherheit: ein hoher Wert ohne Beleg ist genau der
 * Fall, den das Gehirn ueberpruefen muss.
 */
export function rootCauseUrgency(image: LearnerConceptImage, nowIso: string): UrgencySignal | null {
  const confidence = effectiveConfidence(image, nowIso)
  const mastery = effectiveMastery(image, nowIso)

  const flagged = image.reviewNeeded ? 0.6 : 0
  // Unbelegte Hoehe: viel behauptete Beherrschung bei wenig Sicherheit.
  const unverified = clamp01(mastery - confidence)
  const urgency = clamp01(flagged + 0.5 * unverified)

  if (urgency <= 0) {
    return null
  }

  return {
    claim: 'rootCause',
    conceptId: image.conceptId,
    urgency,
    reason: image.reviewReason.trim().length > 0
      ? image.reviewReason
      : 'Der Wert hier ist noch kaum belegt — das pruefe ich nach.',
  }
}

/**
 * Anspruch „Ziel": Termin und Umfang.
 *
 * Waechst, je naeher der Termin rueckt und je mehr an diesem Konzept noch fehlt. Ein
 * Zielkonzept, das bereits sitzt, meldet nichts — sonst wuerde der Zielmodus die Sitzung mit
 * bereits Gekonntem fuellen.
 */
export function goalUrgency(args: {
  image: LearnerConceptImage | undefined
  conceptId: string
  goal: LearningGoal | null
  nowIso: string
}): UrgencySignal | null {
  const { image, conceptId, goal, nowIso } = args
  if (!isInGoalScope(goal, conceptId) || !goal) {
    return null
  }

  const mastery = image ? effectiveMastery(image, nowIso) : 0
  const gap = Math.max(0, 0.75 - mastery) / 0.75
  if (gap <= 0) {
    return null
  }

  const due = new Date(goal.dueAt).getTime()
  const now = new Date(nowIso).getTime()
  const daysLeft = Number.isFinite(due) && Number.isFinite(now) ? Math.max(0, (due - now) / MS_PER_DAY) : 30
  // Druck saettigt bei etwa zwei Wochen Vorlauf; darunter steigt er steil.
  const pressure = clamp01(1 - daysLeft / 14)

  return {
    claim: 'goal',
    conceptId,
    urgency: clamp01(0.45 + 0.55 * pressure) * gap,
    reason:
      daysLeft <= 3
        ? 'Das gehoert zu deinem Termin und ist noch nicht sicher.'
        : 'Das gehoert zum Umfang deines Ziels.',
  }
}

/**
 * Anspruch „Motivation": Frustrationsschutz.
 *
 * Nach mehreren Fehlschlaegen hintereinander wird nicht das naechste schwere Konzept gezogen,
 * sondern eines, das die Person mit hoher Wahrscheinlichkeit kann. Das ist kein Nachgeben,
 * sondern die Bedingung dafuer, dass die Sitzung ueberhaupt weitergeht.
 *
 * Meldet daher fuer die STARKEN Konzepte, nicht fuer die schwachen — die Dringlichkeit gilt dem
 * Gefuehl, nicht dem Stoff.
 */
export const FRUSTRATION_STREAK_THRESHOLD = 3

export function motivationUrgency(args: {
  image: LearnerConceptImage
  consecutiveFailures: number
  nowIso: string
}): UrgencySignal | null {
  if (args.consecutiveFailures < FRUSTRATION_STREAK_THRESHOLD) {
    return null
  }

  const mastery = effectiveMastery(args.image, args.nowIso)
  if (mastery < 0.7) {
    return null
  }

  const streakScore = clamp01((args.consecutiveFailures - FRUSTRATION_STREAK_THRESHOLD + 1) / 3)
  return {
    claim: 'motivation',
    conceptId: args.image.conceptId,
    urgency: clamp01(0.5 + 0.5 * streakScore) * mastery,
    reason: 'Nach den letzten Aufgaben etwas, das sicher sitzt.',
  }
}

/**
 * Anspruch „Kaltstart": adaptive Suche nach der Front (Kapitel 9).
 *
 * Gilt nur, solange das Konzept ueberhaupt keine direkte Evidenz hat. Die Auswahl WELCHES
 * ungesehene Konzept gefragt wird, trifft `coldstart/frontSearch.ts` — hier steht nur, dass
 * ein solcher Anspruch besteht und wie stark er wiegt.
 */
export function coldStartUrgency(args: {
  conceptId: string
  image: LearnerConceptImage | undefined
  /** Informationsgewinn der Frage, 0..1 — aus der Halbierung des Suchraums. */
  informationGain: number
}): UrgencySignal | null {
  if (args.image && args.image.directEvidenceCount > 0) {
    return null
  }
  if (args.informationGain <= 0) {
    return null
  }
  return {
    claim: 'coldStart',
    conceptId: args.conceptId,
    urgency: clamp01(args.informationGain),
    reason: 'Damit finde ich heraus, wo du stehst.',
  }
}

/** Gewichtete Dringlichkeit eines Signals. */
export function weightedUrgency(signal: UrgencySignal): number {
  return signal.urgency * CLAIM_WEIGHTS[signal.claim]
}

/**
 * Alle Signale eines Konzepts zu einer Entscheidung verdichten.
 *
 * Der STAERKSTE Anspruch gewinnt und stellt die Begruendung; die uebrigen fliessen mit einem
 * kleinen Anteil in die Gesamtdringlichkeit ein. Eine reine Summe waere falsch: drei schwache
 * Ansprueche duerfen keinen starken ueberholen, sonst gewinnt immer das Konzept mit den
 * meisten Etiketten statt dem dringendsten Grund.
 */
export const SECONDARY_CLAIM_SHARE = 0.25

export type ConceptUrgency = {
  conceptId: string
  claim: UrgencyClaim
  urgency: number
  reason: string
  breakdown: Record<string, number>
}

export function combineUrgencies(conceptId: string, signals: UrgencySignal[]): ConceptUrgency | null {
  const relevant = signals.filter((signal) => signal.conceptId === conceptId && signal.urgency > 0)
  if (relevant.length === 0) {
    return null
  }

  const scored = relevant
    .map((signal) => ({ signal, weighted: weightedUrgency(signal) }))
    .sort((a, b) => b.weighted - a.weighted)

  const leader = scored[0]
  const rest = scored.slice(1).reduce((sum, entry) => sum + entry.weighted, 0)

  const breakdown: Record<string, number> = {}
  for (const entry of scored) {
    breakdown[entry.signal.claim] = Number(entry.weighted.toFixed(4))
  }

  return {
    conceptId,
    claim: leader.signal.claim,
    urgency: leader.weighted + SECONDARY_CLAIM_SHARE * rest,
    reason: leader.signal.reason,
    breakdown,
  }
}
