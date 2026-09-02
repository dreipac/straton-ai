/**
 * Anbindung: Sprintkarte im Lernpfad (Kapitel 6.3, Sonderfall knapper Termin).
 *
 * Der Sprint hat genau zwei Momente, in denen er den Nutzer anspricht — und beide sind
 * Entscheidungen, keine Meldungen:
 *
 *  1. **Der Vorschlag**, einmal, gleich nach der Einrichtung: so viel geht bis zum Termin, das
 *     kostet es, so lange haelt es. Zwei Knoepfe.
 *  2. **Das Rueckholen**, spaeter: wer den Umfang durchhat oder schneller ist als geplant,
 *     bekommt angeboten, mehr hereinzunehmen.
 *
 * Woran haengt „schon entschieden"? An der Zieltiefe. Ein Ziel aus der Einrichtung traegt die
 * Vorgabe `apply`; sobald der Nutzer eine der beiden Antworten gegeben hat, steht dort
 * `recognize` — beide Antworten senken die Tiefe, denn Stufe 2 der Leiter („erst flacher") gilt
 * auch dann, wenn niemand ein Konzept hergeben will. Damit braucht es kein zusaetzliches
 * Merkfeld, das mit dem Ziel auseinanderlaufen koennte.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { BrainConcept, BrainPrerequisiteEdge, LearnerConceptImage, LearningGoal } from '../types'
import {
  describeRetention,
  describeSprintScope,
  planSprintScope,
  sprintHeadroom,
  SPRINT_TARGET_DEPTH,
  type SprintPlan,
} from '../planner/sprint'

/** Wie viele Konzepte ein einzelnes Rueckhol-Angebot hoechstens umfasst. */
export const HEADROOM_OFFER_SIZE = 5

export type SprintCardView =
  /** Kein knapper Termin — die Karte erscheint gar nicht. */
  | { kind: 'none' }
  /** Der einmalige Vorschlag. */
  | {
      kind: 'proposal'
      /*
       * Die Ueberschrift des Hinweises. Eigenes Feld statt „erster Satz ist der Titel": ein Satz,
       * der mit einer Zahl beginnt, liest sich nicht als Ueberschrift, sondern als Fliesstext,
       * der zufaellig gross gesetzt wurde.
       */
      title: string
      /** „20 von 40 Konzepten in 2 Tagen, auf Erkennen-Niveau. …" */
      scopeSentence: string
      /** Die Haltbarkeitswarnung — getrennt, weil sie eine andere Sache betrifft. */
      retentionSentence: string
      /** Der vorgeschlagene Umfang, Wurzeln zuerst. */
      conceptIds: string[]
      keptCount: number
      totalCount: number
      /** Faellt nichts weg, gibt es nichts zu entscheiden — dann nur bestaetigen. */
      isCut: boolean
    }
  /** Alles im Umfang sitzt oder es ist Luft — mehr hereinnehmen? */
  | {
      kind: 'headroom'
      /** Die Lage in drei Worten — „Dein Umfang ist durch". */
      title: string
      /** Die Frage dazu. */
      sentence: string
      /** Die Konzepte, die das Angebot hereinnehmen wuerde. */
      conceptIds: string[]
      /** Ist der bisherige Umfang komplett erledigt? Dann ist es kein Angebot, sondern die Folge. */
      isScopeComplete: boolean
    }

/**
 * Was die Sprintkarte gerade zeigt.
 *
 * Gibt `{ kind: 'none' }` zurueck, sobald irgendetwas dagegenspricht — kein Ziel, kein knapper
 * Termin, nichts anzubieten. Die Karte hat damit genau eine Bedingung in der Komponente
 * (`kind !== 'none'`) und keine eigene Meinung.
 */
export function buildSprintCard(args: {
  concepts: BrainConcept[]
  edges: BrainPrerequisiteEdge[]
  images: Map<string, LearnerConceptImage>
  goal: LearningGoal | null
  nowIso: string
}): SprintCardView {
  const { goal } = args
  if (!goal || goal.status !== 'active') {
    return { kind: 'none' }
  }

  const plan = planSprintScope({
    concepts: args.concepts,
    edges: args.edges,
    images: args.images,
    minutesPerDay: goal.minutesPerDay,
    dueAt: goal.dueAt,
    nowIso: args.nowIso,
  })
  if (!plan || args.concepts.length === 0) {
    return { kind: 'none' }
  }

  // Noch nicht beantwortet: der Vorschlag steht aus.
  if (goal.targetDepth !== SPRINT_TARGET_DEPTH) {
    return buildProposal(plan, args.concepts.length)
  }

  const headroom = sprintHeadroom({
    concepts: args.concepts,
    edges: args.edges,
    images: args.images,
    goalConceptIds: goal.conceptIds,
    minutesPerDay: goal.minutesPerDay,
    dueAt: goal.dueAt,
    nowIso: args.nowIso,
  })

  const offer = headroom.conceptIds.slice(0, HEADROOM_OFFER_SIZE)
  if (offer.length === 0) {
    return { kind: 'none' }
  }

  /*
   * Zwei verschiedene Lagen, zwei verschiedene Ueberschriften. „Der Umfang ist durch" ist eine
   * Feststellung — dort laeuft der Pfad ohnehin schon von selbst weiter (siehe die Vorrangregel
   * in `planner.ts`), und das Angebot macht das nur sichtbar. „Du bist vor dem Plan" ist ein
   * Angebot, das man ausschlagen kann, ohne etwas zu verpassen.
   */
  const title = headroom.isScopeComplete ? 'Dein Umfang ist durch' : 'Du bist vor dem Plan'
  const sentence = headroom.isScopeComplete
    ? `${offer.length} ${conceptWord(offer.length)} mehr hereinnehmen?`
    : `${offer.length} ${conceptWord(offer.length)} zurueckholen?`

  return {
    kind: 'headroom',
    title,
    sentence,
    conceptIds: offer,
    isScopeComplete: headroom.isScopeComplete,
  }
}

function buildProposal(plan: SprintPlan, totalCount: number): SprintCardView {
  return {
    kind: 'proposal',
    title: 'Dein Umfang bis zum Termin',
    scopeSentence: describeSprintScope(plan, totalCount),
    retentionSentence: describeRetention(plan),
    conceptIds: plan.conceptIds,
    keptCount: plan.conceptIds.length,
    totalCount,
    isCut: plan.droppedConceptIds.length > 0,
  }
}

function conceptWord(count: number): string {
  return count === 1 ? 'Konzept' : 'Konzepte'
}
