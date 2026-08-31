/**
 * Persistenz des Konzept-Netzes + Lerner-Modells (neue Architektur, Schicht 1/3).
 *
 * Client-Anbindung an die normalisierten Tabellen aus
 * `supabase/migrations/20260725120000_learn_concept_engine_foundation.sql`:
 *  - Konzept-Netz speichern/laden (learn_concepts / learn_concept_edges),
 *  - Lerner-Konzept-Zustaende laden + atomar upserten (RPC learn_upsert_concept_states),
 *  - Karten-SR-Zustand upserten (RPC learn_review_card).
 *
 * Muster (Supabase-Client, toReadableError, RPC-Aufruf) analog `learnGamification.persistence.ts`.
 */

import { getSupabaseClient } from '../../../integrations/supabase/client'
import type { Concept, ConceptEdge, EdgeType, LearnerCardState, LearnerConceptState, Outcome } from '../engine/types'
import type { IngestedGraph } from '../utils/conceptIngestion'

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

type ConceptRow = {
  id: string
  path_id: string
  slug: string
  name: string
  description: string | null
  difficulty: number
  source_ref: unknown
  ordinal: number
}

function mapConceptRow(row: ConceptRow): Concept {
  const src = (row.source_ref && typeof row.source_ref === 'object' ? row.source_ref : {}) as Record<string, unknown>
  return {
    id: row.id,
    pathId: row.path_id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? '',
    difficulty: row.difficulty,
    sourceRef: {
      doc: typeof src.doc === 'string' ? src.doc : undefined,
      section: typeof src.section === 'string' ? src.section : undefined,
      pageFrom: typeof src.pageFrom === 'number' ? src.pageFrom : undefined,
      pageTo: typeof src.pageTo === 'number' ? src.pageTo : undefined,
    },
    ordinal: row.ordinal,
  }
}

type EdgeRow = { id: string; path_id: string; from_concept_id: string; to_concept_id: string; type: string }

function mapEdgeRow(row: EdgeRow): ConceptEdge {
  return {
    id: row.id,
    pathId: row.path_id,
    fromConceptId: row.from_concept_id,
    toConceptId: row.to_concept_id,
    type: row.type as EdgeType,
  }
}

function mapOutcomeHistory(value: unknown): Outcome[] {
  if (!Array.isArray(value)) {
    return []
  }
  const out: Outcome[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const e = entry as Record<string, unknown>
    if (typeof e.correct === 'boolean' && typeof e.difficulty === 'number' && typeof e.at === 'string') {
      out.push({ correct: e.correct, difficulty: e.difficulty, at: e.at })
    }
  }
  return out
}

type ConceptStateRow = {
  concept_id: string
  p_mastery: number
  attempts: number
  correct: number
  outcome_history: unknown
  decay_rate: number
  last_seen_at: string | null
  next_review_at: string | null
}

function mapConceptStateRow(row: ConceptStateRow): LearnerConceptState {
  return {
    conceptId: row.concept_id,
    pMastery: row.p_mastery,
    attempts: row.attempts,
    correct: row.correct,
    outcomeHistory: mapOutcomeHistory(row.outcome_history),
    decayRate: row.decay_rate,
    lastSeenAt: row.last_seen_at,
    nextReviewAt: row.next_review_at,
  }
}

// --- Konzept-Netz speichern / laden ----------------------------------------

/**
 * Persistiert ein frisch generiertes Konzept-Netz (Ingestion). Fuegt zuerst die Konzepte ein (holt die
 * generierten IDs), bildet daraus die Slug->ID-Map und fuegt dann die Kanten ein. Gibt die persistierten
 * Zeilen als Engine-Typen zurueck.
 */
export async function saveConceptGraph(
  pathId: string,
  graph: IngestedGraph,
): Promise<{ concepts: Concept[]; edges: ConceptEdge[] }> {
  const supabase = getSupabaseClient()

  /*
   * `origin` und `source_quote` werden ausdruecklich mitgeschrieben (Invariante I4).
   *
   * Frueher fehlten beide Spalten hier, und der Datenbank-Default stempelte jedes Konzept auf
   * Materialherkunft — mit leerem Beleg. Das ist die Behauptung einer Quelle, die niemand
   * nachweisen kann. Seit der Migration 20260819100000 gibt es diesen Default nicht mehr: ein
   * Schreibvorgang ohne Herkunft schlaegt fehl, statt still zu raten.
   */
  const conceptRows = graph.concepts.map((c, index) => ({
    path_id: pathId,
    slug: c.slug,
    name: c.name,
    description: c.description,
    difficulty: c.difficulty,
    source_ref: c.sourceRef,
    origin: c.origin,
    source_quote: c.sourceQuote,
    ordinal: index,
  }))

  const { data: insertedConcepts, error: conceptError } = await supabase
    .from('learn_concepts')
    .insert(conceptRows)
    .select('id, path_id, slug, name, description, difficulty, source_ref, ordinal')

  if (conceptError) {
    throw toReadableError(conceptError)
  }
  const concepts = (insertedConcepts ?? []).map(mapConceptRow)
  const idBySlug = new Map(concepts.map((c) => [c.slug, c.id]))

  const edgeRows = graph.edges
    .map((e) => {
      const from = idBySlug.get(e.fromSlug)
      const to = idBySlug.get(e.toSlug)
      if (!from || !to) {
        return null
      }
      return { path_id: pathId, from_concept_id: from, to_concept_id: to, type: e.type }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  let edges: ConceptEdge[] = []
  if (edgeRows.length > 0) {
    const { data: insertedEdges, error: edgeError } = await supabase
      .from('learn_concept_edges')
      .insert(edgeRows)
      .select('id, path_id, from_concept_id, to_concept_id, type')
    if (edgeError) {
      throw toReadableError(edgeError)
    }
    edges = (insertedEdges ?? []).map(mapEdgeRow)
  }

  return { concepts, edges }
}

export async function loadConceptGraph(pathId: string): Promise<{ concepts: Concept[]; edges: ConceptEdge[] }> {
  const supabase = getSupabaseClient()
  const [{ data: conceptData, error: conceptError }, { data: edgeData, error: edgeError }] = await Promise.all([
    supabase
      .from('learn_concepts')
      .select('id, path_id, slug, name, description, difficulty, source_ref, ordinal')
      .eq('path_id', pathId)
      .order('ordinal', { ascending: true }),
    supabase
      .from('learn_concept_edges')
      .select('id, path_id, from_concept_id, to_concept_id, type')
      .eq('path_id', pathId),
  ])
  if (conceptError) {
    throw toReadableError(conceptError)
  }
  if (edgeError) {
    throw toReadableError(edgeError)
  }
  return {
    concepts: (conceptData ?? []).map(mapConceptRow),
    edges: (edgeData ?? []).map(mapEdgeRow),
  }
}

/** Loescht das gesamte Konzept-Netz eines Pfads (fuer Neu-Ingestion). Kanten via ON DELETE CASCADE. */
export async function deleteConceptGraph(pathId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('learn_concepts').delete().eq('path_id', pathId)
  if (error) {
    throw toReadableError(error)
  }
}

// --- Lerner-Modell laden / schreiben ---------------------------------------

export async function loadConceptStates(conceptIds: string[]): Promise<LearnerConceptState[]> {
  if (conceptIds.length === 0) {
    return []
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learner_concept_states')
    .select('concept_id, p_mastery, attempts, correct, outcome_history, decay_rate, last_seen_at, next_review_at')
    .in('concept_id', conceptIds)
  if (error) {
    throw toReadableError(error)
  }
  return (data ?? []).map(mapConceptStateRow)
}

/** Atomarer Batch-Upsert der clientseitig berechneten Konzept-Zustaende (RPC). */
export async function upsertConceptStates(userId: string, states: LearnerConceptState[]): Promise<number> {
  if (states.length === 0) {
    return 0
  }
  const supabase = getSupabaseClient()
  const payload = states.map((s) => ({
    concept_id: s.conceptId,
    p_mastery: s.pMastery,
    attempts: s.attempts,
    correct: s.correct,
    outcome_history: s.outcomeHistory,
    decay_rate: s.decayRate,
    last_seen_at: s.lastSeenAt,
    next_review_at: s.nextReviewAt,
  }))
  const { data, error } = await supabase.rpc('learn_upsert_concept_states', {
    p_user_id: userId,
    p_states: payload,
  })
  if (error) {
    throw toReadableError(error)
  }
  return typeof data === 'number' ? data : states.length
}

/** SR-Zustand einer Karte persistieren (RPC). */
export async function reviewCardState(userId: string, state: LearnerCardState): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('learn_review_card', {
    p_user_id: userId,
    p_card_id: state.cardId,
    p_sr_stage: state.srStage,
    p_easiness: state.easiness,
    p_interval_days: state.intervalDays,
    p_status: state.status,
    p_next_review_at: state.nextReviewAt,
  })
  if (error) {
    throw toReadableError(error)
  }
}
