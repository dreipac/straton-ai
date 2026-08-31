/**
 * Handkorrekturen am Wissensgraphen (Architekturkapitel 3 und UI-Spezifikation 3.6).
 *
 * „`Knoten bearbeiten` ist Pflicht, weil der Kartograf Fehler macht und die Konsolidierung nicht
 * alles repariert." Genau deshalb liegt diese Datei hier und nicht in der Komponente: eine
 * Handkorrektur ist ein Strukturumbau wie jeder andere und unterliegt denselben Auflagen —
 * Protokoll vor der Aenderung, Ruecknahmeanleitung im Protokoll, Bestaetigung bei
 * zerstoererischen Operationen (I6).
 *
 * Was hier NICHT passiert: kein Wert wird bewegt, ausser durch die Verschmelzungsregel aus
 * Kapitel 8.3 — und die senkt, sie hebt nie (I1 bleibt unberuehrt: Umbenennen und Kanten aendern
 * lassen Beherrschung und Sicherheit voellig unangetastet).
 */

import { getSupabaseClient } from '../../../../integrations/supabase/client'
import type { BrainConcept, BrainPrerequisiteEdge, LearnerConceptImage } from '../types'
import { mergeImages, buildLogEntry, undoPayloadForMerge, undoPayloadForAddEdge } from '../consolidation/restructure'
import { addPrerequisiteEdge, removePrerequisiteEdge, upsertLearnerImages } from './brainMemory.persistence'
import { recordStructureChange } from './brainConsolidation.persistence'
import { dropReviewStock } from './brainReviewStock.persistence'
import { toReadableError } from './brainErrors'

/**
 * Ein Konzept umbenennen.
 *
 * Die harmloseste Korrektur und die haeufigste: der Kartograf trifft die Sache, verfehlt aber
 * das Wort, unter dem die Person es im Unterricht kennt. Kein Protokolleintrag — der Name ist
 * keine Struktur, und ein Umbenennen ist ohne Zusatzwissen umkehrbar (der alte Name steht im
 * Eingabefeld, bis die Person ihn ueberschreibt).
 */
export async function renameConcept(conceptId: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    throw new Error('Ein Konzept ohne Namen laesst sich nicht speichern.')
  }

  const supabase = getSupabaseClient()
  const { error } = await supabase.from('learn_concepts').update({ name: trimmed }).eq('id', conceptId)

  if (error) {
    throw toReadableError(error)
  }
}

/**
 * Eine Voraussetzung von Hand ergaenzen.
 *
 * Protokolliert, obwohl umkehrbar: eine Kante veraendert die Ursachensuche und damit, welche
 * Konzepte der Planer bei einem Fehler vorschlaegt. Wenn das spaeter merkwuerdig aussieht, muss
 * nachvollziehbar sein, dass es eine Handkorrektur war und keine Entdeckung der Konsolidierung.
 */
export async function applyAddPrerequisite(args: {
  userId: string
  pathId: string
  fromConceptId: string
  toConceptId: string
}): Promise<void> {
  if (args.fromConceptId === args.toConceptId) {
    throw new Error('Ein Konzept kann nicht seine eigene Voraussetzung sein.')
  }

  // Erst das Protokoll, dann die Aenderung — dieselbe bindende Reihenfolge wie bei der
  // Konsolidierung (Kapitel 8.4).
  await recordStructureChange(
    buildLogEntry({
      userId: args.userId,
      pathId: args.pathId,
      proposalId: null,
      operation: 'addEdge',
      payload: { fromConceptId: args.fromConceptId, toConceptId: args.toConceptId, source: 'handCorrection' },
      evidence: { source: 'handCorrection' },
      undoPayload: undoPayloadForAddEdge(args.fromConceptId, args.toConceptId),
      nowIso: new Date().toISOString(),
    }),
  )

  await addPrerequisiteEdge({
    pathId: args.pathId,
    fromConceptId: args.fromConceptId,
    toConceptId: args.toConceptId,
    origin: 'user',
  })
}

/** Eine Voraussetzung von Hand streichen. Die Ruecknahme ist das Wiederanlegen derselben Kante. */
export async function applyRemovePrerequisite(args: {
  userId: string
  pathId: string
  fromConceptId: string
  toConceptId: string
}): Promise<void> {
  await recordStructureChange(
    buildLogEntry({
      userId: args.userId,
      pathId: args.pathId,
      proposalId: null,
      operation: 'removeEdge',
      payload: { fromConceptId: args.fromConceptId, toConceptId: args.toConceptId, source: 'handCorrection' },
      evidence: { source: 'handCorrection' },
      undoPayload: { kind: 'addEdge', fromConceptId: args.fromConceptId, toConceptId: args.toConceptId },
      nowIso: new Date().toISOString(),
    }),
  )

  await removePrerequisiteEdge({ fromConceptId: args.fromConceptId, toConceptId: args.toConceptId })
}

/**
 * Zwei Konzepte zusammenlegen.
 *
 * Die einzige zerstoererische Operation an der Oberflaeche (I6) — der Aufrufer muss die
 * Bestaetigung eingeholt und die konservative Wertregel angekuendigt haben, bevor er hier
 * landet (`MERGE_VALUE_WARNING`).
 *
 * Ablauf, und die Reihenfolge ist nicht beliebig:
 *
 *  1. **Protokoll zuerst.** Bricht der Rest ab, gibt es einen Eintrag zu viel — bricht das
 *     Protokoll ab, gaebe es einen Umbau ohne Ruecknahmeanleitung. Von beiden ist das erste
 *     harmlos.
 *  2. **Werte konservativ verschmelzen** (Kapitel 8.3): der niedrigere Wert gewinnt.
 *  3. **Kanten umhaengen**, dann erst
 *  4. **die Belege umhaengen** und
 *  5. **das aufgeloeste Konzept loeschen.**
 *
 * Punkt 4 ist der Grund, warum hier nicht einfach geloescht wird: die Fremdschluessel raeumen
 * beim Loeschen Evidenzereignisse, Fehlerbeobachtungen und Aufgabenprotokoll mit weg. Genau
 * diese Belege sind aber der Grund, warum das Lernerbild ueberhaupt etwas behauptet. Nach einer
 * Verschmelzung sind es Belege ueber DASSELBE Konzept — sie gehoeren an den ueberlebenden
 * Knoten, nicht in den Papierkorb.
 */
export async function applyConceptMerge(args: {
  userId: string
  pathId: string
  /** Der Knoten, der bleibt. */
  keptConcept: BrainConcept
  /** Der Knoten, der aufgeht. */
  mergedConcept: BrainConcept
  keptImage: LearnerConceptImage
  mergedImage: LearnerConceptImage
  edges: BrainPrerequisiteEdge[]
  /** Aus der Einsichten-Karte kommend: der beantwortete Vorschlag. */
  proposalId?: string | null
}): Promise<void> {
  const { userId, pathId, keptConcept, mergedConcept } = args
  if (keptConcept.id === mergedConcept.id) {
    throw new Error('Ein Konzept laesst sich nicht mit sich selbst zusammenlegen.')
  }

  const supabase = getSupabaseClient()
  const touchedEdges = args.edges.filter(
    (edge) => edge.fromConceptId === mergedConcept.id || edge.toConceptId === mergedConcept.id,
  )

  await recordStructureChange(
    buildLogEntry({
      userId,
      pathId,
      proposalId: args.proposalId ?? null,
      operation: 'mergeConcepts',
      payload: { keptConceptId: keptConcept.id, mergedConceptId: mergedConcept.id },
      evidence: { source: args.proposalId ? 'proposal' : 'handCorrection' },
      undoPayload: undoPayloadForMerge({
        keptConceptId: keptConcept.id,
        mergedConceptId: mergedConcept.id,
        keptImageBefore: args.keptImage,
        mergedImageBefore: args.mergedImage,
        mergedConceptSnapshot: mergedConcept,
        reattachedEdges: touchedEdges,
      }),
      nowIso: new Date().toISOString(),
    }),
  )

  await upsertLearnerImages(userId, [mergeImages(args.keptImage, args.mergedImage, keptConcept.id)])

  /*
   * Kanten umhaengen. Eine Kante, deren Gegenstueck der ueberlebende Knoten ist, wuerde zur
   * Schleife auf sich selbst — sie faellt ersatzlos weg. Bereits vorhandene Kanten werden nicht
   * verdoppelt: zwei identische Voraussetzungen wuerden die Ursachensuche doppelt gewichten.
   */
  const existing = new Set(args.edges.map((edge) => `${edge.fromConceptId}>${edge.toConceptId}`))
  for (const edge of touchedEdges) {
    const from = edge.fromConceptId === mergedConcept.id ? keptConcept.id : edge.fromConceptId
    const to = edge.toConceptId === mergedConcept.id ? keptConcept.id : edge.toConceptId
    if (from === to || existing.has(`${from}>${to}`)) {
      continue
    }
    existing.add(`${from}>${to}`)
    await addPrerequisiteEdge({ pathId, fromConceptId: from, toConceptId: to, origin: edge.origin })
  }

  await repointHistory(mergedConcept.id, keptConcept.id)

  // Die Zeile selbst; die Fremdschluessel raeumen Lernerbild, Kanten und Pfadposition mit ab.
  const { error } = await supabase.from('learn_concepts').delete().eq('id', mergedConcept.id)
  if (error) {
    throw toReadableError(error)
  }

  /*
   * Der Vorrat des ueberlebenden Knotens ist inhaltlich ueberholt: er entstand aus einem
   * Lernerbild, das es so nicht mehr gibt. Der Fingerabdruck wuerde das beim naechsten Zugriff
   * ohnehin merken — ihn hier zu loeschen erspart der Person eine Abfrage zu einem Konzept, das
   * inzwischen etwas anderes umfasst.
   */
  await dropReviewStock(userId, keptConcept.id).catch(() => {})
}

/**
 * Belege des aufgeloesten Knotens an den ueberlebenden umhaengen.
 *
 * Fehlschlaege werden hier bewusst geschluckt: das Umhaengen ist eine Bewahrungsmassnahme, keine
 * Voraussetzung der Verschmelzung. Bricht es ab, verliert das System Historie — die
 * Verschmelzung selbst aber halb abzubrechen hinterliesse zwei Knoten, von denen einer bereits
 * die zusammengelegten Werte traegt.
 */
async function repointHistory(fromConceptId: string, toConceptId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const tables = ['learn_evidence_events', 'learn_error_observations', 'learn_task_log'] as const

  for (const table of tables) {
    try {
      await supabase.from(table).update({ concept_id: toConceptId }).eq('concept_id', fromConceptId)
    } catch {
      // siehe Kommentar oben
    }
  }
}
