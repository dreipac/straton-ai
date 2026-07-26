/**
 * Persistenz des Session-Zustands (Schicht 7): der aktive Cursor je (User x Pfad).
 *
 * Client-Anbindung an public.learn_session_state (Migration 20260725140000). Anders als die
 * learner_*-Zustaende (RPC-geschrieben) ist dies ein einfacher Nutzer-Cursor → direkter Upsert via RLS.
 * Muster (Supabase-Client, toReadableError) analog `learnConceptGraph.persistence.ts`.
 */

import { getSupabaseClient } from '../../../integrations/supabase/client'

function toReadableError(error: unknown): Error {
  if (!error || typeof error !== 'object') {
    return new Error('Unbekannter Supabase-Fehler.')
  }
  const c = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
  const parts = [
    typeof c.message === 'string' ? c.message : '',
    typeof c.details === 'string' ? c.details : '',
    typeof c.hint === 'string' ? c.hint : '',
    typeof c.code === 'string' ? `Code: ${c.code}` : '',
  ].filter(Boolean)
  return new Error(parts.join(' | ') || 'Supabase-Anfrage fehlgeschlagen.')
}

export type SessionState = {
  /** Ordinal des aktiven Themas (0-basiert) oder null. */
  activeTopicOrdinal: number | null
  /** Ordinal des aktiven Zwischenschritts (0-basiert) oder null (Einstiegscheck-Ebene). */
  activeStepOrdinal: number | null
  /** Grobe Session-Phase. */
  phase: string
  /** Feinkoernige Position innerhalb eines Schritts (z. B. Karten-/Frage-Index). */
  position: number
  lastActivityAt: string | null
}

type SessionStateRow = {
  active_topic_ordinal: number | null
  active_step_ordinal: number | null
  phase: string | null
  position: number | null
  last_activity_at: string | null
}

function mapRow(row: SessionStateRow): SessionState {
  return {
    activeTopicOrdinal: row.active_topic_ordinal,
    activeStepOrdinal: row.active_step_ordinal,
    phase: row.phase ?? 'landing',
    position: row.position ?? 0,
    lastActivityAt: row.last_activity_at,
  }
}

/** Laedt den gespeicherten Cursor eines Pfads, oder null wenn noch keiner existiert. */
export async function loadSessionState(pathId: string): Promise<SessionState | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_session_state')
    .select('active_topic_ordinal, active_step_ordinal, phase, position, last_activity_at')
    .eq('path_id', pathId)
    .maybeSingle()
  if (error) {
    throw toReadableError(error)
  }
  return data ? mapRow(data as SessionStateRow) : null
}

/** Upsert des Cursors (last-write-wins, Single-User-App). Setzt last_activity_at/updated_at auf jetzt. */
export async function saveSessionState(userId: string, pathId: string, state: SessionState): Promise<void> {
  const supabase = getSupabaseClient()
  const nowIso = new Date().toISOString()
  const { error } = await supabase.from('learn_session_state').upsert(
    {
      user_id: userId,
      path_id: pathId,
      active_topic_ordinal: state.activeTopicOrdinal,
      active_step_ordinal: state.activeStepOrdinal,
      phase: state.phase,
      position: state.position,
      last_activity_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: 'user_id,path_id' },
  )
  if (error) {
    throw toReadableError(error)
  }
}

/** Loescht den Cursor eines Pfads (z. B. bei Reset). */
export async function deleteSessionState(pathId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('learn_session_state').delete().eq('path_id', pathId)
  if (error) {
    throw toReadableError(error)
  }
}
