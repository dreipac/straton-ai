/**
 * Kaltstart — adaptive Suche im laufenden Lernen (Kapitel 9).
 *
 * Ausgangslage: ein neuer Nutzer laedt sein Skript hoch, der Kartograf baut den Graphen — und
 * das Lernerbild ist vollstaendig leer. Trotzdem muss die erste Aufgabe sitzen.
 *
 * Der Voraussetzungsgraph macht eine effiziente Ortung moeglich: weil die Konzepte gerichtet
 * verbunden sind, halbiert jede beantwortete Aufgabe den Suchraum. Wird etwas Mittelschweres
 * richtig geloest, gilt vieles darunter als wahrscheinlich vorhanden; bei einem Fehlschlag liegt
 * die Grenze weiter unten. Nach etwa fuenf bis sieben Aufgaben ist die Front ziemlich genau
 * bestimmt — ohne dass sich je ein Test angefuehlt haette.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WICHTIG, und der subtilste Punkt dieser Datei:
 *
 * „Vieles darunter gilt als wahrscheinlich vorhanden" veraendert AUSDRUECKLICH NICHT das
 * Lernerbild. Invariante I1 laesst nur direkte Evidenz an die Beherrschung. Was die adaptive
 * Suche hier fuehrt, ist ein reiner SUCHZUSTAND: er entscheidet, was als Naechstes gefragt wird,
 * und wird nie persistiert. Wuerde er ins Lernerbild geschrieben, entstuenden Werte, fuer die
 * nie jemand etwas geloest hat — genau das, was I1 verhindert.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Rein — kein DOM, kein I/O.
 */

import type { BrainConcept, BrainPrerequisiteEdge, LearnerConceptImage } from '../types'
import { prerequisitesOf, dependentsOf } from '../memory/knowledgeGraph'

/** „Nach etwa fuenf bis sieben Aufgaben ist die Front ziemlich genau bestimmt." */
export const COLD_START_PROBE_BUDGET = 7

/**
 * Der Suchzustand. Nicht persistieren — siehe der Hinweis oben.
 *
 * `presumedKnown` und `presumedOpen` sind Vermutungen ueber den Suchraum, keine Aussagen ueber
 * die Person.
 */
export type FrontSearchState = {
  presumedKnown: Set<string>
  presumedOpen: Set<string>
  probesUsed: number
}

export function initialFrontSearch(): FrontSearchState {
  return { presumedKnown: new Set(), presumedOpen: new Set(), probesUsed: 0 }
}

/** Alle transitiven Voraussetzungen eines Konzepts. */
export function ancestorsOf(edges: BrainPrerequisiteEdge[], conceptId: string): Set<string> {
  const seen = new Set<string>()
  const stack = [conceptId]
  while (stack.length > 0) {
    const current = stack.pop() as string
    for (const prerequisite of prerequisitesOf(edges, current)) {
      if (!seen.has(prerequisite)) {
        seen.add(prerequisite)
        stack.push(prerequisite)
      }
    }
  }
  return seen
}

/** Alle Konzepte, die transitiv auf einem Konzept aufbauen. */
export function descendantsOf(edges: BrainPrerequisiteEdge[], conceptId: string): Set<string> {
  const seen = new Set<string>()
  const stack = [conceptId]
  while (stack.length > 0) {
    const current = stack.pop() as string
    for (const dependent of dependentsOf(edges, current)) {
      if (!seen.has(dependent)) {
        seen.add(dependent)
        stack.push(dependent)
      }
    }
  }
  return seen
}

/**
 * Informationsgewinn einer Frage, 0..1.
 *
 * Maximal ist er, wenn die Frage den offenen Suchraum in zwei gleich grosse Haelften teilt:
 * eine richtige Antwort raeumt die Vorfahren ab, eine falsche die Nachfahren. Eine Frage am
 * Rand des Graphen — ganz unten oder ganz oben — bringt fast nichts, egal wie sie ausgeht.
 *
 * Das ist dieselbe Ueberlegung wie bei einer binaeren Suche, nur auf einem gerichteten Graphen
 * statt auf einer Liste.
 */
export function informationGain(args: {
  conceptId: string
  edges: BrainPrerequisiteEdge[]
  openConceptIds: Set<string>
}): number {
  const { conceptId, edges, openConceptIds } = args
  const total = openConceptIds.size
  if (total <= 1 || !openConceptIds.has(conceptId)) {
    return 0
  }

  let below = 0
  for (const id of ancestorsOf(edges, conceptId)) {
    if (openConceptIds.has(id)) {
      below += 1
    }
  }

  let above = 0
  for (const id of descendantsOf(edges, conceptId)) {
    if (openConceptIds.has(id)) {
      above += 1
    }
  }

  // Die kleinere der beiden Haelften bestimmt den garantierten Gewinn; im Idealfall ist sie halb
  // so gross wie der offene Raum, dann ist der Wert 1.
  const smaller = Math.min(below + 1, above + 1)
  return Math.max(0, Math.min(1, smaller / (total / 2)))
}

/**
 * Der offene Suchraum: alles, was weder direkte Evidenz hat noch durch die bisherige Suche
 * ausgeschlossen wurde.
 */
export function openConcepts(args: {
  concepts: BrainConcept[]
  images: Map<string, LearnerConceptImage>
  search: FrontSearchState
}): Set<string> {
  const out = new Set<string>()
  for (const concept of args.concepts) {
    if ((args.images.get(concept.id)?.directEvidenceCount ?? 0) > 0) {
      continue
    }
    if (args.search.presumedKnown.has(concept.id) || args.search.presumedOpen.has(concept.id)) {
      continue
    }
    out.add(concept.id)
  }
  return out
}

/** Informationsgewinn fuer alle offenen Konzepte — geht als Kaltstart-Dringlichkeit in den Planer. */
export function informationGains(args: {
  concepts: BrainConcept[]
  edges: BrainPrerequisiteEdge[]
  images: Map<string, LearnerConceptImage>
  search: FrontSearchState
}): Map<string, number> {
  const open = openConcepts(args)
  const gains = new Map<string, number>()
  if (args.search.probesUsed >= COLD_START_PROBE_BUDGET) {
    return gains
  }
  for (const conceptId of open) {
    gains.set(conceptId, informationGain({ conceptId, edges: args.edges, openConceptIds: open }))
  }
  return gains
}

/**
 * Die naechste Sondierungsfrage.
 *
 * Deterministische Tie-Breaks (Gewinn, dann Schwierigkeit nahe der Mitte, dann Id): dieselbe
 * Ausgangslage ergibt zweimal dieselbe Frage. Mittlere Schwierigkeit ist die richtige Wahl,
 * weil eine sehr leichte Frage fast sicher richtig und eine sehr schwere fast sicher falsch
 * beantwortet wird — beide sagen dann wenig.
 */
export function selectProbe(args: {
  concepts: BrainConcept[]
  edges: BrainPrerequisiteEdge[]
  images: Map<string, LearnerConceptImage>
  search: FrontSearchState
}): string | null {
  const gains = informationGains(args)
  if (gains.size === 0) {
    return null
  }

  const byId = new Map(args.concepts.map((concept) => [concept.id, concept]))
  let best: { id: string; gain: number; difficultyDistance: number } | null = null

  for (const [id, gain] of gains) {
    if (gain <= 0) {
      continue
    }
    const difficultyDistance = Math.abs((byId.get(id)?.difficulty ?? 3) - 3)
    if (
      !best ||
      gain > best.gain ||
      (gain === best.gain && difficultyDistance < best.difficultyDistance) ||
      (gain === best.gain && difficultyDistance === best.difficultyDistance && id < best.id)
    ) {
      best = { id, gain, difficultyDistance }
    }
  }

  return best?.id ?? null
}

/**
 * Das Ergebnis einer Sondierung in den Suchzustand einarbeiten.
 *
 * Richtig geloest: die Vorfahren scheiden aus dem Suchraum aus — die Grenze liegt weiter oben.
 * Falsch geloest: die Nachfahren scheiden aus — die Grenze liegt weiter unten.
 *
 * Nochmals: hier wird kein Lernerbild angefasst. `presumedKnown` heisst „muss ich nicht mehr
 * fragen, um die Front zu finden", nicht „kann die Person".
 */
export function recordProbe(args: {
  search: FrontSearchState
  conceptId: string
  edges: BrainPrerequisiteEdge[]
  correct: boolean
}): FrontSearchState {
  const presumedKnown = new Set(args.search.presumedKnown)
  const presumedOpen = new Set(args.search.presumedOpen)

  if (args.correct) {
    for (const id of ancestorsOf(args.edges, args.conceptId)) {
      presumedKnown.add(id)
    }
  } else {
    for (const id of descendantsOf(args.edges, args.conceptId)) {
      presumedOpen.add(id)
    }
  }

  return { presumedKnown, presumedOpen, probesUsed: args.search.probesUsed + 1 }
}

/** Ist die Kaltstartphase beendet? */
export function frontIsLocated(args: {
  search: FrontSearchState
  concepts: BrainConcept[]
  images: Map<string, LearnerConceptImage>
}): boolean {
  if (args.search.probesUsed >= COLD_START_PROBE_BUDGET) {
    return true
  }
  return openConcepts(args).size === 0
}

/**
 * Die Ergebnisanzeige am Ende der ersten Sitzung (Kapitel 9, Sichtbarkeit).
 *
 * „Die Ergebnisanzeige am Sitzungsende liefert den befriedigenden Einordnungsmoment einer
 *  klassischen Einstufung, ohne deren Pruefungscharakter."
 */
export type ColdStartSummary = {
  probesUsed: number
  /** Konzepte, die nach der Suche als naechste dran sind. */
  frontConceptIds: string[]
  presumedKnownCount: number
  openCount: number
  sentence: string
}

export function summariseColdStart(args: {
  search: FrontSearchState
  concepts: BrainConcept[]
  edges: BrainPrerequisiteEdge[]
  images: Map<string, LearnerConceptImage>
}): ColdStartSummary {
  const open = openConcepts(args)
  const front = [...open].filter((id) =>
    prerequisitesOf(args.edges, id).every(
      (prerequisiteId) =>
        args.search.presumedKnown.has(prerequisiteId) ||
        (args.images.get(prerequisiteId)?.mastery ?? 0) >= 0.7,
    ),
  )

  const known = args.search.presumedKnown.size
  const total = args.concepts.length

  return {
    probesUsed: args.search.probesUsed,
    frontConceptIds: front.sort(),
    presumedKnownCount: known,
    openCount: open.size,
    sentence:
      total === 0
        ? 'Noch kein Stoff eingelesen.'
        : `Nach ${args.search.probesUsed} ${args.search.probesUsed === 1 ? 'Aufgabe' : 'Aufgaben'} habe ich eine Einschaetzung: ` +
          `von ${total} Konzepten sehe ich ${known} als vorhanden an, ${front.length} sind als Naechstes dran.`,
  }
}
