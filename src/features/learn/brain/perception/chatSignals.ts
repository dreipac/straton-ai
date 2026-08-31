/**
 * Schicht 3 — Chatverhalten als Signalquelle (Kapitel 5.1).
 *
 * Chat ist die haeufigste Signalquelle und die verrauschteste. Die Architektur behandelt ihn
 * deshalb grundlegend anders als eine bewertete Aufgabe:
 *
 *   Darf die Beherrschung erhoehen:  NIE (Invariante I2)
 *   Darf die Beherrschung senken:    nein
 *   Wirkt primaer auf:               Sicherheit und Verdachtsmarkierung
 *
 * Der Grund fuer I2 ist kein technischer, sondern ein produktlicher: Fragen stellen beweist
 * nichts. Ohne diese Regel wuerde ein Vielredner ein geschoentes Lernerbild bekommen, und die
 * eine Zahl, an der das ganze Produkt haengt, waere wertlos.
 *
 * Diese Datei setzt `masteryDelta` deshalb an jeder Stelle hart auf 0 und laesst den Guard
 * `assertMasteryChangeAllowed` darueber laufen. Es gibt hier keinen Codepfad, der die
 * Beherrschung beruehrt.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { ChatSignal, ChatSignalKind, EvidenceEvent, LearnerConceptImage } from '../types'
import { assertMasteryChangeAllowed } from '../invariants'
import { EVIDENCE_BASE_WEIGHT } from './evidence'

/**
 * Wie stark ein Chatsignal die Sicherheit senkt.
 *
 * Die Reihenfolge folgt Kapitel 5.1: „wer nach der Loesung fragt, steht anders da als wer nach
 * dem Warum fragt." Nach dem Warum zu fragen ist ein Zeichen von Auseinandersetzung und senkt
 * am wenigsten; dieselbe Frage nach Wochen erneut zu stellen ist das staerkste Signal.
 */
export const CHAT_SIGNAL_CONFIDENCE_PENALTY: Record<ChatSignalKind, number> = {
  repeatedQuestion: 0.12,
  abandonedExplanation: 0.08,
  asksForSolution: 0.06,
  asksForReason: 0.02,
}

/**
 * Obergrenze dessen, was Chatsignale zusammen an Sicherheit abziehen duerfen.
 *
 * Die Grundwerte oben liegen bewusst deutlich darunter: saettigte schon ein einzelnes Signal den
 * Deckel, waere die Verteilung ueber die Zeit unsichtbar — und genau sie unterscheidet eine
 * Luecke von einem Gespraech. Der Deckel begrenzt die SUMME vieler Signale, nicht das einzelne.
 */
export const CHAT_CONFIDENCE_PENALTY_CAP = 0.4

/** Ab diesem Abschlag wird das Konzept als ueberpruefungsbeduerftig markiert. */
export const CHAT_REVIEW_MARK_THRESHOLD = 0.15

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/**
 * Abschlag eines Chatsignals auf die Sicherheit.
 *
 * Wiederholung ueber ZEIT zaehlt, nicht Wiederholung in einer Sitzung: dieselbe Frage dreimal
 * in fuenf Minuten ist ein Gespraech, dreimal ueber drei Wochen ist eine Luecke. Deshalb geht
 * `spanDays` als Verstaerker ein, nicht `occurrences` allein.
 */
export function chatConfidencePenalty(signal: ChatSignal): number {
  const base = CHAT_SIGNAL_CONFIDENCE_PENALTY[signal.kind]
  const occurrences = Math.max(1, signal.occurrences)
  const spanFactor = signal.spanDays >= 7 ? 1.5 : signal.spanDays >= 2 ? 1.2 : 1
  return Math.min(CHAT_CONFIDENCE_PENALTY_CAP, base * Math.log2(1 + occurrences) * spanFactor)
}

export type ChatPerceptionResult = {
  updated: LearnerConceptImage
  event: EvidenceEvent
}

/**
 * Ein Chatsignal auf das Lernerbild anwenden.
 *
 * `mastery` wird woertlich durchgereicht. `masteryDelta` im Ereignis ist konstant 0 und wird
 * zusaetzlich durch den Guard geprueft — die Invariante steht damit dreifach: im Kommentar, im
 * Code und im Datenbank-Constraint.
 */
export function perceiveChatSignal(args: {
  userId: string
  pathId: string
  image: LearnerConceptImage
  signal: ChatSignal
  /** Kapitel 5.1: der Nutzer kann Chat als Signalquelle abschalten. */
  chatSignalsEnabled: boolean
  nowIso: string
}): ChatPerceptionResult | null {
  if (!args.chatSignalsEnabled) {
    return null
  }

  const penalty = chatConfidencePenalty(args.signal)
  const before = clamp01(args.image.confidence - args.image.propagationConfidencePenalty)

  const updated: LearnerConceptImage = {
    ...args.image,
    // Unberuehrt. Invariante I2.
    mastery: args.image.mastery,
    propagationConfidencePenalty: Math.min(1, args.image.propagationConfidencePenalty + penalty),
    reviewNeeded: args.image.reviewNeeded || penalty >= CHAT_REVIEW_MARK_THRESHOLD,
    reviewReason:
      penalty >= CHAT_REVIEW_MARK_THRESHOLD && !args.image.reviewNeeded
        ? describeChatSignal(args.signal)
        : args.image.reviewReason,
    lastSeenAt: args.nowIso,
  }

  const after = clamp01(updated.confidence - updated.propagationConfidencePenalty)

  const event: EvidenceEvent = {
    userId: args.userId,
    pathId: args.pathId,
    conceptId: args.signal.conceptId,
    source: 'chat',
    verdict: { credit: 0, partialCredit: {}, cause: null, confidence: 0 },
    depth: args.image.depth,
    format: 'chat',
    difficulty: 3,
    evidenceWeight: EVIDENCE_BASE_WEIGHT.chat,
    escalated: false,
    masteryDelta: 0,
    confidenceDelta: after - before,
    occurredAt: args.nowIso,
  }

  assertMasteryChangeAllowed('chat', event.masteryDelta)
  return { updated, event }
}

/** Ein Chatsignal in einen Satz fassen, der dem Nutzer zeigbar ist. */
export function describeChatSignal(signal: ChatSignal): string {
  switch (signal.kind) {
    case 'repeatedQuestion':
      return signal.spanDays >= 7
        ? 'Diese Frage kam ueber mehrere Wochen wieder — das schaue ich mir nochmal genauer an.'
        : 'Diese Frage kam mehrfach — das schaue ich mir nochmal genauer an.'
    case 'abandonedExplanation':
      return 'Eine Erklaerung dazu wurde abgebrochen; ob es sitzt, weiss ich noch nicht.'
    case 'asksForSolution':
      return 'Hier ging es zuletzt eher um die Loesung als um den Weg.'
    case 'asksForReason':
      return 'Dazu gab es Rueckfragen; die Einschaetzung ist noch nicht belastbar.'
  }
}

/**
 * Sichtbarkeitspflicht (Kapitel 5.1).
 *
 * Der Nutzer MUSS wissen, dass Chats das Lernerbild beeinflussen, und es abschalten koennen.
 * Ohne das fuehlt es sich ueberwacht an — und genau die lockere, niedrigschwellige Chatnutzung
 * ist der Einstiegstrichter des Produkts. Dieser Text gehoert an die Stelle, an der der
 * Schalter sitzt.
 */
export const CHAT_SIGNALS_DISCLOSURE =
  'Was du im Chat fragst, fliesst in meine Einschaetzung ein — allerdings nur vorsichtig: ' +
  'Chatverhalten kann meine Sicherheit senken, deine Beherrschung aber nie erhoehen. ' +
  'Du kannst das jederzeit abschalten.'
