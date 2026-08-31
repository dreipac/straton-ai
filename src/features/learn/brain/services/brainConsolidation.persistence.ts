/**
 * Persistenz der Konsolidierung (Kapitel 8 und 10).
 *
 * Vier Bereiche:
 *  - Ausloeser-Buchhaltung  (`learn_consolidation_state`, ueber RPCs)
 *  - Strukturvorschlaege    (`learn_structure_proposals`)
 *  - Protokoll mit Ruecknahme (`learn_structure_log`)
 *  - Fehlermuster           (`learn_error_patterns`)
 *
 * Die Protokollpflicht ist hier kein Nachgedanke: `applyStructureChange` schreibt den
 * Protokolleintrag, BEVOR die Aenderung angewandt wird. Ein Umbau, dessen Protokolleintrag
 * fehlschlaegt, findet damit gar nicht erst statt — die umgekehrte Reihenfolge koennte eine
 * Aenderung ohne Ruecknahmeanleitung hinterlassen, und genau das verbietet Kapitel 8.4.
 */

import { getSupabaseClient } from '../../../../integrations/supabase/client'
import type { ErrorPattern, StructureLogEntry, StructureProposal } from '../types'
import { assertLogEntryComplete, assertProposalSafe } from '../invariants'
import type { ConsolidationState } from '../consolidation/trigger'
import { toReadableError } from './brainErrors'

// ---------------------------------------------------------------------------
// Ausloeser
// ---------------------------------------------------------------------------

/** Das Gewicht einer neuen Beobachtung auf den Konsolidierungszaehler addieren. */
export async function addEvidenceWeight(args: {
  userId: string
  pathId: string
  weight: number
}): Promise<ConsolidationState> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('learn_brain_add_evidence_weight', {
    p_user_id: args.userId,
    p_path_id: args.pathId,
    p_weight: args.weight,
  })

  if (error) {
    throw toReadableError(error)
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
  return {
    pendingEvidenceWeight: Number(row?.pending_evidence_weight ?? 0),
    oldestPendingAt: typeof row?.oldest_pending_at === 'string' ? row.oldest_pending_at : null,
    lastRunAt: typeof row?.last_run_at === 'string' ? row.last_run_at : null,
    runCount: 0,
  }
}

export async function loadConsolidationState(args: {
  userId: string
  pathId: string
}): Promise<ConsolidationState> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_consolidation_state')
    .select('pending_evidence_weight, oldest_pending_at, last_run_at, run_count')
    .eq('user_id', args.userId)
    .eq('path_id', args.pathId)
    .maybeSingle()

  if (error) {
    throw toReadableError(error)
  }

  const row = data as Record<string, unknown> | null
  return {
    pendingEvidenceWeight: Number(row?.pending_evidence_weight ?? 0),
    oldestPendingAt: typeof row?.oldest_pending_at === 'string' ? row.oldest_pending_at : null,
    lastRunAt: typeof row?.last_run_at === 'string' ? row.last_run_at : null,
    runCount: Number(row?.run_count ?? 0),
  }
}

/** Einen Konsolidierungslauf abschliessen: Zaehler zuruecksetzen, Wartezeit neu starten. */
export async function finishConsolidation(args: {
  userId: string
  pathId: string
  summary: Record<string, unknown>
}): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('learn_brain_finish_consolidation', {
    p_user_id: args.userId,
    p_path_id: args.pathId,
    p_summary: args.summary,
  })

  if (error) {
    throw toReadableError(error)
  }
}

// ---------------------------------------------------------------------------
// Vorschlaege
// ---------------------------------------------------------------------------

function operationToDb(operation: StructureProposal['operation']): string {
  switch (operation) {
    case 'addEdge':
      return 'add_edge'
    case 'removeEdge':
      return 'remove_edge'
    case 'splitConcept':
      return 'split_concept'
    case 'mergeConcepts':
      return 'merge_concepts'
    case 'promotePattern':
      return 'promote_pattern'
    case 'mergePatterns':
      return 'merge_patterns'
  }
}

function operationFromDb(value: string): StructureProposal['operation'] {
  switch (value) {
    case 'add_edge':
      return 'addEdge'
    case 'remove_edge':
      return 'removeEdge'
    case 'split_concept':
      return 'splitConcept'
    case 'merge_concepts':
      return 'mergeConcepts'
    case 'promote_pattern':
      return 'promotePattern'
    default:
      return 'mergePatterns'
  }
}

/**
 * Einen Vorschlag anlegen.
 *
 * `assertProposalSafe` laeuft vor dem Schreiben. Der Datenbank-Constraint faengt denselben
 * Fehler ein zweites Mal ab — hier bekommt der Aufrufer aber eine Meldung, die die Invariante
 * beim Namen nennt, statt einer Constraint-Verletzung.
 */
export async function createProposal(proposal: StructureProposal): Promise<string> {
  assertProposalSafe(proposal)

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_structure_proposals')
    .insert({
      user_id: proposal.userId,
      path_id: proposal.pathId,
      operation: operationToDb(proposal.operation),
      payload: proposal.payload,
      evidence: proposal.evidence,
      question: proposal.question,
      rationale: proposal.rationale,
      requires_confirmation: proposal.requiresConfirmation,
      status: proposal.status === 'autoApplied' ? 'auto_applied' : proposal.status,
      surface_context: proposal.surfaceContext === 'mapReview' ? 'map_review' : 'session_start',
      expires_at: proposal.expiresAt,
    })
    .select('id')
    .single()

  if (error) {
    throw toReadableError(error)
  }
  return (data as { id: string }).id
}

/**
 * Offene Vorschlaege laden — nur fuer ruhige Stellen (Invariante I7).
 *
 * Der Aufrufer gibt an, WO er sie zeigen will. Es gibt keinen Kontext „waehrend der Sitzung":
 * Unterbrechungen im Lernfluss zerstoeren die Sitzung und werden reflexhaft weggeklickt.
 */
export async function loadPendingProposals(args: {
  userId: string
  pathId: string
  surfaceContext: 'sessionStart' | 'mapReview'
}): Promise<(StructureProposal & { id: string })[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_structure_proposals')
    .select(
      'id, user_id, path_id, operation, payload, evidence, question, rationale, requires_confirmation, ' +
        'status, surface_context, expires_at',
    )
    .eq('user_id', args.userId)
    .eq('path_id', args.pathId)
    .eq('status', 'pending')
    .eq('surface_context', args.surfaceContext === 'mapReview' ? 'map_review' : 'session_start')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })

  if (error) {
    throw toReadableError(error)
  }

  return (data ?? []).map((row) => {
    const r = row as unknown as Record<string, unknown>
    return {
      id: String(r.id),
      userId: String(r.user_id),
      pathId: String(r.path_id),
      operation: operationFromDb(String(r.operation)),
      payload: (r.payload ?? {}) as Record<string, unknown>,
      evidence: (r.evidence ?? {}) as Record<string, unknown>,
      question: typeof r.question === 'string' ? r.question : '',
      rationale: typeof r.rationale === 'string' ? r.rationale : '',
      requiresConfirmation: r.requires_confirmation === true,
      status: 'pending' as const,
      surfaceContext: r.surface_context === 'map_review' ? ('mapReview' as const) : ('sessionStart' as const),
      expiresAt: String(r.expires_at),
    }
  })
}

/** Die Antwort des Nutzers auf einen Vorschlag festhalten. */
export async function decideProposal(args: {
  proposalId: string
  status: 'accepted' | 'rejected'
}): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('learn_structure_proposals')
    .update({ status: args.status, decided_at: new Date().toISOString() })
    .eq('id', args.proposalId)

  if (error) {
    throw toReadableError(error)
  }
}

/** Abgelaufene Vorschlaege schliessen — bleibt eine Frage unbeantwortet, aendert sich nichts. */
export async function expireProposals(userId: string): Promise<number> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('learn_brain_expire_structure_proposals', { p_user_id: userId })

  if (error) {
    throw toReadableError(error)
  }
  return typeof data === 'number' ? data : 0
}

// ---------------------------------------------------------------------------
// Protokoll (Kapitel 8.4)
// ---------------------------------------------------------------------------

/**
 * Einen Strukturumbau protokollieren.
 *
 * Aufrufreihenfolge ist bindend: erst dieser Eintrag, dann die Aenderung. Der
 * Datenbank-Constraint auf `undo_payload` macht einen Eintrag ohne Ruecknahmeanleitung
 * unmoeglich — und damit einen Umbau ohne Ruecknahmemoeglichkeit.
 */
export async function recordStructureChange(entry: StructureLogEntry): Promise<string> {
  assertLogEntryComplete(entry)

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_structure_log')
    .insert({
      user_id: entry.userId,
      path_id: entry.pathId,
      proposal_id: entry.proposalId,
      operation: operationToDb(entry.operation),
      payload: entry.payload,
      evidence: entry.evidence,
      undo_payload: entry.undoPayload,
      destructive: entry.destructive,
      applied_at: entry.appliedAt,
    })
    .select('id')
    .single()

  if (error) {
    throw toReadableError(error)
  }
  return (data as { id: string }).id
}

/** Das Protokoll eines Pfads lesen — Grundlage der Ansicht „Was hat sich veraendert?". */
export async function loadStructureLog(args: {
  pathId: string
  limit?: number
}): Promise<(StructureLogEntry & { id: string })[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_structure_log')
    .select(
      'id, user_id, path_id, proposal_id, operation, payload, evidence, undo_payload, destructive, applied_at, reverted_at',
    )
    .eq('path_id', args.pathId)
    .order('applied_at', { ascending: false })
    .limit(args.limit ?? 100)

  if (error) {
    throw toReadableError(error)
  }

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: String(r.id),
      userId: String(r.user_id),
      pathId: String(r.path_id),
      proposalId: typeof r.proposal_id === 'string' ? r.proposal_id : null,
      operation: operationFromDb(String(r.operation)),
      payload: (r.payload ?? {}) as Record<string, unknown>,
      evidence: (r.evidence ?? {}) as Record<string, unknown>,
      undoPayload: (r.undo_payload ?? {}) as Record<string, unknown>,
      destructive: r.destructive === true,
      appliedAt: String(r.applied_at),
      revertedAt: typeof r.reverted_at === 'string' ? r.reverted_at : null,
    }
  })
}

/** Einen Protokolleintrag als zurueckgenommen markieren. */
export async function markReverted(logId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('learn_structure_log')
    .update({ reverted_at: new Date().toISOString() })
    .eq('id', logId)

  if (error) {
    throw toReadableError(error)
  }
}

// ---------------------------------------------------------------------------
// Fehlermuster (Kapitel 10)
// ---------------------------------------------------------------------------

function mapPatternRow(row: Record<string, unknown>): ErrorPattern {
  const scope = row.scope === 'generic' ? 'generic' : row.scope === 'domain_specific' ? 'domainSpecific' : 'unknown'
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    kind: row.kind as ErrorPattern['kind'],
    object: typeof row.object === 'string' ? row.object : '',
    scope,
    subjects: Array.isArray(row.subjects) ? (row.subjects as string[]) : [],
    distinctConceptCount: Number(row.distinct_concept_count ?? 0),
    occurrenceCount: Number(row.occurrence_count ?? 0),
    distinctDayCount: Number(row.distinct_day_count ?? 0),
    surfaced: row.surfaced === true,
    userDisputed: row.user_disputed === true,
    mergedIntoId: typeof row.merged_into_id === 'string' ? row.merged_into_id : null,
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
  }
}

export async function loadErrorPatterns(userId: string): Promise<ErrorPattern[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_error_patterns')
    .select(
      'id, user_id, name, kind, object, scope, subjects, distinct_concept_count, occurrence_count, ' +
        'distinct_day_count, surfaced, user_disputed, merged_into_id, first_seen_at, last_seen_at',
    )
    .eq('user_id', userId)
    .order('occurrence_count', { ascending: false })

  if (error) {
    throw toReadableError(error)
  }
  return (data ?? []).map((row) => mapPatternRow(row as unknown as Record<string, unknown>))
}

/**
 * Ein Muster anlegen oder fortschreiben.
 *
 * Der Name wird beim Fortschreiben NICHT mitgeschickt (Invariante I12). Ein einmal vergebener
 * Name aendert sich nur ueber eine protokollierte Verschmelzung — deshalb greift der Upsert
 * ueber `(user_id, name)` und laesst den Namen selbst unberuehrt.
 */
export async function upsertErrorPattern(pattern: ErrorPattern): Promise<string> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_error_patterns')
    .upsert(
      {
        user_id: pattern.userId,
        name: pattern.name,
        kind: pattern.kind,
        object: pattern.object,
        scope: pattern.scope === 'domainSpecific' ? 'domain_specific' : pattern.scope,
        subjects: pattern.subjects,
        distinct_concept_count: pattern.distinctConceptCount,
        occurrence_count: pattern.occurrenceCount,
        distinct_day_count: pattern.distinctDayCount,
        surfaced: pattern.surfaced,
        surfaced_at: pattern.surfaced ? new Date().toISOString() : null,
        last_seen_at: pattern.lastSeenAt,
      },
      { onConflict: 'user_id,name' },
    )
    .select('id')
    .single()

  if (error) {
    throw toReadableError(error)
  }
  return (data as { id: string }).id
}

/** Beobachtungen einem Muster zuordnen. */
export async function attachObservationsToPattern(args: {
  observationIds: string[]
  patternId: string
}): Promise<void> {
  if (args.observationIds.length === 0) {
    return
  }
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('learn_error_observations')
    .update({ pattern_id: args.patternId })
    .in('id', args.observationIds)

  if (error) {
    throw toReadableError(error)
  }
}

/**
 * Zustimmung des Nutzers zu einem Muster („Kommt hin", UI-Spezifikation 3.7).
 *
 * Das Muster bleibt bestehen und wird weiter benutzt — es hoert nur auf, sich zu melden. Die
 * Anzeigeschwelle ist der Punkt, an dem das Gehirn eine Beobachtung AUSSPRICHT (Kapitel 10);
 * ausgesprochen und bestaetigt ist sie danach gesagt. Sie beim naechsten Oeffnen des Pfads erneut
 * zu zeigen waere kein Hinweis mehr, sondern eine Ermahnung.
 *
 * Der Unterschied zum Widerspruch bleibt in den Daten lesbar: hier steht `user_disputed` weiter
 * auf falsch. Ein bestaetigtes Muster ist bestaetigte Diagnose, ein bestrittenes ist ein Signal
 * ueber die Diagnose.
 */
export async function acknowledgePattern(patternId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('learn_error_patterns')
    .update({ surfaced: false })
    .eq('id', patternId)

  if (error) {
    throw toReadableError(error)
  }
}

/**
 * Widerspruch des Nutzers zu einem Muster festhalten.
 *
 * Der Widerspruch ist selbst ein wertvolles Signal (Kapitel 10, Tonalitaet) — das Muster wird
 * nicht geloescht, sondern markiert. Geloescht waere die Information weg; markiert bleibt sie
 * als Beobachtung ueber die Beobachtung.
 */
export async function disputePattern(patternId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('learn_error_patterns')
    .update({ user_disputed: true, surfaced: false })
    .eq('id', patternId)

  if (error) {
    throw toReadableError(error)
  }
}
