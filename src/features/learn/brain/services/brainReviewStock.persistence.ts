/**
 * Persistenz des Wiederholungsvorrats (Kapitel 7.1).
 *
 * Der Vorrat ueberlebt hier den Seitenwechsel. Ohne das entstuende er bei jedem Aufruf neu, und
 * der Nutzer wartete genau dort, wo Tempo das ganze Produkterlebnis ist — die Ausnahme aus 7.1
 * waere formal umgesetzt und praktisch wirkungslos.
 */

import { getSupabaseClient } from '../../../../integrations/supabase/client'
import type { GeneratedTask } from '../types'
import type { ReviewStock, ReviewStockItem } from '../production/reviewStock'
import { toReadableError } from './brainErrors'

type StockRow = {
  concept_id: string
  items: unknown
  fingerprint: string
  rotation: number
  created_at: string
}

function parseItems(value: unknown): ReviewStockItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  const out: ReviewStockItem[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const record = entry as Record<string, unknown>
    if (!record.task || typeof record.task !== 'object') {
      continue
    }
    const served = Number(record.timesServed)
    out.push({
      task: record.task as GeneratedTask,
      timesServed: Number.isFinite(served) && served >= 0 ? served : 0,
    })
  }
  return out
}

function mapRow(row: StockRow): ReviewStock {
  return {
    conceptId: row.concept_id,
    items: parseItems(row.items),
    fingerprint: row.fingerprint,
    rotation: row.rotation,
    createdAt: row.created_at,
  }
}

/** Die Vorraete zu einer Menge von Konzepten laden. */
export async function loadReviewStocks(conceptIds: string[]): Promise<Map<string, ReviewStock>> {
  if (conceptIds.length === 0) {
    return new Map()
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_review_stock')
    .select('concept_id, items, fingerprint, rotation, created_at')
    .in('concept_id', conceptIds)

  if (error) {
    throw toReadableError(error)
  }

  const stocks = new Map<string, ReviewStock>()
  for (const row of (data ?? []) as unknown as StockRow[]) {
    stocks.set(row.concept_id, mapRow(row))
  }
  return stocks
}

/**
 * Einen Vorrat schreiben.
 *
 * Auch der blosse Ausspielzaehler wird zurueckgeschrieben: ohne ihn beginnt die Rotation nach
 * jedem Seitenwechsel wieder vorn, und die Person bekaeme immer dieselbe Formulierung zu sehen —
 * genau das, was die Rotation verhindern soll (UI-Spezifikation 5.2).
 */
export async function saveReviewStock(userId: string, stock: ReviewStock): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('learn_review_stock').upsert(
    {
      user_id: userId,
      concept_id: stock.conceptId,
      items: stock.items,
      fingerprint: stock.fingerprint,
      rotation: stock.rotation,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,concept_id' },
  )

  if (error) {
    throw toReadableError(error)
  }
}

/**
 * Einen ueberholten Vorrat entfernen.
 *
 * Wird beim Neuerzeugen nicht gebraucht — der Upsert ueberschreibt. Noetig ist es dort, wo ein
 * Konzept den Stapel verlaesst (Kapitel 6.7): dann liegen Abfragen herum, die nie mehr gestellt
 * werden und beim naechsten Wiedereintritt einen falschen Stand vortaeuschen wuerden.
 */
export async function dropReviewStock(userId: string, conceptId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('learn_review_stock')
    .delete()
    .eq('user_id', userId)
    .eq('concept_id', conceptId)

  if (error) {
    throw toReadableError(error)
  }
}
