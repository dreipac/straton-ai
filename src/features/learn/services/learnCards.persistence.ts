/**
 * Persistenz der generierten Lernkarten + ihrer SR-Zustaende (Schicht 5, Entscheidung 4/5).
 *
 * Client-Anbindung an `learn_cards` + `learner_card_states` aus
 * `supabase/migrations/20260725120000_learn_concept_engine_foundation.sql`:
 *  - generierte, konzept-getaggte Karten speichern/laden (learn_cards, direkte RLS-Upserts),
 *  - fuer den Nutzer geladene Karten-SR-Zustaende lesen (learner_card_states).
 *
 * Der SR-Update selbst laeuft ueber `reviewCardState` (RPC learn_review_card) in
 * `learnConceptGraph.persistence.ts`; hier liegen nur Erzeugung + Ladepfad der Karten.
 *
 * Muster (Supabase-Client, toReadableError, RLS-Upsert) analog `learnConceptGraph.persistence.ts`.
 */

import { getSupabaseClient } from '../../../integrations/supabase/client'
import type { CardType, EvaluationMethod, LearnCard, LearnerCardState } from '../engine/types'

function toReadableError(error: unknown): Error {
  if (!error || typeof error !== 'object') {
    return new Error('Unbekannter Supabase-Fehler.')
  }
  const candidate = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
  const parts = [
    typeof candidate.message === 'string' ? candidate.message : '',
    typeof candidate.details === 'string' ? candidate.details : '',
    typeof candidate.hint === 'string' ? candidate.hint : '',
    typeof candidate.code === 'string' ? `Code: ${candidate.code}` : '',
  ].filter(Boolean)
  return new Error(parts.join(' | ') || 'Supabase-Anfrage fehlgeschlagen.')
}

// --- Mapper: DB-Zeile <-> Engine-Typ ---------------------------------------

const CARD_TYPES: CardType[] = ['knowledge', 'application', 'distinction', 'cloze']
const EVAL_METHODS: EvaluationMethod[] = ['exact', 'semantic', 'contains']

function toCardType(value: unknown): CardType {
  return typeof value === 'string' && (CARD_TYPES as string[]).includes(value) ? (value as CardType) : 'knowledge'
}

function toEvalMethod(value: unknown): EvaluationMethod {
  return typeof value === 'string' && (EVAL_METHODS as string[]).includes(value) ? (value as EvaluationMethod) : 'semantic'
}

type LearnCardRow = {
  id: string
  path_id: string
  step_id: string | null
  concept_ids: string[] | null
  question: string
  answer: string | null
  card_type: string
  difficulty: number
  expected_answer: string | null
  evaluation_method: string
}

function mapCardRow(row: LearnCardRow): LearnCard {
  return {
    id: row.id,
    pathId: row.path_id,
    stepId: row.step_id ?? null,
    conceptIds: Array.isArray(row.concept_ids) ? row.concept_ids : [],
    question: row.question,
    answer: row.answer ?? '',
    cardType: toCardType(row.card_type),
    difficulty: row.difficulty,
    expectedAnswer: row.expected_answer ?? '',
    evaluationMethod: toEvalMethod(row.evaluation_method),
  }
}

type LearnerCardStateRow = {
  card_id: string
  sr_stage: number
  easiness: number
  interval_days: number
  status: string
  last_reviewed_at: string | null
  next_review_at: string | null
}

function mapCardStateRow(row: LearnerCardStateRow): LearnerCardState {
  const status = row.status
  return {
    cardId: row.card_id,
    srStage: row.sr_stage,
    easiness: row.easiness,
    intervalDays: row.interval_days,
    status:
      status === 'new' || status === 'learning' || status === 'review' || status === 'mastered'
        ? status
        : 'new',
    lastReviewedAt: row.last_reviewed_at,
    nextReviewAt: row.next_review_at,
  }
}

// --- Schreiben/Lesen der Karten --------------------------------------------

/** Eine zu erzeugende Karte (ohne id — die vergibt die DB). */
export type NewLearnCard = {
  pathId: string
  stepId?: string | null
  conceptIds: string[]
  question: string
  answer?: string
  cardType?: CardType
  difficulty?: number
  expectedAnswer?: string
  evaluationMethod?: EvaluationMethod
}

function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase()
}

/**
 * Generierte Karten eines Pfads idempotent synchronisieren: Karten, deren Frage bereits existiert,
 * bleiben unberuehrt (WICHTIG — ein Loeschen wuerde via ON DELETE CASCADE die SR-Zustaende der Karte
 * vernichten); nur echte Neu-Karten werden eingefuegt. Gibt den vollstaendigen aktuellen Karten-Satz
 * des Pfads (inkl. DB-ids) zurueck, damit der Aufrufer Inhalt→id abbilden kann.
 */
export async function syncPathLearnCards(pathId: string, cards: NewLearnCard[]): Promise<LearnCard[]> {
  const existing = await loadLearnCards(pathId)
  const known = new Set(existing.map((c) => normalizeQuestion(c.question)))

  const seen = new Set<string>()
  const toInsert = cards.filter((c) => {
    const key = normalizeQuestion(c.question)
    if (!key || known.has(key) || seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
  if (toInsert.length === 0) {
    return existing
  }

  const supabase = getSupabaseClient()
  const payload = toInsert.map((c) => ({
    path_id: pathId,
    step_id: c.stepId ?? null,
    concept_ids: c.conceptIds,
    question: c.question,
    answer: c.answer ?? '',
    card_type: c.cardType ?? 'knowledge',
    difficulty: Math.max(1, Math.min(5, Math.round(c.difficulty ?? 3))),
    expected_answer: c.expectedAnswer ?? '',
    evaluation_method: c.evaluationMethod ?? 'semantic',
  }))
  const { data, error } = await supabase.from('learn_cards').insert(payload).select()
  if (error) {
    throw toReadableError(error)
  }
  const inserted = (data ?? []).map((row) => mapCardRow(row as LearnCardRow))
  return [...existing, ...inserted]
}

/** Alle Karten eines Pfads laden (fuer Ueben-Tab / SR-Faelligkeit). */
export async function loadLearnCards(pathId: string): Promise<LearnCard[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_cards')
    .select('id, path_id, step_id, concept_ids, question, answer, card_type, difficulty, expected_answer, evaluation_method')
    .eq('path_id', pathId)
  if (error) {
    throw toReadableError(error)
  }
  return (data ?? []).map((row) => mapCardRow(row as LearnCardRow))
}

/** SR-Zustaende der gegebenen Karten fuer den aktuellen User laden (RLS: nur eigene). */
export async function loadCardStates(cardIds: string[]): Promise<LearnerCardState[]> {
  if (cardIds.length === 0) {
    return []
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learner_card_states')
    .select('card_id, sr_stage, easiness, interval_days, status, last_reviewed_at, next_review_at')
    .in('card_id', cardIds)
  if (error) {
    throw toReadableError(error)
  }
  return (data ?? []).map((row) => mapCardStateRow(row as LearnerCardStateRow))
}
