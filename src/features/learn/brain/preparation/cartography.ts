/**
 * Der Kartograf als Konzeptquelle (Kapitel 12, Invariante I4).
 *
 * Die Rolle war bis hierher tot: sie stand im Register, hatte ein Modell zugewiesen und wurde nie
 * aufgerufen. Die Konzeptbildung lief stattdessen ueber den allgemeinen Chatweg
 * (`sendMessage` in `hooks/useConceptIngestion.ts`) — mit der Folge, dass sie die
 * Vermittlungsschicht umging: ein Modellwechsel im Admin-Menue wirkte auf jede Rolle ausser
 * ausgerechnet die, die laut Register „die kritischste" ist.
 *
 * Diese Datei ist die Brücke: Kartografenantwort rein, `IngestedGraph` raus. Die
 * Zusammenfuehrung mehrerer Abschnitte (`mergeConceptGraphs`) bleibt unveraendert.
 */

import { callWithEscalation } from '../agents/client'
import { parseCartographerResult, type CartographerResult } from '../agents/contracts'
import type { IngestedConcept, IngestedGraph } from '../../utils/conceptIngestion'

/**
 * Kartografenergebnis in die Form der Ingestion bringen.
 *
 * Die Herkunft wird dabei NICHT neu beurteilt, nur uebersetzt: `parseCartographerResult` hat ein
 * Konzept, das sich ohne Beleg als `material` ausgab, bereits verworfen (I4). Was hier ankommt,
 * ist entweder belegt oder als Ergaenzung deklariert.
 *
 * Alle Kanten gelten als `prerequisite`: der Kartografenauftrag fragt ausdruecklich nach
 * gerichteten Voraussetzungen, nicht nach loser Verwandtschaft. Eine Kante anderen Typs kann er
 * gar nicht melden, und eine hier zu erfinden hiesse, eine Beziehung zu behaupten, die niemand
 * geprueft hat.
 */
export function toIngestedGraph(result: CartographerResult): IngestedGraph {
  const concepts: IngestedConcept[] = result.concepts.map((concept) => ({
    slug: concept.slug,
    name: concept.name,
    description: concept.description,
    difficulty: concept.difficulty,
    sourceRef: concept.section ? { section: concept.section } : {},
    origin: concept.origin === 'material' ? 'material' : 'ai_supplement',
    sourceQuote: concept.sourceQuote,
  }))

  return {
    concepts,
    edges: result.edges.map((edge) => ({
      fromSlug: edge.from,
      toSlug: edge.to,
      type: 'prerequisite' as const,
    })),
  }
}

/**
 * Einen Materialabschnitt kartografieren.
 *
 * Liefert `null` statt zu werfen: ein einzelner ausgefallener Abschnitt darf die Kartierung des
 * ganzen Materials nicht beenden — die uebrigen tragen weiter, und `mergeConceptGraphs` kommt mit
 * einer kuerzeren Liste zurecht. Ein harter Abbruch wuerde aus einem Modellaussetzer einen Pfad
 * ohne jedes Konzept machen.
 */
export async function cartographSection(args: {
  materialChunk: string
  sectionLabel: string
  topic: string
  signal?: AbortSignal
}): Promise<IngestedGraph | null> {
  try {
    const result = await callWithEscalation({
      role: 'kartograf',
      payload: {
        materialChunk: args.materialChunk,
        section: args.sectionLabel,
        topic: args.topic,
      },
      parse: parseCartographerResult,
      /*
       * Eskaliert wird, wenn der Kartograf selbst Konzepte verworfen hat. Das ist das Zeichen
       * dafuer, dass der Abschnitt schwer zu lesen war — genau der Zweifelsfall aus Kapitel 5.3,
       * und an der kritischsten Stelle der Architektur der Aufwand wert.
       */
      needsEscalation: (parsed) => parsed.rejected.length > 0 && parsed.concepts.length === 0,
      ...(args.signal ? { signal: args.signal } : {}),
    })
    const graph = toIngestedGraph(result.data)
    return graph.concepts.length > 0 ? graph : null
  } catch {
    return null
  }
}
