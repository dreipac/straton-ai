/**
 * Persistenz der unterbrochenen Sitzung.
 *
 * Wer die Seite verlaesst, soll beim Wiederkommen an derselben Aufgabe stehen — nicht vor einer
 * neu erzeugten. Ohne das kostet jeder Seitenwechsel den ganzen Plan: die Person wartet erneut,
 * und der Betreiber zahlt dieselben Modellaufrufe ein zweites Mal.
 *
 * Zur Abgrenzung von der Echtzeitregel (Kapitel 7.1) siehe die Migration
 * `20260830120000_learn_brain_session.sql`: hier entsteht nichts im Voraus, hier wird nur nichts
 * weggeworfen.
 *
 * ## Zwei Haltungen, und beide sind Absicht
 *
 * **Schreiben scheitert lautlos.** Ein fehlgeschlagenes Speichern darf eine laufende Sitzung nie
 * stoeren; im schlimmsten Fall gilt wieder das Verhalten von vorher. Auch eine noch nicht
 * eingespielte Migration faellt darunter — dann fehlt die Tabelle, jeder Schreibvorgang scheitert,
 * und die Sitzung laeuft trotzdem.
 *
 * **Lesen ist misstrauisch.** Ein unvollstaendiger oder ueberholter Datensatz wird verworfen statt
 * repariert (`parseStoredSession` gibt dann `null`). Der Rueckfall ist eine frische Sitzung — das
 * ist genau das bisherige Verhalten und damit immer sicher. Eine halb wiederhergestellte Sitzung
 * waere es nicht: sie koennte einen Plan mit geloeschten Konzepten oder eine Aufgabe ohne
 * Musterloesung zeigen.
 */

import { getSupabaseClient } from '../../../../integrations/supabase/client'
import type { EvidenceEvent, GeneratedTask, LearnerConceptImage, PlannedTask } from '../types'
import { toReadableError } from './brainErrors'

/**
 * Wie lange eine unterbrochene Sitzung fortsetzbar bleibt.
 *
 * Es braucht eine Grenze, weil der Plan aus dem Lernerbild eines bestimmten Augenblicks stammt.
 * Nach Wochen hat sich dieses Bild bewegt — durch Wiederholungen, durch andere Sitzungen, durch
 * den Verfall —, und der alte Plan waere dann nicht mehr die Antwort auf die Frage „was ist
 * jetzt dran". Sieben Tage sind bewusst grosszuegig: der Verlust der eigenen Position aergert
 * spuerbar, drei etwas schlechter gewaehlte Aufgaben kaum. Wer laenger weg war, faengt neu an.
 */
export const RESUMABLE_FOR_DAYS = 7

export type StoredBrainSession = {
  plan: PlannedTask[]
  /** Die bereits freigegebenen Aufgaben je Platz. */
  tasks: Map<number, GeneratedTask>
  currentIndex: number
  imagesBefore: Map<string, LearnerConceptImage>
  events: EvidenceEvent[]
  startedAt: string
}

type SessionRow = {
  plan: unknown
  tasks: unknown
  current_index: number
  images_before: unknown
  events: unknown
  started_at: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Ein Planeintrag ist brauchbar, wenn er die Felder traegt, die die Sitzung tatsaechlich liest.
 *
 * Bewusst nur diese: `urgencyBreakdown` etwa dient der Nachvollziehbarkeit und wird nirgends
 * ausgewertet — an einem fehlenden Debugfeld eine sonst vollstaendige Sitzung scheitern zu
 * lassen, waere die falsche Strenge.
 */
function isPlannedTask(value: unknown): value is PlannedTask {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.conceptId === 'string' &&
    value.conceptId.length > 0 &&
    typeof value.depth === 'string' &&
    typeof value.format === 'string' &&
    typeof value.reason === 'string'
  )
}

/** Dasselbe fuer eine erzeugte Aufgabe: ohne Fragetext und Musterloesung ist sie unbrauchbar. */
function isGeneratedTask(value: unknown): value is GeneratedTask {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.conceptId === 'string' &&
    typeof value.format === 'string' &&
    typeof value.prompt === 'string' &&
    value.prompt.trim().length > 0 &&
    typeof value.expectedAnswer === 'string'
  )
}

function parseTasks(value: unknown, planLength: number): Map<number, GeneratedTask> {
  const tasks = new Map<number, GeneratedTask>()
  if (!isRecord(value)) {
    return tasks
  }
  for (const [key, entry] of Object.entries(value)) {
    const index = Number(key)
    if (Number.isInteger(index) && index >= 0 && index < planLength && isGeneratedTask(entry)) {
      tasks.set(index, entry)
    }
  }
  return tasks
}

function parseImages(value: unknown): Map<string, LearnerConceptImage> {
  const images = new Map<string, LearnerConceptImage>()
  if (!Array.isArray(value)) {
    return images
  }
  for (const entry of value) {
    if (isRecord(entry) && typeof entry.conceptId === 'string') {
      images.set(entry.conceptId, entry as unknown as LearnerConceptImage)
    }
  }
  return images
}

function parseEvents(value: unknown): EvidenceEvent[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((entry): entry is EvidenceEvent => isRecord(entry) && typeof entry.conceptId === 'string')
}

/**
 * Eine gespeicherte Zeile in eine fortsetzbare Sitzung uebersetzen — oder `null`.
 *
 * Rein und ohne Netz, damit die Bedingungen einzeln pruefbar sind. `null` heisst immer dasselbe:
 * frisch anfangen.
 */
export function parseStoredSession(row: SessionRow, nowIso: string): StoredBrainSession | null {
  if (!Array.isArray(row.plan)) {
    return null
  }
  const plan = row.plan.filter(isPlannedTask)
  // Ein teilweise unlesbarer Plan waere ein ANDERER Plan als der festgeschriebene — die Segment-
  // leiste zeigte dann eine falsche Gesamtzahl, und „3 von 5" waere gelogen (Kapitel 4.2).
  if (plan.length === 0 || plan.length !== row.plan.length) {
    return null
  }

  const currentIndex = Number(row.current_index)
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= plan.length) {
    return null
  }

  const startedAt = Date.parse(row.started_at)
  if (!Number.isFinite(startedAt)) {
    return null
  }
  const ageDays = (Date.parse(nowIso) - startedAt) / 86_400_000
  if (!Number.isFinite(ageDays) || ageDays > RESUMABLE_FOR_DAYS) {
    return null
  }

  return {
    plan,
    tasks: parseTasks(row.tasks, plan.length),
    currentIndex,
    imagesBefore: parseImages(row.images_before),
    events: parseEvents(row.events),
    startedAt: row.started_at,
  }
}

/** Die offene Sitzung eines Pfads laden. `null`, wenn keine fortsetzbare vorliegt. */
export async function loadBrainSession(args: {
  userId: string
  pathId: string
  nowIso: string
}): Promise<StoredBrainSession | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_brain_session')
    .select('plan, tasks, current_index, images_before, events, started_at')
    .eq('user_id', args.userId)
    .eq('path_id', args.pathId)
    .maybeSingle()

  if (error) {
    throw toReadableError(error)
  }
  return data ? parseStoredSession(data as SessionRow, args.nowIso) : null
}

/**
 * Den Stand der Sitzung festhalten.
 *
 * Schreibt immer den vollstaendigen Stand, nie eine Teilaenderung: die Zeile ist als Ganzes
 * entweder der Stand der Sitzung oder nichts. Ein zusammengesetzter Stand aus zwei Schreibvorgaengen
 * koennte einen Plan mit einer Position aus einem anderen Plan enthalten.
 */
export async function saveBrainSession(args: {
  userId: string
  pathId: string
  plan: PlannedTask[]
  tasks: Map<number, GeneratedTask>
  currentIndex: number
  imagesBefore: Map<string, LearnerConceptImage>
  events: EvidenceEvent[]
  startedAt: string
}): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('learn_brain_session').upsert(
    {
      user_id: args.userId,
      path_id: args.pathId,
      plan: args.plan,
      tasks: Object.fromEntries([...args.tasks].map(([index, task]) => [String(index), task])),
      current_index: args.currentIndex,
      images_before: [...args.imagesBefore.values()],
      events: args.events,
      started_at: args.startedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,path_id' },
  )

  if (error) {
    throw toReadableError(error)
  }
}

/** Die offene Sitzung verwerfen — nach Abschluss oder Abbruch. */
export async function clearBrainSession(args: { userId: string; pathId: string }): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('learn_brain_session')
    .delete()
    .eq('user_id', args.userId)
    .eq('path_id', args.pathId)

  if (error) {
    throw toReadableError(error)
  }
}
