/**
 * Anbindung: Ziel setzen (UI-Spezifikation Kapitel 7, Architekturkapitel 6.3).
 *
 * Drei Eingaben — Termin, Umfang, verfuegbare Zeit —, danach eine ehrliche Machbarkeitsaussage.
 * Die Aussage selbst kommt aus `planner/goal.ts`; diese Datei setzt den Entwurf zusammen, den der
 * Planer bewerten kann, und formuliert den KONKRETEN Vorschlag fuer den Fall, dass es nicht
 * aufgeht.
 *
 * „Bei Unmoeglichkeit muss ein konkreter Vorschlag folgen (Umfang kuerzen, Zeit erhoehen, Tiefe
 * senken), nicht nur eine Warnung." Eine Warnung ohne Ausweg ist der Punkt, an dem eine Person
 * das Ziel gar nicht erst setzt — und ein nicht gesetztes Ziel steuert nichts.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { ApplicationDepth, BrainConcept, LearnerConceptImage, LearningGoal } from '../types'
import { assessGoal, describeFeasibility, type GoalFeasibility } from '../planner/goal'

/** Ein Entwurf, wie ihn der Dialog haelt — noch ohne Id und ohne Zustand. */
export type GoalDraft = {
  title: string
  /** ISO-Datum des Termins. */
  dueAt: string
  conceptIds: string[]
  minutesPerDay: number
  targetDepth?: ApplicationDepth
}

/** Eine Gruppe fuer die Umfangsauswahl — dieselbe Gliederung wie die Themenliste. */
export type GoalScopeGroup = {
  title: string
  conceptIds: string[]
}

/**
 * Konzepte fuer die Umfangsauswahl gruppieren.
 *
 * „Der Umfang braucht die Ueberblicksdarstellung" (Kapitel 7): eine flache Liste aus vierzig
 * Kaestchen ist keine Auswahl, sondern eine Zumutung. Gruppiert wird nach derselben Quelle wie
 * im Pfad, damit „Kapitel 3" hier und dort dasselbe meint.
 */
export function groupConceptsForScope(concepts: BrainConcept[]): GoalScopeGroup[] {
  const groups = new Map<string, string[]>()

  for (const concept of concepts) {
    const title = concept.sourceRef.section?.trim() || 'Weitere Konzepte'
    const bucket = groups.get(title)
    if (bucket) {
      bucket.push(concept.id)
    } else {
      groups.set(title, [concept.id])
    }
  }

  return [...groups.entries()].map(([title, conceptIds]) => ({ title, conceptIds }))
}

export type GoalPreview = {
  /** Die Machbarkeitsaussage in einem Satz — mit Zahlen, ohne Zuspruch. */
  sentence: string
  /** Der konkrete Ausweg, falls es nicht aufgeht. Leer, wenn es aufgeht. */
  suggestion: string
  feasible: boolean
  achievableWithDowngrade: boolean
  assessment: GoalFeasibility | null
  /** Solange der Entwurf unvollstaendig ist, gibt es nichts zu rechnen. */
  isComplete: boolean
}

const MS_PER_DAY = 86_400_000

/**
 * Den Entwurf bewerten, waehrend er entsteht.
 *
 * Die Vorschau haengt bewusst am Entwurf und nicht am gespeicherten Ziel: die Person soll sehen,
 * was ihre Auswahl bedeutet, BEVOR sie sie festlegt. Ein Ziel, dessen Unmoeglichkeit erst nach
 * dem Speichern erscheint, ist eine Falle mit Bestaetigungsknopf.
 */
export function buildGoalPreview(args: {
  draft: GoalDraft
  userId: string
  pathId: string
  images: Map<string, LearnerConceptImage>
  nowIso: string
}): GoalPreview {
  const { draft } = args
  const isComplete = draft.dueAt.trim().length > 0 && draft.conceptIds.length > 0 && draft.minutesPerDay > 0

  if (!isComplete) {
    return {
      sentence: 'Termin, Umfang und Zeit pro Tag — dann rechne ich dir aus, ob das aufgeht.',
      suggestion: '',
      feasible: false,
      achievableWithDowngrade: false,
      assessment: null,
      isComplete: false,
    }
  }

  const goal: LearningGoal = {
    id: 'draft',
    userId: args.userId,
    pathId: args.pathId,
    title: draft.title.trim() || 'Ziel',
    dueAt: draft.dueAt,
    conceptIds: draft.conceptIds,
    minutesPerDay: draft.minutesPerDay,
    status: 'active',
  }

  const targetDepth = draft.targetDepth ?? 'apply'
  const assessment = assessGoal({ goal, images: args.images, targetDepth, nowIso: args.nowIso })

  return {
    sentence: describeFeasibility(assessment, targetDepth),
    suggestion: suggestionFor(assessment),
    feasible: assessment.feasible,
    achievableWithDowngrade: assessment.achievableWithDowngrade,
    assessment,
    isComplete: true,
  }
}

/**
 * Der konkrete Ausweg.
 *
 * Zwei Zahlen, keine Ratschlaege: wie viele Minuten pro Tag es braeuchte, und wie viele Konzepte
 * herausfallen muessten. Beides ist ausrechenbar, und beides ist eine Entscheidung, die nur die
 * Person treffen kann — das System nennt den Preis, nicht die Wahl.
 */
function suggestionFor(assessment: GoalFeasibility): string {
  if (assessment.feasible) {
    return ''
  }
  if (assessment.daysLeft === 0) {
    return 'Der Termin liegt heute. Setz einen neuen, dann rechne ich neu.'
  }

  const neededPerDay = Math.ceil(assessment.minutesNeeded / assessment.daysLeft)

  if (assessment.achievableWithDowngrade && assessment.downgradedConceptIds.length > 0) {
    return `Oder: ${neededPerDay} Minuten pro Tag statt bisher geplant — dann bleibt die Tiefe, wie sie ist.`
  }

  /*
   * Wie viele Konzepte muessten weg? Die teuersten zuerst — dieselbe Reihenfolge wie beim
   * Herabsetzen, und aus demselben Grund: wer kuerzen muss, kuerzt dort, wo am meisten Zeit frei
   * wird, nicht dort, wo es am wenigsten wehtut.
   */
  const byCost = [...assessment.estimates].filter((entry) => entry.minutes > 0).sort((a, b) => b.minutes - a.minutes)
  let remaining = assessment.minutesNeeded
  let dropped = 0
  for (const entry of byCost) {
    if (remaining <= assessment.minutesAvailable) {
      break
    }
    remaining -= entry.minutes
    dropped += 1
  }

  const scopeHint =
    dropped > 0 && dropped < byCost.length
      ? ` Oder ${dropped} ${dropped === 1 ? 'Konzept' : 'Konzepte'} aus dem Umfang nehmen.`
      : ''

  return `Es braeuchte ${neededPerDay} Minuten pro Tag.${scopeHint}`
}

/** Der Standardtermin im Dialog: eine Woche — nah genug, um zu steuern, weit genug, um zu tragen. */
export function defaultDueDate(nowIso: string): string {
  return new Date(new Date(nowIso).getTime() + 7 * MS_PER_DAY).toISOString().slice(0, 10)
}
