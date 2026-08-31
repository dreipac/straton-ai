/**
 * Persistenz der Wahrnehmung (Kapitel 5) und der Planerentscheidungen (Kapitel 6).
 *
 * Drei Tabellen:
 *  - `learn_evidence_events`     jede Beobachtung mit Teilpunkten, Zuversicht und den tatsaechlich
 *                                angewandten Deltas.
 *  - `learn_error_observations`  die halbstrukturierte Fehlerursache mit ihrer Herkunft.
 *  - `learn_task_log`            welche Aufgabe warum ausgespielt wurde (Invariante I8).
 *
 * Die Deltas werden mitgeschrieben, obwohl sie sich aus dem Zustand ergeben. Sie sind die
 * einzige Moeglichkeit, im Nachhinein nachzuweisen, dass die Invarianten I1 und I2 gehalten
 * haben — ein Lernerbild allein zeigt nur das Ergebnis, nicht wodurch es entstand.
 */

import { getSupabaseClient } from '../../../../integrations/supabase/client'
import type { ErrorCause, EvidenceEvent, PlannedTask, TaskFormat } from '../types'
// Reine Katalogabfrage aus `production/formats.ts` — kein Zustand, kein IO. Bewusst importiert
// statt die neun Formatnamen hier ein zweites Mal aufzuschreiben: zwei Listen laufen auseinander.
import { isKnownTaskFormat } from '../production/formats'
import { toReadableError } from './brainErrors'

function sourceToDb(source: EvidenceEvent['source']): string {
  return source === 'gradedTask' ? 'graded_task' : 'chat'
}

/**
 * Ein Evidenzereignis schreiben und seine Id zurueckgeben.
 *
 * Die Id wird gebraucht, um die Fehlerbeobachtung und den Eintrag im Aufgabenprotokoll daran zu
 * haengen — erst diese Verkettung macht spaeter nachvollziehbar, welche Bewertung zu welcher
 * ausgespielten Aufgabe gehoerte.
 */
export async function recordEvidenceEvent(event: EvidenceEvent): Promise<string> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_evidence_events')
    .insert({
      user_id: event.userId,
      path_id: event.pathId,
      concept_id: event.conceptId,
      source: sourceToDb(event.source),
      credit: event.verdict.credit,
      partial_credit: event.verdict.partialCredit,
      examiner_confidence: event.verdict.confidence,
      escalated: event.escalated,
      depth: event.depth,
      format: event.format,
      difficulty: event.difficulty,
      evidence_weight: event.evidenceWeight,
      mastery_delta: event.masteryDelta,
      confidence_delta: event.confidenceDelta,
      occurred_at: event.occurredAt,
    })
    .select('id')
    .single()

  if (error) {
    throw toReadableError(error)
  }
  return (data as { id: string }).id
}

/**
 * Eine Fehlerbeobachtung schreiben.
 *
 * `subject` ist Pflicht in dem Sinne, dass es von Anfang an mitgeschrieben werden MUSS
 * (Kapitel 10, Auflage 2): ob ein Muster generisch oder fachspezifisch ist, laesst sich
 * nachtraeglich nicht rekonstruieren. Ein leeres Fach hier bedeutet, dass diese Beobachtung
 * spaeter nie zur Einordnung eines Musters beitragen kann.
 */
export async function recordErrorObservation(args: {
  userId: string
  pathId: string
  conceptId: string
  evidenceEventId: string | null
  cause: ErrorCause
  occurredAt: string
}): Promise<string> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_error_observations')
    .insert({
      user_id: args.userId,
      path_id: args.pathId,
      concept_id: args.conceptId,
      evidence_event_id: args.evidenceEventId,
      kind: args.cause.kind,
      object: args.cause.object,
      raw_description: args.cause.rawDescription,
      subject: args.cause.subject,
      occurred_at: args.occurredAt,
    })
    .select('id')
    .single()

  if (error) {
    throw toReadableError(error)
  }
  return (data as { id: string }).id
}

/** Alle Fehlerbeobachtungen eines Nutzers laden — Eingabe des Konsolidierers. */
export async function loadErrorObservations(args: {
  userId: string
  since?: string
  limit?: number
}): Promise<
  {
    id: string
    conceptId: string
    kind: ErrorCause['kind']
    object: string
    rawDescription: string
    subject: string
    occurredAt: string
    patternId: string | null
  }[]
> {
  const supabase = getSupabaseClient()
  let query = supabase
    .from('learn_error_observations')
    .select('id, concept_id, kind, object, raw_description, subject, occurred_at, pattern_id')
    .eq('user_id', args.userId)
    .order('occurred_at', { ascending: false })
    .limit(args.limit ?? 500)

  if (args.since) {
    query = query.gte('occurred_at', args.since)
  }

  const { data, error } = await query
  if (error) {
    throw toReadableError(error)
  }

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: String(r.id),
      conceptId: String(r.concept_id),
      kind: r.kind as ErrorCause['kind'],
      object: typeof r.object === 'string' ? r.object : '',
      rawDescription: typeof r.raw_description === 'string' ? r.raw_description : '',
      subject: typeof r.subject === 'string' ? r.subject : '',
      occurredAt: String(r.occurred_at),
      patternId: typeof r.pattern_id === 'string' ? r.pattern_id : null,
    }
  })
}

/**
 * Eine Planerentscheidung protokollieren (Invariante I8).
 *
 * Der Datenbank-Check auf `reason` laesst eine leere Begruendung nicht zu. Eine Aufgabe ohne
 * Satz ist damit nicht speicherbar — und weil das Protokoll vor der Auslieferung geschrieben
 * wird, auch nicht ausspielbar.
 */
export async function recordPlannedTask(args: {
  userId: string
  pathId: string
  task: PlannedTask
  selectedAt: string
}): Promise<string> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_task_log')
    .insert({
      user_id: args.userId,
      path_id: args.pathId,
      concept_id: args.task.conceptId,
      claim: args.task.claim === 'rootCause' ? 'root_cause' : args.task.claim === 'coldStart' ? 'cold_start' : args.task.claim,
      urgency: args.task.urgency,
      reason: args.task.reason,
      urgency_breakdown: args.task.urgencyBreakdown,
      depth: args.task.depth,
      format: args.task.format,
      from_review_reserve: args.task.fromReviewReserve,
      selected_at: args.selectedAt,
    })
    .select('id')
    .single()

  if (error) {
    throw toReadableError(error)
  }
  return (data as { id: string }).id
}

/**
 * Das zuletzt ausgespielte Format je Konzept laden — Eingabe fuer `avoidFormat` (`selectFormat`).
 *
 * Warum das aus der Datenbank kommt und nicht aus dem Sitzungszustand: der Planer rechnet bei jeder
 * Zustandsaenderung neu. Wuerde die Sitzung das gerade geplante Format zurueckmelden, aenderte
 * dieses Zurueckmelden die naechste Planung, die wieder zurueckmeldet — eine Rueckkopplung, die
 * das Format bei jedem Renderdurchgang kippen liesse. Das Protokoll dagegen aendert sich nur, wenn
 * `recordPlannedTask` eine Aufgabe tatsaechlich ausspielt: ein diskretes Ereignis, kein Kreislauf.
 *
 * Ohne diese Angabe laeuft `avoidFormat` immer gegen `null` und die Wiederholungssperre aus
 * Kapitel 6.6 greift nie — vor allem dort nicht, wo sie am noetigsten ist: scheitert die Erzeugung,
 * wird keine Evidenz gezaehlt, der Rotationsindex bleibt stehen und dasselbe Format kaeme sonst
 * unbegrenzt oft wieder.
 */
export async function loadLastTaskFormats(pathId: string): Promise<Map<string, TaskFormat>> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_task_log')
    .select('concept_id, format, selected_at')
    .eq('path_id', pathId)
    .order('selected_at', { ascending: false })
    .limit(200)

  if (error) {
    throw toReadableError(error)
  }

  const out = new Map<string, TaskFormat>()
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const conceptId = typeof row.concept_id === 'string' ? row.concept_id : ''
    const format = typeof row.format === 'string' ? row.format : ''
    // Absteigend sortiert: der erste Treffer je Konzept ist der juengste.
    if (!conceptId || out.has(conceptId)) {
      continue
    }
    // `format` ist in der Datenbank ein freies Textfeld. Nur bekannte Formate uebernehmen — ein
    // alter oder umbenannter Wert darf die Formatwahl nicht auf einen unbekannten Namen sperren.
    if (isKnownTaskFormat(format)) {
      out.set(conceptId, format)
    }
  }
  return out
}

/** Eine ausgespielte Aufgabe als beantwortet markieren und mit ihrer Bewertung verknuepfen. */
export async function closePlannedTask(args: {
  taskLogId: string
  evidenceEventId: string
  answeredAt: string
}): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('learn_task_log')
    .update({ evidence_event_id: args.evidenceEventId, answered_at: args.answeredAt })
    .eq('id', args.taskLogId)

  if (error) {
    throw toReadableError(error)
  }
}

/**
 * Beobachtungen als Zeitreihe laden — Eingabe der Kantenentdeckung (`consolidation/restructure.ts`).
 *
 * Nur direkte Evidenz. Chatsignale wuerden die Korrelationsrechnung verwaessern: sie tragen
 * keine Teilpunkte, und eine Kante aus Gespraechsverhalten abzuleiten waere genau die Art von
 * unbelegter Struktur, die der Kartograf vermeiden soll.
 */
export async function loadEvidenceSamples(args: {
  userId: string
  pathId: string
  limit?: number
}): Promise<{ conceptId: string; credit: number; at: string }[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_evidence_events')
    .select('concept_id, credit, occurred_at')
    .eq('user_id', args.userId)
    .eq('path_id', args.pathId)
    .eq('source', 'graded_task')
    .order('occurred_at', { ascending: true })
    .limit(args.limit ?? 1000)

  if (error) {
    throw toReadableError(error)
  }

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    return {
      conceptId: String(r.concept_id),
      credit: Number(r.credit),
      at: String(r.occurred_at),
    }
  })
}

/**
 * Ist die Chat-Signalquelle fuer diesen Nutzer aktiv (Kapitel 5.1)?
 *
 * Muss VOR jeder Chat-Wahrnehmung geprueft werden. Der Schalter ist keine Anzeigeoption,
 * sondern die Bedingung dafuer, dass die Chatnutzung sich nicht ueberwacht anfuehlt.
 */
export async function chatSignalsEnabled(userId: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('learn_brain_chat_signals_enabled')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw toReadableError(error)
  }
  return (data as { learn_brain_chat_signals_enabled?: boolean } | null)?.learn_brain_chat_signals_enabled !== false
}

/** Den Schalter setzen. */
export async function setChatSignalsEnabled(userId: string, enabled: boolean): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('profiles')
    .update({ learn_brain_chat_signals_enabled: enabled })
    .eq('id', userId)

  if (error) {
    throw toReadableError(error)
  }
}
