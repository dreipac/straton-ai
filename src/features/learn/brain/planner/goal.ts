/**
 * Schicht 4 — das Ziel als echtes Objekt (Kapitel 6.3).
 *
 * „Damit ‚Ziel uebersteuert' funktionieren kann, muss ein Ziel drei Angaben enthalten:
 *  Termin, Umfang, verfuegbare Zeit. Erst damit kann das Gehirn rueckwaerts rechnen und eine
 *  ehrliche Machbarkeitsaussage treffen."
 *
 * Diese Ehrlichkeit ist ein Alleinstellungsmerkmal. Konkurrenzprodukte liefern an dieser Stelle
 * Motivationssprueche. Deshalb rechnet diese Datei die Machbarkeit aus und liefert im
 * Nichtmachbarkeitsfall keinen Zuspruch, sondern einen konkreten Verzicht: welche Konzepte auf
 * einer niedrigeren Anwendungstiefe bleiben muessen, damit sich der Rest ausgeht.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { ApplicationDepth, LearnerConceptImage, LearningGoal } from '../types'
import { depthRank, DEPTH_ORDER } from '../types'
import { effectiveMastery } from '../memory/learnerImage'

/**
 * Geschaetzter Zeitbedarf in Minuten, um ein Konzept von Null auf die jeweilige Stufe zu bringen.
 *
 * Grobe Schaetzwerte — ihre Aufgabe ist nicht Praezision, sondern eine ehrliche Groessenordnung.
 * Eine Machbarkeitsaussage, die um 20 Prozent danebenliegt, ist immer noch unendlich viel
 * nuetzlicher als ein Motivationsspruch.
 */
export const MINUTES_TO_REACH: Record<ApplicationDepth, number> = {
  recognize: 6,
  apply: 14,
  transfer: 24,
}

/** Ab dieser Beherrschung gilt ein Konzept auf seiner Stufe als sitzend. */
export const GOAL_MASTERY_TARGET = 0.75

export type ConceptWorkEstimate = {
  conceptId: string
  currentDepth: ApplicationDepth
  targetDepth: ApplicationDepth
  minutes: number
}

/**
 * Restaufwand fuer ein einzelnes Konzept.
 *
 * Beruecksichtigt beides: wie weit die Beherrschung noch fehlt UND wie viele Stufen der
 * Anwendungstiefe noch offen sind. Ein Konzept, das auf „Erkennen" sitzt, aber „Anwenden"
 * erreichen soll, ist nicht fertig, auch wenn die Beherrschung hoch ist.
 */
export function estimateConceptMinutes(args: {
  image: LearnerConceptImage | undefined
  targetDepth: ApplicationDepth
  nowIso: string
}): number {
  const { image, targetDepth, nowIso } = args
  const full = MINUTES_TO_REACH[targetDepth]

  if (!image) {
    return full
  }

  const mastery = effectiveMastery(image, nowIso)
  const depthGap = Math.max(0, depthRank(targetDepth) - depthRank(image.depth))

  // Fehlender Anteil der Beherrschung auf der aktuellen Stufe …
  const masteryGap = Math.max(0, GOAL_MASTERY_TARGET - mastery) / GOAL_MASTERY_TARGET
  // … plus der Aufwand fuer jede noch offene Stufe.
  const stepMinutes = depthGap * (MINUTES_TO_REACH[targetDepth] - MINUTES_TO_REACH[image.depth])

  return Math.max(0, masteryGap * full + Math.max(0, stepMinutes))
}

export type GoalFeasibility = {
  /** Konzepte des Umfangs, die noch Arbeit brauchen. */
  openConceptCount: number
  /** Verbleibende Tage bis zum Termin, mindestens 0. */
  daysLeft: number
  minutesNeeded: number
  minutesAvailable: number
  feasible: boolean
  /** Fehlende Minuten; 0 wenn machbar. */
  shortfallMinutes: number
  /**
   * Konkreter Verzicht, falls nicht machbar: diese Konzepte bleiben auf einer niedrigeren
   * Anwendungstiefe. Leer, wenn machbar oder wenn auch der Verzicht nicht reicht.
   */
  downgradedConceptIds: string[]
  /** Reicht auch der Verzicht nicht, ist das Ziel in der Form nicht erreichbar. */
  achievableWithDowngrade: boolean
  estimates: ConceptWorkEstimate[]
}

const MS_PER_DAY = 86_400_000

/**
 * Rueckwaerts rechnen: passt der Umfang bis zum Termin in die verfuegbare Zeit?
 *
 * Vorgehen, wenn es nicht passt: die Konzepte mit dem groessten Restaufwand werden der Reihe
 * nach eine Stufe herabgesetzt, bis es passt. Das ist die ehrlichste Reihenfolge — wer kuerzen
 * muss, kuerzt dort, wo am meisten Zeit frei wird, nicht dort, wo es am wenigsten wehtut.
 */
export function assessGoal(args: {
  goal: LearningGoal
  images: Map<string, LearnerConceptImage>
  targetDepth?: ApplicationDepth
  nowIso: string
}): GoalFeasibility {
  const { goal, images, nowIso } = args
  const targetDepth = args.targetDepth ?? 'apply'

  const now = new Date(nowIso).getTime()
  const due = new Date(goal.dueAt).getTime()
  const daysLeft = Number.isFinite(due) && Number.isFinite(now) ? Math.max(0, Math.ceil((due - now) / MS_PER_DAY)) : 0

  const estimates: ConceptWorkEstimate[] = goal.conceptIds.map((conceptId) => {
    const image = images.get(conceptId)
    return {
      conceptId,
      currentDepth: image?.depth ?? 'recognize',
      targetDepth,
      minutes: estimateConceptMinutes({ image, targetDepth, nowIso }),
    }
  })

  const open = estimates.filter((estimate) => estimate.minutes > 0)
  const minutesAvailable = daysLeft * Math.max(0, goal.minutesPerDay)
  const minutesNeeded = open.reduce((sum, estimate) => sum + estimate.minutes, 0)

  if (minutesNeeded <= minutesAvailable) {
    return {
      openConceptCount: open.length,
      daysLeft,
      minutesNeeded,
      minutesAvailable,
      feasible: true,
      shortfallMinutes: 0,
      downgradedConceptIds: [],
      achievableWithDowngrade: true,
      estimates,
    }
  }

  // Nicht machbar — herabsetzen, bis es passt.
  const lowerDepth = DEPTH_ORDER[Math.max(0, depthRank(targetDepth) - 1)]
  const byCost = [...open].sort((a, b) => b.minutes - a.minutes)
  const downgraded: string[] = []
  let remaining = minutesNeeded

  for (const estimate of byCost) {
    if (remaining <= minutesAvailable) {
      break
    }
    if (lowerDepth === targetDepth) {
      break
    }
    const cheaper = estimateConceptMinutes({
      image: images.get(estimate.conceptId),
      targetDepth: lowerDepth,
      nowIso,
    })
    if (cheaper >= estimate.minutes) {
      continue
    }
    remaining -= estimate.minutes - cheaper
    downgraded.push(estimate.conceptId)
  }

  return {
    openConceptCount: open.length,
    daysLeft,
    minutesNeeded,
    minutesAvailable,
    feasible: false,
    shortfallMinutes: Math.max(0, minutesNeeded - minutesAvailable),
    downgradedConceptIds: downgraded,
    achievableWithDowngrade: remaining <= minutesAvailable,
    estimates,
  }
}

const DEPTH_LABEL: Record<ApplicationDepth, string> = {
  recognize: 'Erkennen',
  apply: 'Anwenden',
  transfer: 'Uebertragen',
}

/**
 * Die Machbarkeitsaussage in einem Satz — ehrlich, mit Zahlen, ohne Zuspruch.
 *
 * Vorbild aus Kapitel 6.3: „Bis Freitag sind es elf Konzepte bei geschaetzt 40 Minuten pro Tag.
 * Das geht sich nur aus, wenn drei davon auf Erkennen-Niveau bleiben statt auf Anwenden."
 */
export function describeFeasibility(
  feasibility: GoalFeasibility,
  targetDepth: ApplicationDepth = 'apply',
): string {
  const { openConceptCount, daysLeft, downgradedConceptIds } = feasibility
  const scope = `${openConceptCount} ${openConceptCount === 1 ? 'Konzept' : 'Konzepte'}`
  const time = `${daysLeft} ${daysLeft === 1 ? 'Tag' : 'Tagen'}`
  const perDay = Math.round(feasibility.minutesAvailable / Math.max(1, daysLeft))

  if (daysLeft === 0) {
    return `Der Termin ist erreicht. Offen sind noch ${scope}.`
  }

  if (feasibility.feasible) {
    const load = Math.round(feasibility.minutesNeeded / daysLeft)
    return `In ${time} sind es ${scope} bei ${perDay} Minuten pro Tag. Das geht sich aus — rund ${load} Minuten taeglich reichen.`
  }

  const lowerDepth = DEPTH_ORDER[Math.max(0, depthRank(targetDepth) - 1)]
  if (feasibility.achievableWithDowngrade && downgradedConceptIds.length > 0) {
    return (
      `In ${time} sind es ${scope} bei ${perDay} Minuten pro Tag. ` +
      `Das geht sich nur aus, wenn ${downgradedConceptIds.length} davon auf ${DEPTH_LABEL[lowerDepth]}-Niveau ` +
      `bleiben statt auf ${DEPTH_LABEL[targetDepth]}.`
    )
  }

  const missingHours = Math.round(feasibility.shortfallMinutes / 6) / 10
  return (
    `In ${time} sind es ${scope} bei ${perDay} Minuten pro Tag. ` +
    `Das geht sich nicht aus — es fehlen rund ${missingHours} Stunden. ` +
    `Entweder mehr Zeit pro Tag, oder ein kleinerer Umfang.`
  )
}

/** Ist dieses Konzept Teil des Zielumfangs? */
export function isInGoalScope(goal: LearningGoal | null, conceptId: string): boolean {
  return goal != null && goal.status === 'active' && goal.conceptIds.includes(conceptId)
}
