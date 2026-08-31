/**
 * Vom Netz zum Pfad (Kapitel 11).
 *
 * Der Grundwiderspruch: das Gedaechtnis ist ein NETZ mit meist mehreren gueltigen Reihenfolgen,
 * die Oberflaeche zeigt einen PFAD — Knoten auf einer Linie, mit Fortschritt. Jemand muss eine
 * Reihenfolge waehlen; die Frage ist, wer und wie oft.
 *
 * Entschieden: fester Pfad mit adaptiven Einschueben.
 *
 * Warum fest: Menschen bleiben an Lernsystemen dran, weil sie eine Strecke schrumpfen sehen. Das
 * funktioniert nur, wenn die Strecke stillhaelt. Ein Nenner, der sich jede Sitzung aendert, macht
 * jede Fortschrittsanzeige bedeutungslos — und die Mastery-Anzeige haengt genau daran.
 *
 * Warum das reicht: fast der gesamte adaptive Wert steckt in WELCHE Aufgabe, WELCHE
 * Schwierigkeit, WIE OFT wiederholt und WELCHER UMWEG eingeschoben wird — nicht in der
 * Grundrichtung.
 *
 * Zwei Auflagen aus dem Kapitel, beide hier umgesetzt:
 *  - Die feste Reihenfolge muss NACHZIEHBAR sein. Wird ein Konzept aufgespalten, gehoeren die
 *    neuen Knoten an ihre logisch richtige Stelle im Pfad, nicht hinten angehaengt.
 *  - Adaptive Einschuebe muessen im Ueberblick SICHTBAR werden. Waechst der Pfad im Hintergrund
 *    und die Prozentzahl faellt deshalb, wirkt das wie ein Fehler. Als markierter Einschub mit
 *    Begruendung wirkt dasselbe Ereignis wie Fuersorge.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { BrainConcept, BrainPrerequisiteEdge, LearnerConceptImage, PathOrderEntry } from '../types'
import { topologicalOrder } from '../memory/knowledgeGraph'
import { effectiveMastery } from '../memory/learnerImage'
import { explainInsert } from '../planner/explanation'

/** Abstand zwischen zwei Grundpositionen. Bewusst gross, damit dazwischen Platz bleibt. */
export const BASE_POSITION_STEP = 100

/**
 * Die feste Grundordnung aus dem Graphen ableiten.
 *
 * Topologisch, damit eine Voraussetzung immer vor dem Konzept steht, das sie braucht. Die
 * Positionen sind Vielfache von `BASE_POSITION_STEP` — zwischen zwei Knoten passen damit
 * beliebig viele Einschuebe, ohne dass je umnummeriert werden muss.
 */
export function buildBaseOrder(concepts: BrainConcept[], edges: BrainPrerequisiteEdge[]): PathOrderEntry[] {
  return topologicalOrder(concepts, edges).map((conceptId, index) => ({
    conceptId,
    position: (index + 1) * BASE_POSITION_STEP,
    kind: 'base' as const,
    insertReason: '',
  }))
}

function sortByPosition(entries: PathOrderEntry[]): PathOrderEntry[] {
  return [...entries].sort((a, b) =>
    a.position !== b.position ? a.position - b.position : a.conceptId < b.conceptId ? -1 : 1,
  )
}

/**
 * Eine freie Position unmittelbar VOR einem bestehenden Eintrag finden.
 *
 * Genau hierfuer sind die Positionen Bruchzahlen: zwischen 300 und 400 liegt 350, zwischen 300
 * und 350 liegt 325. Der Pfad kann beliebig oft ergaenzt werden, ohne dass ein einziger anderer
 * Eintrag seine Position aendert — und damit ohne dass die Strecke fuer den Nutzer springt.
 */
export function positionBefore(entries: PathOrderEntry[], conceptId: string): number | null {
  const sorted = sortByPosition(entries)
  const index = sorted.findIndex((entry) => entry.conceptId === conceptId)
  if (index < 0) {
    return null
  }
  const target = sorted[index].position
  const previous = index > 0 ? sorted[index - 1].position : target - BASE_POSITION_STEP
  return (previous + target) / 2
}

/**
 * Einen adaptiven Einschub einsortieren (Kapitel 11, „Einschub" im Glossar).
 *
 * Der Einschub landet direkt vor dem Konzept, das ihn ausgeloest hat — dort gehoert er hin, weil
 * er dessen Voraussetzungsluecke repariert. Er traegt `kind: 'insert'` und eine Begruendung,
 * damit der Ueberblick ihn als solchen zeigen kann.
 */
export function insertRemediation(args: {
  entries: PathOrderEntry[]
  conceptId: string
  beforeConceptId: string
  conceptName: string
  triggeredByName: string
}): PathOrderEntry[] {
  const existing = args.entries.find((entry) => entry.conceptId === args.conceptId)
  const position = positionBefore(args.entries, args.beforeConceptId)
  if (position == null) {
    return args.entries
  }

  const insertEntry: PathOrderEntry = {
    conceptId: args.conceptId,
    position,
    kind: 'insert',
    insertReason: explainInsert({
      conceptName: args.conceptName,
      triggeredByName: args.triggeredByName,
    }),
  }

  if (existing) {
    // Ein bereits im Pfad stehendes Konzept wird nicht dupliziert, sondern vorgezogen.
    return sortByPosition([...args.entries.filter((entry) => entry.conceptId !== args.conceptId), insertEntry])
  }
  return sortByPosition([...args.entries, insertEntry])
}

/**
 * Nachziehen nach einer Aufspaltung (Kapitel 11, Auflage).
 *
 * Die beiden neuen Knoten uebernehmen die Stelle des alten und stehen dort unmittelbar
 * hintereinander. Hinten anhaengen waere der bequeme Weg — und genau der, an dem die Ordnung
 * mit der Zeit zerfaellt: nach drei Aufspaltungen stuenden Grundlagen hinter dem Stoff, der sie
 * voraussetzt.
 */
export function reflowAfterSplit(args: {
  entries: PathOrderEntry[]
  sourceConceptId: string
  createdConceptIds: [string, string]
}): PathOrderEntry[] {
  const source = args.entries.find((entry) => entry.conceptId === args.sourceConceptId)
  if (!source) {
    return args.entries
  }

  const sorted = sortByPosition(args.entries)
  const index = sorted.findIndex((entry) => entry.conceptId === args.sourceConceptId)
  const next = index >= 0 && index + 1 < sorted.length ? sorted[index + 1].position : source.position + BASE_POSITION_STEP
  const gap = (next - source.position) / 3

  const replacements: PathOrderEntry[] = args.createdConceptIds.map((conceptId, offset) => ({
    conceptId,
    position: source.position + offset * gap,
    kind: source.kind,
    insertReason: source.insertReason,
  }))

  return sortByPosition([
    ...args.entries.filter((entry) => entry.conceptId !== args.sourceConceptId),
    ...replacements,
  ])
}

/**
 * Nachziehen nach einer Verschmelzung: der verschwundene Knoten faellt aus dem Pfad.
 *
 * Der bleibende Knoten behaelt seine Position. Die Strecke wird dadurch um eins kuerzer — was
 * der Nutzer im Bestaetigungsdialog bereits erfahren hat (Kapitel 8.3), statt es als
 * unerklaerten Sprung in der Prozentzahl zu erleben.
 */
export function reflowAfterMerge(entries: PathOrderEntry[], removedConceptId: string): PathOrderEntry[] {
  return sortByPosition(entries.filter((entry) => entry.conceptId !== removedConceptId))
}

/** Nach einer Ergaenzung des Graphen: neue Konzepte hinten anfuegen, bestehende nicht anfassen. */
export function appendNewConcepts(
  entries: PathOrderEntry[],
  concepts: BrainConcept[],
  edges: BrainPrerequisiteEdge[],
): PathOrderEntry[] {
  const known = new Set(entries.map((entry) => entry.conceptId))
  const missing = concepts.filter((concept) => !known.has(concept.id))
  if (missing.length === 0) {
    return entries
  }

  const maxPosition = entries.reduce((max, entry) => Math.max(max, entry.position), 0)
  const appended = topologicalOrder(missing, edges).map((conceptId, index) => ({
    conceptId,
    position: maxPosition + (index + 1) * BASE_POSITION_STEP,
    kind: 'base' as const,
    insertReason: '',
  }))

  return sortByPosition([...entries, ...appended])
}

/**
 * Fortschritt gegen die STABILE Grundstrecke.
 *
 * Der Nenner zaehlt nur `base`-Eintraege. Genau das haelt die Strecke still: ein Einschub laesst
 * die Prozentzahl nicht fallen, sondern erscheint daneben als eigener, begruendeter Umweg. Ohne
 * diese Trennung waere Fuersorge von aussen von einem Fehler nicht zu unterscheiden.
 */
export type PathProgressView = {
  baseTotal: number
  baseMastered: number
  ratio: number
  insertTotal: number
  insertMastered: number
}

export function pathProgressView(args: {
  entries: PathOrderEntry[]
  images: Map<string, LearnerConceptImage>
  nowIso: string
  masteryThreshold?: number
}): PathProgressView {
  const threshold = args.masteryThreshold ?? 0.75
  const isMastered = (conceptId: string) => {
    const image = args.images.get(conceptId)
    return image != null && effectiveMastery(image, args.nowIso) >= threshold
  }

  const base = args.entries.filter((entry) => entry.kind === 'base')
  const inserts = args.entries.filter((entry) => entry.kind === 'insert')

  const baseMastered = base.filter((entry) => isMastered(entry.conceptId)).length
  return {
    baseTotal: base.length,
    baseMastered,
    ratio: base.length > 0 ? baseMastered / base.length : 0,
    insertTotal: inserts.length,
    insertMastered: inserts.filter((entry) => isMastered(entry.conceptId)).length,
  }
}

/**
 * Der verdichtete Ueberblick (Kapitel 11, „Sichtbarkeit: Ueberblick plus Fokus").
 *
 * Der ganze Pfad auf einmal ist bei vierzig Konzepten entmutigend. Nur die naechsten Schritte zu
 * zeigen nimmt zwar Druck, macht aber weder die schrumpfende Strecke sichtbar noch die Auswahl
 * eines Zielumfangs moeglich — Letzteres ist zwingend noetig, weil das Ziel uebersteuern darf.
 *
 * Deshalb: der Ueberblick zeigt GRUPPEN, der Arbeitsbereich zeigt den aktuellen Abschnitt in
 * voller Aufloesung. Einschuebe werden je Gruppe getrennt ausgewiesen, damit sie sichtbar
 * bleiben, statt in der Gruppengroesse unterzugehen.
 */
export type OverviewGroup = {
  groupId: string
  label: string
  conceptIds: string[]
  insertConceptIds: string[]
  masteredCount: number
  ratio: number
}

export function buildOverview(args: {
  entries: PathOrderEntry[]
  /** Zuordnung Konzept -> Gruppe (Thema). Kommt aus der bestehenden Themenstruktur. */
  groupOf: Map<string, { id: string; label: string }>
  images: Map<string, LearnerConceptImage>
  nowIso: string
  masteryThreshold?: number
}): OverviewGroup[] {
  const threshold = args.masteryThreshold ?? 0.75
  const groups = new Map<string, OverviewGroup>()

  for (const entry of sortByPosition(args.entries)) {
    const group = args.groupOf.get(entry.conceptId) ?? { id: 'ungrouped', label: 'Ohne Thema' }
    let bucket = groups.get(group.id)
    if (!bucket) {
      bucket = {
        groupId: group.id,
        label: group.label,
        conceptIds: [],
        insertConceptIds: [],
        masteredCount: 0,
        ratio: 0,
      }
      groups.set(group.id, bucket)
    }

    bucket.conceptIds.push(entry.conceptId)
    if (entry.kind === 'insert') {
      bucket.insertConceptIds.push(entry.conceptId)
    }

    const image = args.images.get(entry.conceptId)
    if (image && effectiveMastery(image, args.nowIso) >= threshold) {
      bucket.masteredCount += 1
    }
  }

  const out = [...groups.values()]
  for (const group of out) {
    group.ratio = group.conceptIds.length > 0 ? group.masteredCount / group.conceptIds.length : 0
  }
  return out
}

/** Der Arbeitsbereich: der aktuelle Abschnitt in voller Aufloesung. */
export function focusWindow(args: {
  entries: PathOrderEntry[]
  currentConceptId: string | null
  size?: number
}): PathOrderEntry[] {
  const sorted = sortByPosition(args.entries)
  const size = args.size ?? 5
  if (!args.currentConceptId) {
    return sorted.slice(0, size)
  }
  const index = sorted.findIndex((entry) => entry.conceptId === args.currentConceptId)
  if (index < 0) {
    return sorted.slice(0, size)
  }
  const start = Math.max(0, index - 1)
  return sorted.slice(start, start + size)
}
