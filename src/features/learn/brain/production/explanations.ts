/**
 * Schicht 5 — Erklaertexte als eigene Erzeugungsart (Kapitel 7.3, neu in 1.1).
 *
 * „Der Generator erzeugt nicht nur Aufgaben, sondern auch Erklaerungen. Diese sind eine eigene
 *  Ausgabeart mit eigenen Regeln, kein Beiwerk der Rueckmeldung."
 *
 * Der Grundsatz, an dem alles hier haengt: **Straton ist kein Lehrbuch.** Das Lehrbuch besitzt
 * der Nutzer bereits — sein Material. Wuerde Straton den Stoff durchgaengig in eigenen Worten
 * erklaeren, konkurrierte es mit der Quelle, erzeugte Abweichungen und verschoebe die
 * Ergaenzungsgrenze aus Kapitel 3.
 *
 * Deshalb sind es genau drei Stellen, und deshalb steht die Bedingung fuer jede davon in Code
 * statt in einer Konvention: „nur wenn Beherrschung und Sicherheit bei null" ist eine Regel, die
 * sich sonst nach dem dritten Nutzerfeedback zu „meistens" verschiebt.
 *
 * Zwei Pflichten gelten fuer jeden Erklaertext wie fuer jede Aufgabe:
 *  - Herkunftsmarkierung (I4) — quellengebunden, mit Stelle.
 *  - Quellenabgleich durch den Kontrolleur (I5) vor der Auslieferung.
 *
 * „Ein halluzinierter Erklaertext ist gefaehrlicher als eine halluzinierte Aufgabe, weil der
 *  Nutzer ihn ungeprueft uebernimmt." Bei einer Aufgabe merkt er es womoeglich beim Rechnen.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { ApplicationDepth, BrainSourceRef, LearnerConceptImage } from '../types'
import { InvariantViolation } from '../invariants'

/**
 * Die drei zugelassenen Erklaerstellen (Kapitel 7.3).
 *
 * Ein vierter Fall existiert nicht. Alles darueber hinaus gehoert in den Chat — der ist der
 * Erklaermotor, die Sitzung ist es nicht.
 */
export type ExplanationSlot =
  /** Einstieg vor der ersten Aufgabe. 3–5 Saetze, nur bei Beherrschung UND Sicherheit auf null. */
  | 'intro'
  /** Rueckmeldung nach dem Versuch. Kurz, plus aufklappbarer Loesungsweg. Immer. */
  | 'feedback'
  /** Nach „weiss ich nicht". Vollstaendig, auf Anforderung des Nutzers. */
  | 'dontKnow'

export type ExplanationSlotSpec = {
  slot: ExplanationSlot
  label: string
  /** Umfang als Anweisung an den Generator. */
  scope: string
  /** Ober- und Untergrenze in Saetzen — der Generator neigt sonst zum Kapitel. */
  minSentences: number
  maxSentences: number
  /** Wann diese Stelle ueberhaupt zulaessig ist, im Klartext. */
  condition: string
}

export const EXPLANATION_SLOTS: readonly ExplanationSlotSpec[] = [
  {
    slot: 'intro',
    label: 'Einstieg',
    scope: 'Drei bis fuenf Saetze aus der Quelle, mit Stellenangabe. Ein Absatz, kein Kapitel.',
    minSentences: 3,
    maxSentences: 5,
    condition: 'nur wenn Beherrschung und Sicherheit bei null stehen',
  },
  {
    slot: 'feedback',
    label: 'Rueckmeldung',
    scope: 'Kurz: was stimmte, was nicht, warum. Der ausfuehrliche Loesungsweg kommt getrennt.',
    minSentences: 1,
    maxSentences: 4,
    condition: 'immer, nach dem Versuch',
  },
  {
    slot: 'dontKnow',
    label: 'Nach „weiss ich nicht"',
    scope: 'Vollstaendige Erklaerung mit Loesungsweg — hier sind Bedarf und Aufmerksamkeit am hoechsten.',
    minSentences: 3,
    maxSentences: 12,
    condition: 'auf Anforderung des Nutzers',
  },
]

const SPEC_BY_SLOT = new Map<ExplanationSlot, ExplanationSlotSpec>(
  EXPLANATION_SLOTS.map((spec) => [spec.slot, spec]),
)

export function explanationSlotSpec(slot: ExplanationSlot): ExplanationSlotSpec {
  const spec = SPEC_BY_SLOT.get(slot)
  if (!spec) {
    throw new Error(`Unbekannte Erklaerstelle: ${slot}`)
  }
  return spec
}

/**
 * Braucht dieses Konzept einen Einstieg? (Kapitel 7.3, erste Zeile der Tabelle)
 *
 * „Nur wenn Beherrschung und Sicherheit bei null" — hier gelesen als: es gab noch keine einzige
 * direkte Evidenz. Ein Konzept mit einem einzigen Versuch hat bereits einen Anhaltspunkt, und ab
 * da gilt der zweite Grundsatz aus 7.3: erst versuchen, dann erklaeren.
 *
 * Warum ein Einstieg ueberhaupt sein muss: „Kaltabfragen ohne jedes Vorwissen erzeugt Frust und
 * keine verwertbare Evidenz — ein Nichtwissen ohne Vorwissen diagnostiziert nichts."
 */
export function needsIntro(image: LearnerConceptImage | undefined): boolean {
  if (!image) {
    return true
  }
  return image.directEvidenceCount === 0 && image.confidence <= 0
}

/**
 * Darf an dieser Stelle ueberhaupt erklaert werden?
 *
 * Die Rueckmeldung ist immer erlaubt, die vollstaendige Erklaerung auf Anforderung — nur der
 * Einstieg ist bedingt. Wer diese Bedingung lockert, baut aus Straton ein Lehrbuch: dann liest
 * der Nutzer erst und versucht danach, und „der Versuch erzeugt die Luecke, in die die Erklaerung
 * faellt" ist verloren.
 */
export function explanationAllowed(args: {
  slot: ExplanationSlot
  image: LearnerConceptImage | undefined
  /** Hat der Nutzer die vollstaendige Erklaerung angefordert? */
  requestedByUser?: boolean
}): boolean {
  switch (args.slot) {
    case 'intro':
      return needsIntro(args.image)
    case 'feedback':
      return true
    case 'dontKnow':
      return args.requestedByUser === true
  }
}

/** Der Auftrag an den Generator fuer einen Erklaertext. */
export type ExplanationRequest = {
  conceptId: string
  slot: ExplanationSlot
  depth: ApplicationDepth
  /** Der Auszug, an den der Text gebunden ist. Ohne ihn gibt es keinen Auftrag. */
  sourceExcerpt: string
  /** Was die Person gerade versucht hat — nur bei `feedback` und `dontKnow` belegt. */
  attempt?: { answer: string; credit: number; cause: string | null }
}

/** Ein erzeugter, noch ungepruefter Erklaertext. */
export type GeneratedExplanation = {
  conceptId: string
  slot: ExplanationSlot
  text: string
  /** Aufklappbarer Loesungsweg; leer, wo keiner vorgesehen ist. */
  solutionPath: string
  /** I4 — die Stelle, auf die sich der Text stuetzt. */
  sourceGrounding: string
  sourceRef: BrainSourceRef
}

/**
 * Ergebnis des Quellenabgleichs fuer einen Erklaertext (I5).
 *
 * Bewusst dieselbe Form wie beim Aufgaben-Kontrollbefund, aber ein eigener Typ: ein Erklaertext
 * wird nicht gegengeloest — es gibt nichts zu loesen —, und ein gemeinsamer Typ mit einem
 * unbenutzten `counterSolved`-Feld haette frueher oder later jemanden dazu verleitet, das
 * fehlende Gegenloesen als bestandene Pruefung zu lesen.
 */
export type ExplanationVerdict = {
  sourceAligned: boolean
  /** Behauptungen im Text, die im Auszug nicht vorkommen. */
  unsupportedClaims: string[]
  issues: string[]
  passed: boolean
}

export function buildExplanationVerdict(args: {
  sourceAligned: boolean
  unsupportedClaims?: string[]
}): ExplanationVerdict {
  const unsupported = args.unsupportedClaims ?? []
  const issues: string[] = []

  if (!args.sourceAligned) {
    issues.push('Erklaertext laesst sich nicht im Quellmaterial verankern.')
  }
  for (const claim of unsupported) {
    issues.push(`Nicht im Auszug gedeckt: „${claim.trim().slice(0, 120)}".`)
  }

  return {
    sourceAligned: args.sourceAligned,
    unsupportedClaims: unsupported,
    issues,
    passed: args.sourceAligned && unsupported.length === 0,
  }
}

/**
 * Invariante I5 — Torwaechter vor der Auslieferung eines Erklaertexts.
 *
 * Dieselbe Haerte wie bei Aufgaben, aus einem staerkeren Grund: eine halluzinierte Aufgabe
 * faellt beim Rechnen womoeglich auf. Ein halluzinierter Erklaertext wird gelesen und geglaubt.
 *
 * Zusaetzlich wird die Herkunftsmarkierung geprueft (I4): ein Erklaertext ohne Stellenangabe ist
 * nicht ueberpruefbar, und genau die Ueberpruefbarkeit ist der Unterschied zwischen Straton und
 * einem Chatbot.
 */
export function assertExplanationCleared(
  explanation: GeneratedExplanation,
  verdict: ExplanationVerdict | null,
): void {
  if (!verdict) {
    throw new InvariantViolation(
      'I5',
      `Erklaertext zu „${explanation.conceptId}" ohne Kontrolleur-Befund ausgeliefert.`,
    )
  }
  if (!verdict.sourceAligned) {
    throw new InvariantViolation(
      'I5',
      `Erklaertext zu „${explanation.conceptId}" ohne Quellenverankerung ausgeliefert.`,
    )
  }
  if (verdict.unsupportedClaims.length > 0) {
    throw new InvariantViolation(
      'I5',
      `Erklaertext zu „${explanation.conceptId}" enthaelt ${verdict.unsupportedClaims.length} ungedeckte Behauptung(en).`,
    )
  }
  if (explanation.sourceGrounding.trim().length === 0) {
    throw new InvariantViolation(
      'I4',
      `Erklaertext zu „${explanation.conceptId}" ohne Herkunftsmarkierung ausgeliefert.`,
    )
  }
}

/** Grobe Satzzaehlung — reicht fuer eine Umfangsgrenze, kein Sprachmodell noetig. */
export function countSentences(text: string): number {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return 0
  }
  return trimmed.split(/[.!?]+(?:\s|$)/u).filter((part) => part.trim().length > 0).length
}

/**
 * Haelt der Text den Umfang seiner Stelle ein?
 *
 * Der Generator neigt bei Erklaerungen zum Ausufern — und ein Einstieg, der zum Kapitel wird,
 * ist genau der Punkt, an dem Straton anfaengt, mit dem Material des Nutzers zu konkurrieren.
 * Die Grenze wird deshalb geprueft und nicht bloss im Prompt erbeten.
 */
export function withinScope(explanation: GeneratedExplanation): boolean {
  const spec = explanationSlotSpec(explanation.slot)
  const sentences = countSentences(explanation.text)
  return sentences >= spec.minSentences && sentences <= spec.maxSentences
}
