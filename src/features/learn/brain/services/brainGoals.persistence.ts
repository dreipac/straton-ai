/**
 * Persistenz der Ziele (Kapitel 6.3).
 *
 * Ein Ziel ist nur dann eines, wenn es alle drei Angaben traegt: Termin, Umfang, verfuegbare
 * Zeit. Die Datenbank erzwingt das ueber NOT NULL auf `due_at` und `minutes_per_day`; der
 * leere Umfang bleibt zulaessig, weil ein Ziel angelegt und der Umfang danach zusammengestellt
 * werden darf — ein Ziel ohne Umfang meldet dann schlicht keine Dringlichkeit.
 *
 * Hoechstens EIN aktives Ziel pro Pfad (Teilindex in der Migration). Mit zwei aktiven Zielen
 * waere „Ziel uebersteuert" mehrdeutig.
 */

import { getSupabaseClient } from '../../../../integrations/supabase/client'
import type { LearningGoal } from '../types'
import { toReadableError } from './brainErrors'

type GoalRow = {
  id: string
  user_id: string
  path_id: string
  title: string | null
  due_at: string
  concept_ids: string[] | null
  minutes_per_day: number
  status: string
}

function mapGoalRow(row: GoalRow): LearningGoal {
  const status =
    row.status === 'achieved' || row.status === 'expired' || row.status === 'cancelled' ? row.status : 'active'
  return {
    id: row.id,
    userId: row.user_id,
    pathId: row.path_id,
    title: row.title ?? '',
    dueAt: row.due_at,
    conceptIds: row.concept_ids ?? [],
    minutesPerDay: row.minutes_per_day,
    status,
  }
}

/** Das aktive Ziel eines Pfads, falls eines gesetzt ist. */
export async function loadActiveGoal(pathId: string): Promise<LearningGoal | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_goals')
    .select('id, user_id, path_id, title, due_at, concept_ids, minutes_per_day, status')
    .eq('path_id', pathId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    throw toReadableError(error)
  }
  return data ? mapGoalRow(data as GoalRow) : null
}

/**
 * Ein Ziel setzen.
 *
 * Ein bereits aktives Ziel desselben Pfads wird zuvor abgeschlossen — sonst schlaegt der
 * Teilindex zu. Fachlich ist das richtig: wer ein neues Ziel setzt, hat das alte aufgegeben,
 * und beide gleichzeitig aktiv zu halten waere eine stillschweigende Doppelplanung.
 */
export async function setGoal(args: {
  userId: string
  pathId: string
  title: string
  dueAt: string
  conceptIds: string[]
  minutesPerDay: number
}): Promise<LearningGoal> {
  const supabase = getSupabaseClient()

  const { error: closeError } = await supabase
    .from('learn_goals')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('path_id', args.pathId)
    .eq('status', 'active')

  if (closeError) {
    throw toReadableError(closeError)
  }

  const { data, error } = await supabase
    .from('learn_goals')
    .insert({
      user_id: args.userId,
      path_id: args.pathId,
      title: args.title,
      due_at: args.dueAt,
      concept_ids: args.conceptIds,
      minutes_per_day: args.minutesPerDay,
      status: 'active',
    })
    .select('id, user_id, path_id, title, due_at, concept_ids, minutes_per_day, status')
    .single()

  if (error) {
    throw toReadableError(error)
  }
  return mapGoalRow(data as GoalRow)
}

/** Umfang oder verfuegbare Zeit eines laufenden Ziels anpassen. */
export async function updateGoalScope(args: {
  goalId: string
  conceptIds?: string[]
  minutesPerDay?: number
  dueAt?: string
}): Promise<void> {
  const supabase = getSupabaseClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (args.conceptIds) {
    patch.concept_ids = args.conceptIds
  }
  if (typeof args.minutesPerDay === 'number') {
    patch.minutes_per_day = args.minutesPerDay
  }
  if (args.dueAt) {
    patch.due_at = args.dueAt
  }

  const { error } = await supabase.from('learn_goals').update(patch).eq('id', args.goalId)
  if (error) {
    throw toReadableError(error)
  }
}

/** Ein Ziel abschliessen. */
export async function closeGoal(goalId: string, status: 'achieved' | 'expired' | 'cancelled'): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('learn_goals')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', goalId)

  if (error) {
    throw toReadableError(error)
  }
}
