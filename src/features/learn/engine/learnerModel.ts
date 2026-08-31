/**
 * Lerner-Modell-Komposition — Schicht 3.
 *
 * Verbindet die reinen Primitive (bkt, forgetting, conceptGraph) zu genau den hoeheren Operationen,
 * die der Live-Fluss braucht: eine ausgewertete Antwort in einen persistierbaren Konzept-Zustandsuebergang
 * uebersetzen (inkl. Verfall-vor-Evidenz, Outcome-Historie, Verfalls-Raten-Lernen, naechste Faelligkeit).
 *
 * Die Beherrschung bewegt sich hier ausschliesslich durch die BEWERTETE ANTWORT auf genau dieses
 * Konzept. Das frueher enthaltene Mitziehen der Nachbarknoten ist entfallen — es verletzte die
 * Invarianten I1 und I3 (Begruendung im Kopf von `conceptGraph.ts`). Zweifel an Nachbarknoten
 * verteilt das Gehirn-Modul, und zwar auf die Sicherheit statt auf die Beherrschung.
 *
 * Bleibt rein (kein DOM/I/O). `nowIso` wird von aussen hereingereicht (Server-/Client-Zeitstempel),
 * damit die Funktionen deterministisch testbar sind.
 */

import { updateMastery, seedPrior, DEFAULT_BKT_PARAMS, type BktParams } from './bkt'
import { decayedMastery, adjustDecayRate, DEFAULT_DECAY_RATE } from './forgetting'
import { priorFromGraph } from './conceptGraph'
import type { Concept, ConceptEdge, LearnerConceptState, Outcome } from './types'

/** Obergrenze der gespeicherten Outcome-Historie (neueste zuerst). */
export const OUTCOME_HISTORY_CAP = 20

const MS_PER_DAY = 86_400_000

/**
 * Naechstes Wiederholungsintervall (Tage) aus P(Mastery): je sicherer beherrscht, desto spaeter faellig.
 * Grobe, an SR angelehnte Leiter — die feinkoernige Karten-SR laeuft separat (reviewScheduler).
 */
export function nextReviewIntervalDays(pMastery: number): number {
  if (pMastery < 0.3) return 1
  if (pMastery < 0.5) return 2
  if (pMastery < 0.7) return 4
  if (pMastery < 0.85) return 8
  return 15
}

function isoPlusDays(nowIso: string, days: number): string {
  const base = new Date(nowIso).getTime()
  if (!Number.isFinite(base)) {
    return nowIso
  }
  return new Date(base + days * MS_PER_DAY).toISOString()
}

/** Anzahl der juengsten aufeinanderfolgenden Fehlversuche (Historie ist neueste-zuerst). */
function leadingWrongStreak(history: Outcome[]): number {
  let streak = 0
  for (const o of history) {
    if (o.correct) {
      break
    }
    streak += 1
  }
  return streak
}

/**
 * Effektive (verfallene) Mastery eines Zustands zum Zeitpunkt `nowIso` — fuer Anzeige/Scoring beim Laden.
 * Der gespeicherte Zustand behaelt seinen `lastSeenAt`; der Verfall wird bei jedem Laden neu gerechnet.
 */
export function effectiveMastery(state: LearnerConceptState, nowIso: string): number {
  return decayedMastery(state, nowIso)
}

/**
 * Eine ausgewertete Beobachtung auf ein Konzept anwenden.
 *
 * Ablauf: (1) Ausgangswert = verfallener bisheriger Zustand ODER Graph-gestuetzter Seed fuer ein noch
 * ungesehenes Konzept; (2) BKT-Update mit der Schwierigkeit; (3) Historie/Zaehler fortschreiben;
 * (4) individuelle Verfalls-Rate nachfuehren; (5) naechste Faelligkeit setzen.
 *
 * `propagated` bleibt leer und ist nur noch als Rueckgabeform vorhanden, damit die Aufrufstellen
 * unveraendert bleiben. Nachbarknoten werden NICHT mehr mitgezogen: das hiesse, eine Beherrschung
 * ohne direkte Evidenz zu bewegen (I1) und sie ueber den Graphen zu verschieben (I3).
 */
export function applyConceptObservation(args: {
  concept: Concept
  edges: ConceptEdge[]
  statesById: Map<string, LearnerConceptState>
  correct: boolean
  /** Teil-Credit ∈ [0,1] fuer weiche Evidenz (semantische Teilbewertung); Default = correct ? 1 : 0. */
  credit?: number
  /** Schwierigkeit der Beobachtung; Default = Schwierigkeit des Konzepts. */
  difficulty?: number
  nowIso: string
  params?: BktParams
}): { updated: LearnerConceptState; propagated: LearnerConceptState[] } {
  const { concept, edges, statesById, correct, credit, nowIso } = args
  const params = args.params ?? DEFAULT_BKT_PARAMS
  const difficulty = args.difficulty ?? concept.difficulty

  const existing = statesById.get(concept.id)
  const priorBase = existing
    ? decayedMastery(existing, nowIso)
    : priorFromGraph(concept, edges, statesById, seedPrior(concept.difficulty))

  const pMastery = updateMastery(priorBase, { correct, difficulty, credit }, params)

  const outcome: Outcome = { correct, difficulty, at: nowIso, ...(typeof credit === 'number' ? { credit } : {}) }
  const outcomeHistory = [outcome, ...(existing?.outcomeHistory ?? [])].slice(0, OUTCOME_HISTORY_CAP)
  const attempts = (existing?.attempts ?? 0) + 1
  const correctCount = (existing?.correct ?? 0) + (correct ? 1 : 0)

  const decayRate = adjustDecayRate(existing?.decayRate ?? DEFAULT_DECAY_RATE, {
    firstTryCorrect: attempts === 1 && correct,
    priorWrongStreak: leadingWrongStreak(existing?.outcomeHistory ?? []),
    consistentAcrossSessions: correctCount >= 3 && correct,
  })

  const updated: LearnerConceptState = {
    conceptId: concept.id,
    pMastery,
    attempts,
    correct: correctCount,
    outcomeHistory,
    decayRate,
    lastSeenAt: nowIso,
    nextReviewAt: isoPlusDays(nowIso, nextReviewIntervalDays(pMastery)),
  }

  // Immer leer — siehe Kopfkommentar. Die Form bleibt, damit die Aufrufstellen unveraendert sind.
  const propagated: LearnerConceptState[] = []

  return { updated, propagated }
}

export type { BktParams }
