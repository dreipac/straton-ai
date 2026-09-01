/**
 * Der Konsolidierer als Rolle (Kapitel 8.2 und 10).
 *
 * Diese Datei ist die Bruecke zwischen dem Modellaufruf und den reinen Funktionen dieses
 * Ordners — dasselbe Muster wie `preparation/cartography.ts` beim Kartografen. Alles, was
 * entschieden wird, entscheiden `patterns.ts` und `plan.ts`; hier wird nur uebersetzt.
 *
 * WOFUER das Modell ueberhaupt gebraucht wird, denn beide Auftraege haben auch eine
 * deterministische Fassung:
 *
 *  - Verschmelzen: `findMergeCandidates` vergleicht Wortmengen zweier Namen (Jaccard). Das
 *    findet „Steuerpflicht Minderjaehriger" neben „Steuerpflicht von Minderjaehrigen" — und
 *    findet „Steuerprogression" neben „Progressive Besteuerung" NICHT, weil kein Wort geteilt
 *    wird. Genau diese Faelle sind der Grund fuer die Rolle.
 *  - Benennen: `nameFor` baut „Verwechselt <Objekt>" aus der halbstrukturierten Form. Das ist
 *    korrekt, aber steif. Der Rollenauftrag verlangt einen Satz, den die Person ueber sich
 *    selbst versteht.
 *
 * Faellt der Aufruf aus, laeuft die Konsolidierung mit den deterministischen Ergebnissen weiter
 * (leere Einsichten). Ein Modellaussetzer darf keinen Konsolidierungslauf verschlucken — der
 * naechste kommt erst nach Ablauf des Cooldowns.
 */

import { callBrainAgent } from '../agents/client'
import { parseConsolidatorResult, type ConsolidatorRequest } from '../agents/contracts'

/** Nur die Identitaet wird gebraucht — geprueft wird, ob eine genannte ID im Graphen existiert. */
type KnownConcept = { id: string }

/** Ein Verschmelzungsvorschlag des Modells, bereits gegen den echten Graphen geprueft. */
export type SemanticMergeSuggestion = {
  keepConceptId: string
  mergeConceptId: string
  /** Die Frage in der Sprache des Nutzers — ohne sie ist der Vorschlag nach I6 unbrauchbar. */
  question: string
  rationale: string
}

export type ConsolidatorInsights = {
  /**
   * Beobachtungs-ID -> Mustername, den das Modell dafuer vorgeschlagen hat.
   *
   * Der Bezug laeuft ueber die Beobachtungen und nicht ueber `kind`+`object`: das Modell
   * formuliert das Objekt oft anders als die Beobachtung selbst, und ein Schluesselvergleich
   * ginge dann ins Leere. Die Beobachtungs-IDs hat es dagegen woertlich bekommen.
   */
  patternNameByObservation: Map<string, string>
  merges: SemanticMergeSuggestion[]
}

export const NO_INSIGHTS: ConsolidatorInsights = {
  patternNameByObservation: new Map(),
  merges: [],
}

/**
 * Die Modellantwort gegen den echten Graphen pruefen.
 *
 * Zwei Pruefungen, beide notwendig:
 *  - Beide IDs muessen existieren und verschieden sein. Eine halluzinierte ID wuerde sonst als
 *    Frage beim Nutzer landen, die beim Zustimmen ins Leere laeuft.
 *  - Die Frage muss da sein (I6). `parseConsolidatorResult` faengt das bereits ab; die Pruefung
 *    steht hier trotzdem, weil dieser Vertrag sich aendern kann und die Invariante nicht.
 */
export function readInsights(raw: unknown, concepts: KnownConcept[]): ConsolidatorInsights {
  const parsed = parseConsolidatorResult(raw)
  const known = new Set(concepts.map((concept) => concept.id))

  const patternNameByObservation = new Map<string, string>()
  for (const pattern of parsed.patterns) {
    for (const observationId of pattern.observationIds) {
      // Erste Nennung gewinnt: kommt dieselbe Beobachtung in zwei Mustern vor, hat sich das
      // Modell widersprochen — dann ist die zweite Zuordnung die unsicherere.
      if (!patternNameByObservation.has(observationId)) {
        patternNameByObservation.set(observationId, pattern.name)
      }
    }
  }

  const merges: SemanticMergeSuggestion[] = []
  for (const proposal of parsed.proposals) {
    if (proposal.operation !== 'merge_concepts') {
      continue
    }
    const keepConceptId = String(proposal.payload.keepConceptId ?? '')
    const mergeConceptId = String(proposal.payload.mergeConceptId ?? '')
    if (!known.has(keepConceptId) || !known.has(mergeConceptId) || keepConceptId === mergeConceptId) {
      continue
    }
    if (proposal.question.trim().length === 0) {
      continue
    }
    merges.push({
      keepConceptId,
      mergeConceptId,
      question: proposal.question,
      rationale: proposal.rationale,
    })
  }

  return { patternNameByObservation, merges }
}

/** Den Konsolidierer fragen. Gibt bei jedem Fehlschlag leere Einsichten zurueck, nie einen Fehler. */
export async function askConsolidator(args: {
  request: ConsolidatorRequest
  concepts: KnownConcept[]
  signal?: AbortSignal
}): Promise<ConsolidatorInsights> {
  try {
    const result = await callBrainAgent({
      role: 'konsolidierer',
      payload: args.request,
      ...(args.signal ? { signal: args.signal } : {}),
    })
    return readInsights(result.data, args.concepts)
  } catch {
    return NO_INSIGHTS
  }
}
