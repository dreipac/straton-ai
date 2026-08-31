/**
 * Anbindung: Lernsitzung und Abschlussbilanz (UI-Spezifikation Kapitel 4 und 15).
 *
 * Zwei Regeln aus Kapitel 4 sind hier verdrahtet, weil sie Produktentscheidungen sind und keine
 * Gestaltung:
 *
 *  - **4.8 — Werte bewegen sich erst in der Bilanz.** Waehrend der Sitzung gibt diese Schicht
 *    keine aktualisierten Werte heraus. Nicht „die Komponente zeigt sie nur nicht an", sondern:
 *    es gibt sie hier nicht zu holen. Zwischenstaende nach einzelnen Antworten springen stark und
 *    wirken nach einem Fehler entmutigend.
 *
 *  - **4.7 — kein zweiter Versuch in derselben Sitzung.** Die Segmentleiste springt deshalb nie
 *    zurueck; `progressIndex` waechst monoton.
 *
 * Rein — kein DOM, kein I/O.
 */

import type {
  ApplicationDepth,
  BrainConcept,
  EvidenceEvent,
  GeneratedTask,
  LearnerConceptImage,
  PlannedTask,
  TaskFormat,
} from '../types'
import { effectiveConfidence, effectiveMastery } from '../memory/learnerImage'
import { formatSpec } from '../production/formats'
import { explanationAllowed } from '../production/explanations'
import { summariseColdStart } from '../coldstart/frontSearch'

// ---------------------------------------------------------------------------
// Der Sitzungsrahmen
// ---------------------------------------------------------------------------

/** Woher ein Platz in der Sitzung stammt (Kapitel 4.2, Tabelle „Platzbelegung"). */
export type SlotOrigin = 'anchor' | 'review' | 'nextInPath'

export type SessionSlotView = {
  index: number
  conceptId: string
  conceptName: string
  origin: SlotOrigin
  depth: ApplicationDepth
  format: TaskFormat
  formatLabel: string
  /** Invariante I8 — der eine Satz. */
  reason: string
  /** Kennzeichnung eingemischter Wiederholungen (Kapitel 4.2). */
  badge: string | null
  /** Untertitel der Kennzeichnung; ohne ihn wirkt die Einmischung wie ein Themensprung. */
  badgeSubtitle: string | null
  /** Bekommt dieser Platz einen Einstiegstext? (Kapitel 4.4a) */
  hasIntro: boolean
}

export type SessionView = {
  slots: SessionSlotView[]
  taskCount: number
  /** Der Ankerknoten der Sitzung — das Konzept, um das herum geplant wurde. */
  anchorConceptId: string | null
  /** Kaltstart-Ansage vorab (Kapitel 10); leer, wenn die Phase vorbei ist. */
  coldStartNotice: string
}

/**
 * Ansage vor der ersten Aufgabe waehrend des Kaltstarts (Kapitel 10).
 *
 * „Die stark springenden Werte der ersten Sitzung sind dadurch erklaert und wirken lebendig statt
 * kaputt. Die erhoehte Lernrate waehrend dieser Phase ist ein Architekturdetail und wird nicht
 * erwaehnt." — genau deshalb steht hier ein Satz ueber die AUFGABEN und keiner ueber das Modell.
 */
export const COLD_START_NOTICE =
  'Die ersten Aufgaben nutze ich, um dich einzuschaetzen — sie koennen zu leicht oder zu schwer wirken.'

/**
 * Die Sitzung aufbereiten.
 *
 * Der Anker ist der erste Platz, der KEINE eingemischte Wiederholung ist: die Wiederholung kommt
 * aus einem anderen Konzept und ist ausdruecklich „nicht Teil des Einschubs" (Kapitel 4.2).
 * Alles Weitere am selben Konzept gehoert zum Anker; ein anderes Konzept ohne Reservemarkierung
 * ist der naechste Schritt im Pfad.
 */
export function buildSessionView(args: {
  tasks: PlannedTask[]
  concepts: BrainConcept[]
  images: Map<string, LearnerConceptImage>
  /** Faelligkeitsgrund je eingemischtem Konzept, aus `planner/responsibility.ts`. */
  dueReasons?: Map<string, string>
  inColdStart: boolean
}): SessionView {
  const nameById = new Map(args.concepts.map((concept) => [concept.id, concept.name]))
  const anchor = args.tasks.find((task) => !task.fromReviewReserve)?.conceptId ?? null

  const slots = args.tasks.map((task, index) => {
    const name = nameById.get(task.conceptId) ?? task.conceptId
    const origin: SlotOrigin = task.fromReviewReserve
      ? 'review'
      : task.conceptId === anchor
        ? 'anchor'
        : 'nextInPath'

    return {
      index,
      conceptId: task.conceptId,
      conceptName: name,
      origin,
      depth: task.depth,
      format: task.format,
      formatLabel: formatSpec(task.format).label,
      reason: task.reason,
      badge: origin === 'review' ? `Wiederholung · ${name}` : null,
      badgeSubtitle:
        origin === 'review'
          ? args.dueReasons?.get(task.conceptId) ??
            'Eingemischt aus deinem faelligen Stapel — nicht Teil des Einschubs.'
          : null,
      hasIntro: explanationAllowed({ slot: 'intro', image: args.images.get(task.conceptId) }),
    }
  })

  return {
    slots,
    taskCount: slots.length,
    anchorConceptId: anchor,
    coldStartNotice: args.inColdStart ? COLD_START_NOTICE : '',
  }
}

/**
 * Fortschritt in der Segmentleiste.
 *
 * Kapitel 4.7: „die Segmentleiste springt nie zurueck". Deshalb zaehlt sie BEANTWORTETE Aufgaben,
 * nicht richtige — eine falsche Antwort ist erledigte Arbeit, kein Rueckschritt. Ein Balken, der
 * nach einem Fehler zurueckspringt, erzeugt genau den Frustkreisel, den 4.7 ausschliesst.
 */
export function sessionProgress(answeredCount: number, taskCount: number): {
  index: number
  total: number
  label: string
  isLast: boolean
} {
  const index = Math.max(0, Math.min(taskCount, answeredCount))
  return {
    index,
    total: taskCount,
    label: `${Math.min(index + 1, taskCount)} von ${taskCount}`,
    isLast: index >= taskCount - 1,
  }
}

/** Beschriftung des Weiter-Knopfs (Kapitel 4.7). */
export function continueLabel(answeredCount: number, taskCount: number): string {
  return answeredCount >= taskCount - 1 ? 'Sitzung abschliessen' : 'Weiter'
}

/**
 * „Ich weiss es nicht" (Kapitel 4.6).
 *
 * „Der wichtigste unscheinbare Baustein der Sitzung: ohne ihn raet der Nutzer, und Raten erzeugt
 * verrauschte Evidenz, die das Lernerbild verschmutzt." Wird ausdruecklich als OFFEN verbucht,
 * nicht als Fehler — und dem Nutzer auch so gesagt.
 */
export const DONT_KNOW_ACKNOWLEDGEMENT =
  'Als offen verbucht, nicht als Fehler. Das ist eine brauchbare Auskunft — Raten waere es nicht.'

/*
 * Zuordnungsformat (`matching`) — interaktive Antwort statt Fliesstext.
 *
 * Die Logik selbst gehoert zu `production/formats.ts` (Schicht 5, wo alles Weitere ueber
 * `matching` bereits steht), nicht hierher: `ui/` baut auf `production/` auf, nicht umgekehrt.
 * Re-exportiert, damit `components/BrainSession.tsx` — wie alle Komponenten — nur gegen `ui/`
 * anbindet und nicht selbst nach `production/` durchgreift.
 */
export { composeMatchingAnswer, matchingAssignmentComplete } from '../production/formats'

/**
 * Anzeigetext ueber der interaktiven Zuordnung — ersetzt dort den ausgeschriebenen Aufgabentext.
 *
 * Der Aufgabentext (`task.prompt`) zaehlt Begriffe und Beschreibungen mit "A) … B) …" / "1) … 2) …"
 * einzeln auf (verbindlich fuer den Kontrolleur, der genau diesen Text gegen die Quelle prueft —
 * siehe `production/generateTask.ts`). Sobald die Karten selbst zu sehen sind, ist diese Aufzaehlung
 * nur noch eine zweite Kopie derselben Information. `task.prompt` bleibt dabei unveraendert, was der
 * Kontrolleur geprueft hat — nur die ANZEIGE in `components/BrainSession.tsx` wechselt fuer diesen
 * einen Fall auf einen festen, kurzen Satz statt der Aufzaehlung.
 */
export const MATCHING_INTERACTIVE_PROMPT = 'Ordne jede Beschreibung dem passenden Begriff zu.'

/**
 * Herkunftshinweis zur ANTWORT einer Aufgabe (I4, auf die Aufgabenebene erweitert).
 *
 * Steht die Antwort nicht im hochgeladenen Material, muss die Person das sehen — sonst haelt sie
 * fuer belegt, was nur plausibel ist. Genau dieselbe Haltung wie bei `provenanceLine` am Knoten:
 * nicht verschweigen, sondern benennen, damit sie weiss, was sie gegenpruefen sollte.
 *
 * `null` im Normalfall (Antwort aus dem Material) — dort gibt es nichts zu vermelden.
 */
export function answerProvenanceNote(provenance: GeneratedTask['answerProvenance']): string | null {
  if (provenance === 'web') {
    return 'Dein Material stellt diese Frage, beantwortet sie aber nicht. Die Lösung stammt aus einer Recherche im Web.'
  }
  if (provenance === 'model') {
    return 'Dein Material stellt diese Frage, beantwortet sie aber nicht. Die Lösung stammt aus dem Fachwissen des Systems — prüfe sie im Unterricht gegen.'
  }
  return null
}

// ---------------------------------------------------------------------------
// Abschlussbilanz (Kapitel 4.9)
// ---------------------------------------------------------------------------

export type BalanceChange =
  /** Beherrschung hat sich messbar bewegt: „34 % → 58 %". */
  | { kind: 'mastery'; conceptId: string; conceptName: string; before: number; after: number; label: string }
  /** Nur die Sicherheit — auch an Knoten, an denen nicht gearbeitet wurde (Propagation sichtbar gemacht). */
  | { kind: 'confidence'; conceptId: string; conceptName: string; direction: 'up' | 'down'; label: string }
  /** Von der Konsolidierung ergaenzt. */
  | { kind: 'newNode'; conceptId: string; conceptName: string; label: string }

export type SessionSummaryView = {
  headline: string
  /** „4 von 5 richtig · rund 8 Minuten" */
  stats: string
  correctCount: number
  taskCount: number
  minutes: number
  changes: BalanceChange[]
  /** Erledigte Einschuebe, namentlich. */
  resolvedInserts: string[]
  /** Ein Satz, wie es weitergeht — aus Planer und Erklaerer. */
  nextStep: string
  /** Nur nach der ersten Sitzung (Kapitel 10). */
  coldStartVerdict: string
}

/** Ab dieser Veraenderung gilt eine Beherrschung als „hat sich bewegt". */
export const MASTERY_CHANGE_THRESHOLD = 0.02
/** Ab dieser Veraenderung gilt eine Sicherheit als gestiegen oder gefallen. */
export const CONFIDENCE_CHANGE_THRESHOLD = 0.05

function percent(value: number): string {
  return `${Math.round(value * 100)} %`
}

/**
 * Die Abschlussbilanz bauen.
 *
 * „Nicht ‚gut gemacht', sondern was sich veraendert hat." Der Bildschirm traegt das gesamte
 * Erlebnis, weil waehrend der Sitzung nichts angezeigt wurde (Kapitel 4.8) — er ist der
 * wichtigste Bildschirm der Sitzung, kein Anhaengsel.
 *
 * Die Reihenfolge ist bewusst: zuerst bewegte Beherrschung (das Erwartete), dann Sicherheiten
 * (das Erklaerungsbeduerftige — hier wird die Propagation sichtbar), dann neue Knoten. Umgekehrt
 * gelesen wirkten die Nebenwirkungen wie die Hauptsache.
 */
export function buildSessionSummary(args: {
  before: Map<string, LearnerConceptImage>
  after: Map<string, LearnerConceptImage>
  concepts: BrainConcept[]
  events: EvidenceEvent[]
  /** Konzepte, die die Konsolidierung waehrend der Sitzung ergaenzt hat. */
  newConceptIds?: string[]
  /** Einschuebe, die mit dieser Sitzung erledigt sind. */
  resolvedInsertConceptIds?: string[]
  /** Der naechste Schritt, bereits begruendet (I8). */
  nextStep: string
  minutes: number
  /** Nur bei der ersten Sitzung belegt. */
  coldStart?: Parameters<typeof summariseColdStart>[0]
  nowIso: string
}): SessionSummaryView {
  const nameById = new Map(args.concepts.map((concept) => [concept.id, concept.name]))
  const nameOf = (conceptId: string) => nameById.get(conceptId) ?? conceptId

  const changes: BalanceChange[] = []
  const masteryChanges: BalanceChange[] = []
  const confidenceChanges: BalanceChange[] = []

  for (const [conceptId, after] of args.after) {
    const before = args.before.get(conceptId)
    if (!before) {
      continue
    }

    const masteryBefore = effectiveMastery(before, args.nowIso)
    const masteryAfter = effectiveMastery(after, args.nowIso)
    if (Math.abs(masteryAfter - masteryBefore) >= MASTERY_CHANGE_THRESHOLD) {
      masteryChanges.push({
        kind: 'mastery',
        conceptId,
        conceptName: nameOf(conceptId),
        before: masteryBefore,
        after: masteryAfter,
        label: `${percent(masteryBefore)} → ${percent(masteryAfter)}`,
      })
      continue
    }

    const confidenceBefore = effectiveConfidence(before, args.nowIso)
    const confidenceAfter = effectiveConfidence(after, args.nowIso)
    const delta = confidenceAfter - confidenceBefore
    if (Math.abs(delta) >= CONFIDENCE_CHANGE_THRESHOLD) {
      confidenceChanges.push({
        kind: 'confidence',
        conceptId,
        conceptName: nameOf(conceptId),
        direction: delta > 0 ? 'up' : 'down',
        label: delta > 0 ? 'Sicherheit gestiegen' : 'Sicherheit gesunken',
      })
    }
  }

  changes.push(...masteryChanges, ...confidenceChanges)

  for (const conceptId of args.newConceptIds ?? []) {
    changes.push({
      kind: 'newNode',
      conceptId,
      conceptName: nameOf(conceptId),
      label: 'neuer Knoten aus Verdacht',
    })
  }

  const graded = args.events.filter((event) => event.source === 'gradedTask')
  const correctCount = graded.filter((event) => event.verdict.credit >= 0.5).length

  return {
    headline: 'Das hat sich veraendert',
    stats: `${correctCount} von ${graded.length} richtig · rund ${Math.max(1, Math.round(args.minutes))} Minuten`,
    correctCount,
    taskCount: graded.length,
    minutes: args.minutes,
    changes,
    resolvedInserts: (args.resolvedInsertConceptIds ?? []).map(nameOf),
    nextStep: args.nextStep,
    coldStartVerdict: args.coldStart ? summariseColdStart(args.coldStart).sentence : '',
  }
}
