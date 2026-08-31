/**
 * Persistenz des Gedaechtnisses (Kapitel 4 und 11).
 *
 * Zwei getrennte Ebenen, streng getrennt gehalten (Invariante I10):
 *  - Wissensgraph  — `learn_concepts` / `learn_concept_edges`, ohne Personenbezug.
 *  - Lernerbild    — `learner_concept_brain_states`, ausschliesslich ueber die RPC beschrieben.
 *
 * Dazu die feste Pfadreihenfolge aus `learn_path_order`.
 *
 * Die Trennung ist nicht bloss eine Konvention dieser Datei: die Ladefunktionen des Graphen
 * geben keine Leistungsdaten zurueck, und die des Lernerbilds geben keine Struktur zurueck.
 * Genau das haelt die Tuer fuer einen spaeter geteilten Strukturlayer offen.
 */

import { getSupabaseClient } from '../../../../integrations/supabase/client'
import type {
  BrainConcept,
  BrainPrerequisiteEdge,
  ConceptOrigin,
  DepthEvidence,
  EdgeOrigin,
  LearnerConceptImage,
  PathOrderEntry,
} from '../types'
import { toReadableError } from './brainErrors'

// ---------------------------------------------------------------------------
// Wissensgraph — ohne Personenbezug (I10)
// ---------------------------------------------------------------------------

type ConceptRow = {
  id: string
  path_id: string
  slug: string
  name: string
  description: string | null
  difficulty: number
  origin: string | null
  source_ref: unknown
  source_quote: string | null
  ordinal: number
}

/**
 * Herkunft aus der Datenbank lesen.
 *
 * Der Auffangwert ist `unknown`, NICHT `material`: eine Zeile ohne belegte Herkunft als
 * Materialherkunft zu fuehren, hiesse eine Quelle zu behaupten, die niemand nachweisen kann —
 * genau das verbietet Invariante I4.
 */
function parseOrigin(value: unknown): ConceptOrigin {
  if (value === 'material') return 'material'
  if (value === 'ai_supplement') return 'aiSupplement'
  if (value === 'user') return 'user'
  return 'unknown'
}

function originToDb(origin: ConceptOrigin): string {
  return origin === 'aiSupplement' ? 'ai_supplement' : origin
}

function mapConceptRow(row: ConceptRow): BrainConcept {
  const ref = (row.source_ref && typeof row.source_ref === 'object' ? row.source_ref : {}) as Record<string, unknown>
  return {
    id: row.id,
    pathId: row.path_id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? '',
    difficulty: row.difficulty,
    origin: parseOrigin(row.origin),
    sourceRef: {
      doc: typeof ref.doc === 'string' ? ref.doc : undefined,
      section: typeof ref.section === 'string' ? ref.section : undefined,
      pageFrom: typeof ref.pageFrom === 'number' ? ref.pageFrom : undefined,
      pageTo: typeof ref.pageTo === 'number' ? ref.pageTo : undefined,
    },
    sourceQuote: row.source_quote ?? '',
    ordinal: row.ordinal,
  }
}

type EdgeRow = {
  id: string
  path_id: string
  from_concept_id: string
  to_concept_id: string
  type: string
  origin: string | null
}

function mapEdgeRow(row: EdgeRow): BrainPrerequisiteEdge {
  const origin = row.origin === 'consolidator' || row.origin === 'user' ? (row.origin as EdgeOrigin) : 'cartographer'
  return {
    id: row.id,
    pathId: row.path_id,
    fromConceptId: row.from_concept_id,
    toConceptId: row.to_concept_id,
    origin,
  }
}

/**
 * Den Wissensgraphen eines Pfads laden.
 *
 * Nur `prerequisite`-Kanten. Die Tabelle kennt aus der bestehenden Architektur auch `related`
 * und `opposite`; das Gehirn arbeitet ausschliesslich auf Voraussetzungen, weil nur eine
 * gerichtete Abhaengigkeit Ursachenforschung erlaubt (Kapitel 4.1). Andere Kantentypen hier
 * mitzuladen wuerde die Propagation in Richtungen schicken, fuer die sie nicht gedacht ist.
 */
export async function loadKnowledgeGraph(
  pathId: string,
): Promise<{ concepts: BrainConcept[]; edges: BrainPrerequisiteEdge[] }> {
  const supabase = getSupabaseClient()

  const [conceptsResult, edgesResult] = await Promise.all([
    supabase
      .from('learn_concepts')
      .select('id, path_id, slug, name, description, difficulty, origin, source_ref, source_quote, ordinal')
      .eq('path_id', pathId)
      .order('ordinal', { ascending: true }),
    supabase
      .from('learn_concept_edges')
      .select('id, path_id, from_concept_id, to_concept_id, type, origin')
      .eq('path_id', pathId)
      .eq('type', 'prerequisite'),
  ])

  if (conceptsResult.error) {
    throw toReadableError(conceptsResult.error)
  }
  if (edgesResult.error) {
    throw toReadableError(edgesResult.error)
  }

  return {
    concepts: ((conceptsResult.data ?? []) as ConceptRow[]).map(mapConceptRow),
    edges: ((edgesResult.data ?? []) as EdgeRow[]).map(mapEdgeRow),
  }
}

/**
 * Die Herkunftsmarkierung eines Konzepts setzen (I4) — etwa nach einer Handkorrektur.
 *
 * `unknown` laesst sich nicht setzen: der Wert entsteht nur aus Altbestand, er wird nie vergeben.
 * `material` ohne Beleg wird abgelehnt, bevor die Datenbank es tut — dieselbe Regel, die der
 * Kartografenvertrag durchsetzt, gilt fuer die Handkorrektur genauso.
 */
export async function setConceptOrigin(conceptId: string, origin: ConceptOrigin, sourceQuote = ''): Promise<void> {
  if (origin === 'unknown') {
    throw new Error('Die Herkunft „unbelegt" laesst sich nicht vergeben — sie entsteht nur aus Altbestand.')
  }
  if (origin === 'material' && sourceQuote.trim().length === 0) {
    throw new Error('Materialherkunft ohne Beleg (Invariante I4): bitte die Stelle im Quelldokument angeben.')
  }

  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('learn_concepts')
    .update({ origin: originToDb(origin), source_quote: sourceQuote })
    .eq('id', conceptId)

  if (error) {
    throw toReadableError(error)
  }
}

/** Eine Voraussetzungskante anlegen. Umkehrbare Operation — kein Bestaetigungsdialog noetig. */
export async function addPrerequisiteEdge(args: {
  pathId: string
  fromConceptId: string
  toConceptId: string
  origin: EdgeOrigin
}): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('learn_concept_edges').insert({
    path_id: args.pathId,
    from_concept_id: args.fromConceptId,
    to_concept_id: args.toConceptId,
    type: 'prerequisite',
    origin: args.origin,
  })

  if (error) {
    throw toReadableError(error)
  }
}

/** Eine Voraussetzungskante entfernen. */
export async function removePrerequisiteEdge(args: {
  fromConceptId: string
  toConceptId: string
}): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('learn_concept_edges')
    .delete()
    .eq('from_concept_id', args.fromConceptId)
    .eq('to_concept_id', args.toConceptId)
    .eq('type', 'prerequisite')

  if (error) {
    throw toReadableError(error)
  }
}

// ---------------------------------------------------------------------------
// Lernerbild — ohne Struktur (I10)
// ---------------------------------------------------------------------------

type ImageRow = {
  concept_id: string
  mastery: number
  confidence: number
  depth: string
  depth_evidence: unknown
  direct_evidence_count: number
  direct_evidence_weight: number
  propagation_confidence_penalty: number
  review_needed: boolean
  review_reason: string | null
  decay_rate: number
  cold_start: boolean
  ever_consolidated: boolean | null
  last_direct_evidence_at: string | null
  last_seen_at: string | null
  next_review_at: string | null
}

function parseDepthEvidence(value: unknown): DepthEvidence {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const out: DepthEvidence = {}
  for (const depth of ['recognize', 'apply', 'transfer'] as const) {
    const entry = (value as Record<string, unknown>)[depth]
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>
      out[depth] = {
        attempts: Number.isFinite(Number(e.attempts)) ? Number(e.attempts) : 0,
        correct: Number.isFinite(Number(e.correct)) ? Number(e.correct) : 0,
      }
    }
  }
  return out
}

function mapImageRow(row: ImageRow): LearnerConceptImage {
  const depth = row.depth === 'apply' || row.depth === 'transfer' ? row.depth : 'recognize'
  return {
    conceptId: row.concept_id,
    mastery: row.mastery,
    confidence: row.confidence,
    depth,
    depthEvidence: parseDepthEvidence(row.depth_evidence),
    directEvidenceCount: row.direct_evidence_count,
    directEvidenceWeight: row.direct_evidence_weight,
    propagationConfidencePenalty: row.propagation_confidence_penalty,
    reviewNeeded: row.review_needed,
    reviewReason: row.review_reason ?? '',
    decayRate: row.decay_rate,
    coldStart: row.cold_start,
    everConsolidated: row.ever_consolidated ?? false,
    lastDirectEvidenceAt: row.last_direct_evidence_at,
    lastSeenAt: row.last_seen_at,
    nextReviewAt: row.next_review_at,
  }
}

/** Das Lernerbild fuer eine Menge von Konzepten laden. */
export async function loadLearnerImages(conceptIds: string[]): Promise<Map<string, LearnerConceptImage>> {
  if (conceptIds.length === 0) {
    return new Map()
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learner_concept_brain_states')
    .select(
      'concept_id, mastery, confidence, depth, depth_evidence, direct_evidence_count, direct_evidence_weight, ' +
        'propagation_confidence_penalty, review_needed, review_reason, decay_rate, cold_start, ' +
        'ever_consolidated, last_direct_evidence_at, last_seen_at, next_review_at',
    )
    .in('concept_id', conceptIds)

  if (error) {
    throw toReadableError(error)
  }

  const images = new Map<string, LearnerConceptImage>()
  for (const row of (data ?? []) as unknown as ImageRow[]) {
    images.set(row.concept_id, mapImageRow(row))
  }
  return images
}

/**
 * Lernerbilder atomar upserten.
 *
 * Immer der ganze Satz aus einem Wahrnehmungsschritt auf einmal: das bewertete Konzept UND die
 * per Propagation angepassten Nachbarn. Getrennte Schreibvorgaenge koennten dazwischen abbrechen
 * und einen Zustand hinterlassen, in dem der Zweifel gesetzt, die Evidenz aber verloren ist.
 */
export async function upsertLearnerImages(
  userId: string,
  images: LearnerConceptImage[],
): Promise<number> {
  if (images.length === 0) {
    return 0
  }

  const supabase = getSupabaseClient()
  const payload = images.map((image) => ({
    concept_id: image.conceptId,
    mastery: image.mastery,
    confidence: image.confidence,
    depth: image.depth,
    depth_evidence: image.depthEvidence,
    direct_evidence_count: image.directEvidenceCount,
    direct_evidence_weight: image.directEvidenceWeight,
    propagation_confidence_penalty: image.propagationConfidencePenalty,
    review_needed: image.reviewNeeded,
    review_reason: image.reviewReason,
    decay_rate: image.decayRate,
    cold_start: image.coldStart,
    ever_consolidated: image.everConsolidated,
    last_direct_evidence_at: image.lastDirectEvidenceAt,
    last_seen_at: image.lastSeenAt,
    next_review_at: image.nextReviewAt,
  }))

  const { data, error } = await supabase.rpc('learn_brain_upsert_concept_states', {
    p_user_id: userId,
    p_states: payload,
  })

  if (error) {
    throw toReadableError(error)
  }
  return typeof data === 'number' ? data : images.length
}

// ---------------------------------------------------------------------------
// Pfadreihenfolge (Kapitel 11)
// ---------------------------------------------------------------------------

type PathOrderRow = {
  concept_id: string
  position: number | string
  kind: string
  insert_reason: string | null
}

export async function loadPathOrder(pathId: string): Promise<PathOrderEntry[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_path_order')
    .select('concept_id, position, kind, insert_reason')
    .eq('path_id', pathId)
    .order('position', { ascending: true })

  if (error) {
    throw toReadableError(error)
  }

  return ((data ?? []) as PathOrderRow[]).map((row) => ({
    conceptId: row.concept_id,
    // numeric kommt als String zurueck, sobald die Praezision die von double uebersteigt.
    position: typeof row.position === 'number' ? row.position : Number(row.position),
    kind: row.kind === 'insert' ? 'insert' : 'base',
    insertReason: row.insert_reason ?? '',
  }))
}

/** Die Pfadreihenfolge in einem Rutsch ersetzen (RPC, transaktional). */
export async function savePathOrder(pathId: string, entries: PathOrderEntry[]): Promise<number> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('learn_brain_replace_path_order', {
    p_path_id: pathId,
    p_entries: entries.map((entry) => ({
      concept_id: entry.conceptId,
      position: entry.position,
      kind: entry.kind,
      insert_reason: entry.insertReason,
    })),
  })

  if (error) {
    throw toReadableError(error)
  }
  return typeof data === 'number' ? data : entries.length
}
