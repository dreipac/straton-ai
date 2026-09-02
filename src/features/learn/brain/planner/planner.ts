/**
 * Schicht 4 — der Planer (Kapitel 6).
 *
 * Waehlt deterministisch aus, was als Naechstes drankommt. KEIN Modell (Invariante I11):
 * ein Modell, das entscheidet, was als Naechstes kommt, ist nicht reproduzierbar — dieselbe
 * Ausgangslage kann morgen zu einer anderen Entscheidung fuehren, Fehler sind nicht
 * nachvollziehbar, gezielte Verbesserung ist unmoeglich.
 *
 * Diese Datei importiert bewusst nichts aus `../agents/`. Wer das aendern will, aendert I11.
 *
 * Zwei Schutzmechanismen aus Kapitel 6.4 sind hier eingebaut:
 *  - Wiederholungs-Mindestreserve (I9): ein kleiner Anteil jeder Sitzung bleibt reserviert,
 *    auch im Zielmodus. Sonst verhungert die Wiederholung und der Nutzer wacht nach der
 *    Pruefung mit einem verfallenen Lernerbild auf.
 *  - Erklaerpflicht (I8): jede Auswahl traegt ihren Satz, erzeugt in `explanation.ts`.
 *
 * Rein — kein DOM, kein I/O.
 */

import type {
  BrainConcept,
  BrainPrerequisiteEdge,
  LearnerConceptImage,
  LearningGoal,
  PlannedTask,
  TaskFormat,
} from '../types'
import { assertReviewReserveHeld } from '../invariants'
import { needsWorkForGoal, sprintScopeOf } from './sprint'
import { effectiveMastery } from '../memory/learnerImage'
import { findRootCauses } from '../memory/knowledgeGraph'
import { nextDepthFor } from '../perception/evidence'
import { formatRotationOffset, selectFormat } from '../production/formats'
import { REVIEW_STACK_DEPTH, responsibilityFor } from './responsibility'
import { explainSelection } from './explanation'
import {
  coldStartUrgency,
  combineUrgencies,
  goalUrgency,
  motivationUrgency,
  reviewUrgency,
  rootCauseUrgency,
  type ConceptUrgency,
} from './urgency'
import { depthRank, type UrgencySignal } from '../types'

/**
 * Der Boden der Wiederholungs-Mindestreserve (I9).
 *
 * „Kein starres Verhaeltnis, aber ein Boden." Es ist ein Minimum, keine Quote: gewinnt die
 * Wiederholung ohnehin mehr Plaetze, bleiben sie ihr.
 */
export const REVIEW_RESERVE_SHARE = 0.2

/**
 * Ab dieser Sitzungsgroesse gilt die Reserve.
 *
 * Eine Sitzung aus einer oder zwei Aufgaben ist ein Bruchstueck, keine Sitzung — und ein Boden,
 * der dort greift, waere kein Boden, sondern eine Decke: er belegte die halbe oder ganze
 * Sitzung, und ein gesetztes Ziel kaeme nie an die Reihe. Genau das wuerde Kapitel 6.2
 * („Ziel uebersteuert") aushebeln. Der Live-Fluss fordert Aufgaben einzeln an
 * (`planNextTask`); die Reserve wirkt dort ueber die geplante Sitzung, nicht ueber den
 * Einzelabruf.
 */
export const MIN_SESSION_FOR_REVIEW_RESERVE = 3

/**
 * Wie viele Plaetze der Wiederholung reserviert sind.
 *
 * Die eine Stelle, an der der Boden gerechnet wird — der Guard aus `invariants.ts` prueft
 * gegen genau dieses Ergebnis, statt es nachzurechnen.
 *
 * Die Deckelung auf `sessionSize - 1` ist der Kern: die Reserve darf nie die ganze Sitzung
 * beanspruchen, sonst waere sie keine Reserve mehr, sondern die Sitzung.
 */
export function reviewReserveSlots(sessionSize: number, candidatesAvailable: number): number {
  if (sessionSize < MIN_SESSION_FOR_REVIEW_RESERVE || candidatesAvailable <= 0) {
    return 0
  }
  return Math.min(
    candidatesAvailable,
    sessionSize - 1,
    Math.max(1, Math.ceil(sessionSize * REVIEW_RESERVE_SHARE)),
  )
}

/**
 * Aufsteigende Anwendungstiefe innerhalb der Sitzung (Kapitel 6.6).
 *
 * „Regel fuer den Sitzungsaufbau: innerhalb einer Sitzung steigt die Tiefe an. So entsteht pro
 *  Sitzung Evidenz auf mehreren Stufen statt fuenfmal auf derselben."
 *
 * Die Tiefe ist damit das erste Sortierkriterium, die Dringlichkeit das zweite. Vorher entschied
 * allein die Dringlichkeit — die Reihenfolge ist mit 6.6 explizit geworden und ersetzt die
 * frueher hier stehende Begruendung („eine Sitzung, die mit Wiederholung beginnt, fuehlt sich
 * zaeh an"). Der Effekt ist derselbe: Wiederholungen laufen auf Erkennen (Kapitel 6.7) und
 * stehen damit ohnehin vorne, wo sie als Aufwaermen wirken statt als Bremse.
 *
 * WICHTIG: sortiert wird nur, die Tiefe selbst wird nicht angehoben. Sie stammt aus
 * `nextDepthFor` und damit aus dem Stand des Lernerbilds — eine Transferaufgabe zu stellen, weil
 * die Sitzung gerade dort angekommen ist, erzeugte Frust statt Evidenz.
 */
function orderByAscendingDepth(tasks: PlannedTask[]): PlannedTask[] {
  return [...tasks].sort((a, b) => {
    const depthDelta = depthRank(a.depth) - depthRank(b.depth)
    if (depthDelta !== 0) {
      return depthDelta
    }
    if (b.urgency !== a.urgency) {
      return b.urgency - a.urgency
    }
    return a.conceptId < b.conceptId ? -1 : 1
  })
}

export type PlanSessionInput = {
  concepts: BrainConcept[]
  edges: BrainPrerequisiteEdge[]
  images: Map<string, LearnerConceptImage>
  goal: LearningGoal | null
  /** Wie viele Aufgaben diese Sitzung umfasst. */
  sessionSize: number
  /** Fehlschlaege in Folge, fuer den Frustrationsschutz. */
  consecutiveFailures: number
  /** Informationsgewinn je noch ungesehenem Konzept (Kaltstart, siehe coldstart/frontSearch.ts). */
  coldStartGains?: Map<string, number>
  /** Zuletzt gestelltes Format je Konzept, damit sich Formate nicht wiederholen. */
  lastFormatByConcept?: Map<string, TaskFormat>
  /** Konzepte mit einem benannten Verwechslungsmuster — bekommen bevorzugt Abgrenzungsaufgaben. */
  conceptsWithConfusionPattern?: Set<string>
  /**
   * „Spaeter" — vom Nutzer gerade zurueckgewiesene Konzepte (UI-Spezifikation 3.3).
   *
   * Die Zurueckweisung ist selbst ein Signal, und zwar ein NEGATIVES an den Planer, nicht an das
   * Lernerbild: sie darf keinen Wert bewegen (I1), sie nimmt dem Konzept nur diese Runde. „Nach
   * dem Klick waehlt der Planer die naechstdringlichste Option und begruendet erneut" — genau das
   * leistet der Ausschluss aus der Rangliste. Ein Konzept ganz aus der Dringlichkeitsrechnung zu
   * nehmen waere falsch: es meldet weiter, es kommt nur jetzt nicht dran.
   */
  deferredConceptIds?: ReadonlySet<string>
  nowIso: string
}

export type SessionPlan = {
  tasks: PlannedTask[]
  /** Alle Dringlichkeiten, absteigend — fuer Diagnose, nie fuer den Nutzer. */
  ranking: ConceptUrgency[]
  reviewSlotsUsed: number
  reviewCandidatesAvailable: number
  /** Wie viele Plaetze der Wiederholung reserviert waren (I9); 0 = kein Boden in dieser Sitzung. */
  reserveTarget: number
}

/** Alle Dringlichkeitssignale eines Pfads einsammeln. */
export function collectUrgencySignals(input: PlanSessionInput): UrgencySignal[] {
  const { concepts, edges, images, goal, nowIso } = input
  const signals: UrgencySignal[] = []

  for (const concept of concepts) {
    const image = images.get(concept.id)

    if (image) {
      const review = reviewUrgency(image, nowIso)
      if (review) {
        signals.push(review)
      }

      const rootCause = rootCauseUrgency(image, nowIso)
      if (rootCause) {
        signals.push(rootCause)
      }

      const motivation = motivationUrgency({
        image,
        consecutiveFailures: input.consecutiveFailures,
        nowIso,
      })
      if (motivation) {
        signals.push(motivation)
      }
    }

    const goalSignal = goalUrgency({ image, conceptId: concept.id, goal, nowIso })
    if (goalSignal) {
      signals.push(goalSignal)
    }

    const gain = input.coldStartGains?.get(concept.id) ?? 0
    const coldStart = coldStartUrgency({ conceptId: concept.id, image, informationGain: gain })
    if (coldStart) {
      signals.push(coldStart)
    }
  }

  /*
   * Ursachensuche ueber den Graphen: fuer jedes markierte Konzept auch dessen schwache
   * Voraussetzungen melden. Ohne diesen Schritt bliebe die Ursachensuche auf dem Knoten sitzen,
   * an dem der Fehler AUFTRAT — und genau dort liegt die Luecke meistens nicht.
   */
  for (const concept of concepts) {
    const image = images.get(concept.id)
    if (!image?.reviewNeeded) {
      continue
    }
    const causes = findRootCauses({ conceptId: concept.id, edges, images })
    for (const cause of causes.slice(0, 3)) {
      signals.push({
        claim: 'rootCause',
        conceptId: cause.conceptId,
        // Je weiter zurueck, desto schwaecher — dieselbe Daempfung wie bei der Propagation.
        urgency: Math.max(0, (1 - cause.mastery) / Math.max(1, cause.distance)),
        reason: `Bei „${concept.name}" hakte es; das hier ist die Voraussetzung dahinter.`,
      })
    }
  }

  return signals
}

/**
 * Eine Sitzung planen.
 *
 * Ablauf:
 *  1. Signale einsammeln und je Konzept zu einer Dringlichkeit verdichten.
 *  2. Deterministisch sortieren — bei Gleichstand entscheidet die Konzept-Id, damit dieselbe
 *     Ausgangslage zweimal dieselbe Sitzung ergibt.
 *  3. Die Mindestreserve fuer Wiederholung zuerst fuellen (I9).
 *  4. Die uebrigen Plaetze nach Rangfolge.
 *  5. Jede Auswahl mit Tiefe, Format und Begruendung ausstatten (I8).
 */
export function planSession(input: PlanSessionInput): SessionPlan {
  const { concepts, images, goal, nowIso } = input
  const nameById = new Map(concepts.map((concept) => [concept.id, concept.name]))
  const signals = collectUrgencySignals(input)

  const ranking: ConceptUrgency[] = []
  for (const concept of concepts) {
    if (input.deferredConceptIds?.has(concept.id)) {
      // Zurueckgewiesen (3.3): nicht in dieser Runde. Die Signale bleiben gesammelt, damit die
      // Diagnose ehrlich bleibt — nur die Auswahl uebergeht das Konzept.
      continue
    }
    const combined = combineUrgencies(concept.id, signals)
    if (combined) {
      ranking.push(combined)
    }
  }
  ranking.sort((a, b) =>
    b.urgency !== a.urgency ? b.urgency - a.urgency : a.conceptId < b.conceptId ? -1 : 1,
  )

  /*
   * Vorrang des Zielumfangs im Sprint (Kapitel 6.3, Sonderfall knapper Termin).
   *
   * Der geschnittene Umfang ist eine REIHENFOLGE, keine Mauer: solange im Umfang etwas offen
   * ist, kommt nur Umfang; ist dort nichts mehr offen, geht der Pfad von selbst mit dem Rest
   * weiter. Damit wird niemand ausgebremst, der schneller ist als geplant — und niemand bekommt
   * Randbegriffe zwischen die Zielkonzepte gemischt, solange die Zeit knapp ist.
   *
   * „Offen" misst `needsWorkForGoal` — dieselbe Definition, die `assessGoal` fuer
   * `openConceptCount` benutzt. „Meldet eine Dringlichkeit" waere hier falsch: ein sitzendes
   * Konzept liefert ueber `rootCauseUrgency` weiterhin einen winzigen Wert, und der Umfang
   * waere damit nie erledigt.
   *
   * Die Mindestreserve ist bewusst NICHT eingeschraenkt (I9): eine faellige Wiederholung kostet
   * eine kurze Abfrage und bewahrt Gelerntes davor, waehrend des Sprints wegzurutschen.
   */
  const sprintScope = sprintScopeOf(goal, nowIso)
  const openInScope =
    sprintScope && goal
      ? ranking.filter(
          (entry) =>
            sprintScope.has(entry.conceptId) &&
            needsWorkForGoal(images.get(entry.conceptId), goal.targetDepth, nowIso),
        )
      : []
  const eligible = openInScope.length > 0 ? openInScope : ranking

  const sessionSize = Math.max(0, Math.trunc(input.sessionSize))

  /*
   * Die Mindestreserve wird aus dem faelligen STAPEL gefuellt, nicht aus allem, was gerade
   * verblasst (Kapitel 6.7).
   *
   * Der Unterschied ist nicht kosmetisch: ein Konzept, das nie gefestigt war oder auf
   * Anwenden-Ebene aufgefrischt werden muss, gehoert in den Pfad. Landete es in der Reserve,
   * traege die Sitzung eine Aufgabe mit der Kennzeichnung „Eingemischt aus deinem faelligen
   * Stapel", die dort gar nicht steht — und die Ursachensuche, die das Konzept braucht, faende
   * nie statt. Solche Konzepte melden weiterhin ihre Dringlichkeit an; sie bewerben sich nur
   * ueber die regulaeren Plaetze statt ueber die Reserve.
   */
  const reviewCandidates = ranking.filter((entry) => {
    if (entry.claim !== 'review') {
      return false
    }
    const image = images.get(entry.conceptId)
    return image != null && responsibilityFor(image, nowIso).responsibility === 'review'
  })
  const reserveTarget = reviewReserveSlots(sessionSize, reviewCandidates.length)

  const chosen: { entry: ConceptUrgency; fromReserve: boolean }[] = []
  const taken = new Set<string>()

  for (const entry of reviewCandidates.slice(0, reserveTarget)) {
    chosen.push({ entry, fromReserve: true })
    taken.add(entry.conceptId)
  }

  for (const entry of eligible) {
    if (chosen.length >= sessionSize) {
      break
    }
    if (taken.has(entry.conceptId)) {
      continue
    }
    chosen.push({ entry, fromReserve: false })
    taken.add(entry.conceptId)
  }

  const daysToDeadline = goal
    ? Math.max(0, Math.ceil((new Date(goal.dueAt).getTime() - new Date(nowIso).getTime()) / 86_400_000))
    : undefined

  const unordered: PlannedTask[] = chosen.slice(0, sessionSize).map(({ entry, fromReserve }) => {
    const image = images.get(entry.conceptId)
    /*
     * Eingemischte Wiederholungen laufen auf Erkennen (Kapitel 6.7, Zeile „Anwendungstiefe").
     * Sie sind kurz und mechanisch — eine Transferaufgabe aus dem Stapel waere weder das eine
     * noch das andere und wuerde den Faden der Sitzung reissen.
     */
    const depth = fromReserve
      ? REVIEW_STACK_DEPTH
      : image
        ? nextDepthFor(image, goal?.targetDepth)
        : 'recognize'
    const spec = selectFormat({
      depth,
      /*
       * Der konzeptabhaengige Versatz sorgt dafuer, dass nicht alle Konzepte bei demselben Format
       * beginnen — sonst besteht die erste Sitzung eines frischen Pfads (ueberall noch keine
       * direkte Evidenz) ausschliesslich aus Auswahlfragen. Deterministisch, siehe
       * `formatRotationOffset`; I11 bleibt gewahrt.
       */
      attemptIndex: (image?.directEvidenceCount ?? 0) + formatRotationOffset(entry.conceptId),
      avoidFormat: input.lastFormatByConcept?.get(entry.conceptId) ?? null,
      hasConfusionPattern: input.conceptsWithConfusionPattern?.has(entry.conceptId) ?? false,
    })

    const reason = explainSelection({
      claim: entry.claim,
      conceptName: nameById.get(entry.conceptId) ?? entry.conceptId,
      depth,
      signalReason: entry.reason,
      fromReviewReserve: fromReserve,
      ...(daysToDeadline != null ? { daysToDeadline } : {}),
    })

    return {
      conceptId: entry.conceptId,
      claim: entry.claim,
      urgency: entry.urgency,
      reason,
      urgencyBreakdown: entry.breakdown,
      depth,
      format: spec.format,
      fromReviewReserve: fromReserve,
    }
  })

  const tasks = orderByAscendingDepth(unordered)

  const reviewSlotsUsed = tasks.filter((task) => task.claim === 'review').length

  assertReviewReserveHeld({ reviewSlotsUsed, reserveTarget, sessionSize })

  return {
    tasks,
    ranking,
    reviewSlotsUsed,
    reviewCandidatesAvailable: reviewCandidates.length,
    reserveTarget,
  }
}

/**
 * Die naechste einzelne Aufgabe.
 *
 * Der Live-Fluss braucht keine ganze Sitzung auf einmal, sondern immer nur die naechste — die
 * Vorproduktion (Kapitel 7.1) erzeugt sie, waehrend der Nutzer an der aktuellen sitzt. Weil der
 * Planer deterministisch ist, ist „naechste Aufgabe" nichts anderes als eine Sitzung der
 * Groesse eins auf dem aktuellen Stand.
 */
export function planNextTask(input: Omit<PlanSessionInput, 'sessionSize'>): PlannedTask | null {
  const plan = planSession({ ...input, sessionSize: 1 })
  return plan.tasks[0] ?? null
}

/** Fortschritt eines Pfads: Anteil der Konzepte, die sitzen. */
export function pathProgress(
  concepts: BrainConcept[],
  images: Map<string, LearnerConceptImage>,
  nowIso: string,
  masteryThreshold = 0.75,
): { mastered: number; total: number; ratio: number } {
  const total = concepts.length
  const mastered = concepts.filter((concept) => {
    const image = images.get(concept.id)
    return image != null && effectiveMastery(image, nowIso) >= masteryThreshold
  }).length
  return { mastered, total, ratio: total > 0 ? mastered / total : 0 }
}
