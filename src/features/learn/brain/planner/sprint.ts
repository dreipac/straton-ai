/**
 * Schicht 4 — der Sprint: ein Ziel mit knappem Termin (Kapitel 6.3, Sonderfall).
 *
 * `goal.ts` rechnet aus, OB ein Ziel aufgeht, und nennt im Nichtmachbarkeitsfall den Verzicht.
 * Diese Datei nimmt den Fall auf, in dem der Verzicht unausweichlich ist, weil der Termin in
 * Tagen zaehlt: sie schlaegt den konkreten Umfang vor, benennt den Preis und sagt, was der
 * Sprint NICHT leisten kann.
 *
 * Der Leitsatz ist die Leiter des Verzichts — Tiefe vor Umfang:
 *
 *  1. Alles auf Zieltiefe. Geht das auf, gibt es keinen Sprint.
 *  2. Alles auf Erkennen-Niveau. Es faellt kein Konzept weg, nur die Anwendungsstufe.
 *  3. Erst wenn auch das nicht passt: weniger Konzepte, Wurzeln zuerst.
 *
 * Warum die Reihenfolge fest ist: „in zwei Tagen nicht geschafft" und „gibt es nicht" duerfen
 * nicht dasselbe sein. Das Konzeptnetz bleibt vollstaendig; geschnitten wird ausschliesslich der
 * ZIELUMFANG, und der ist eine Reihenfolge, keine Mauer (siehe `planner.ts`: ausserhalb des
 * Umfangs wird erst geplant, wenn im Umfang nichts mehr offen ist).
 *
 * Rein — kein DOM, kein I/O.
 */

import type {
  ApplicationDepth,
  BrainConcept,
  BrainPrerequisiteEdge,
  LearnerConceptImage,
  LearningGoal,
} from '../types'
import { applyDecay, DEFAULT_DECAY_RATE } from '../../engine/forgetting'
import { estimateConceptMinutes, GOAL_MASTERY_TARGET, MINUTES_TO_REACH } from './goal'

const MS_PER_DAY = 86_400_000

/**
 * Bis zu wie vielen Tagen ein Termin als Sprint gilt.
 *
 * Drei Tage, und das ist nicht gegriffen: `goalUrgency` schaltet bei drei Tagen ohnehin auf die
 * dringlichere Formulierung um (`urgency.ts`), und unterhalb von vier Tagen passt kein einziges
 * Wiederholungsintervall mehr ins Fenster (`nextReviewIntervalDays` liefert fuer ein gefestigtes
 * Konzept fuenf bis acht Tage). Ab vier Tagen ist der normale Pfad die richtige Antwort.
 */
export const SPRINT_MAX_DAYS = 3

/**
 * Die Tiefe, auf der ein Sprint arbeitet.
 *
 * Stufe 2 der Leiter. „Anwenden" kostet mehr als das Doppelte von „Erkennen"
 * (`MINUTES_TO_REACH`), und es ist die einzige Stellschraube, die Zeit spart, ohne dass etwas
 * wegfaellt — deshalb wird sie vor dem Umfang gezogen.
 */
export const SPRINT_TARGET_DEPTH: ApplicationDepth = 'recognize'

/**
 * Wie viele NEUE Konzepte in dieser Zeit ueberhaupt sinnvoll sind — unabhaengig von der Uhr.
 *
 * Die zweite, von der Zeit unabhaengige Grenze. Sie existiert, weil die Minutenrechnung eine
 * Annahme macht, die ab einer gewissen Menge nicht mehr traegt: dass sich Lernzeit beliebig
 * stapeln laesst. Vierzig neue Begriffe an einem Tag bleiben auch in sechs Stunden nicht haengen.
 *
 * Die kleinere der beiden Grenzen gewinnt, und die Warnung nennt, welche gegriffen hat — die
 * Auswege sind verschieden: gegen die Zeitgrenze hilft mehr Zeit, gegen die Breitengrenze nur
 * ein spaeterer Termin.
 */
export function breadthCeilingFor(daysLeft: number): number {
  return daysLeft >= 3 ? 30 : 20
}

/**
 * Ab hier gilt die Breitengrenze auch dann, wenn die eingetragene Zeit weniger hergibt.
 *
 * Der Ein-Tages-Fall weicht bewusst von der Minutenrechnung ab. Wer am Vortag anfaengt, sitzt
 * nicht die eingetragene Stunde, sondern so lange es dauert — die eingetragene Zeit ist dann
 * keine Planungsgroesse mehr, sondern eine Untertreibung. Der Vorschlag richtet sich deshalb
 * nach der Breite, und `describeSprintScope` sagt dazu, was das an Stunden bedeutet.
 *
 * Ungefaehrlich ist das nur, weil der Umfang eine Reihenfolge ist: ein etwas zu grosszuegiger
 * Umfang kostet nichts, es wird von oben abgearbeitet.
 */
const DAY_FLOOR_MAX_DAYS = 1

/** Welche der beiden Grenzen den Umfang bestimmt hat. */
export type SprintLimit =
  /** Die eingetragene Zeit. Ausweg: mehr Minuten pro Tag. */
  | 'time'
  /** Die Menge an neuem Stoff. Kein Ausweg ueber Zeit — nur ein spaeterer Termin. */
  | 'breadth'
  /** Der Ein-Tages-Fall: die Breite gewinnt gegen die (zu niedrig) eingetragene Zeit. */
  | 'dayFloor'
  /** Es passt alles hinein; geschnitten wurde nichts. */
  | 'none'

/**
 * Was von einem heute Gelernten wann noch uebrig ist — nach dem Verfallsmodell dieses Systems.
 *
 * Bewusst aus `applyDecay` statt aus einer Faustformel: die Warnung soll dieselbe Kurve
 * behaupten, nach der das Gehirn spaeter auch tatsaechlich plant. Eine Warnung, die strenger
 * rechnet als das System selbst, waere Panikmache; eine, die milder rechnet, waere eine Luege.
 */
export type RetentionProjection = {
  /** Beherrschung am Termin. */
  atDueDate: number
  /** Eine Woche nach dem Termin. */
  afterOneWeek: number
  /** Einen Monat nach dem Termin. */
  afterOneMonth: number
}

export type SprintPlan = {
  daysLeft: number
  targetDepth: ApplicationDepth
  /** Der vorgeschlagene Umfang, Wurzeln zuerst. */
  conceptIds: string[]
  /** Was bis zum Termin nicht drankommt. Bleibt im Netz. */
  droppedConceptIds: string[]
  limit: SprintLimit
  /** Wie viele Konzepte die eingetragene Zeit hergibt. */
  timeLimit: number
  /** Wie viele Konzepte die Breitengrenze hergibt. */
  breadthLimit: number
  /**
   * Minuten pro Tag, mit denen der GANZE Stoff auf Sprinttiefe aufginge. 0, wenn er schon
   * aufgeht, und 0, wenn die Breitengrenze griff — dort hilft mehr Zeit nicht.
   */
  minutesPerDayForAll: number
  retention: RetentionProjection
}

/**
 * Konzepte nach Tragweite ordnen: was Voraussetzung fuer vieles ist, kommt zuerst.
 *
 * Gezaehlt wird die transitive Reichweite in Kantenrichtung (`from` ist Voraussetzung fuer `to`),
 * nicht der direkte Ausgangsgrad. Der Unterschied entscheidet den haeufigen Fall: die Wurzel
 * einer langen Kette hat nur einen direkten Nachfolger, traegt aber alles dahinter. Mit dem
 * direkten Grad landete sie hinter einem Knoten mit zwei Blattnachfolgern — genau falsch herum.
 *
 * Gleichstand bricht die Schwierigkeit (leichter zuerst: im Sprint zaehlt, wie viel FERTIG wird)
 * und danach `ordinal` und die Id. Damit ist die Reihenfolge deterministisch (I11).
 */
export function rankByFoundation(concepts: BrainConcept[], edges: BrainPrerequisiteEdge[]): BrainConcept[] {
  const known = new Set(concepts.map((concept) => concept.id))
  const dependents = new Map<string, string[]>()
  for (const edge of edges) {
    if (!known.has(edge.fromConceptId) || !known.has(edge.toConceptId)) {
      continue
    }
    const bucket = dependents.get(edge.fromConceptId)
    if (bucket) {
      bucket.push(edge.toConceptId)
    } else {
      dependents.set(edge.fromConceptId, [edge.toConceptId])
    }
  }

  /*
   * Iterativ mit eigenem Besuchsset statt Rekursion mit Memoisierung: ein Zyklus im Netz (durch
   * eine Nutzerkante oder eine automatisch angewandte Konsolidiererkante durchaus moeglich)
   * wuerde eine memoisierte Rekursion in eine Endlosschleife schicken. Die Reichweite wird
   * deshalb je Knoten frisch bestimmt — bei den hier ueblichen Groessen (bis 40 Konzepte)
   * kostet das nichts.
   */
  const reachOf = (start: string): number => {
    const seen = new Set<string>([start])
    const stack = [start]
    while (stack.length > 0) {
      const current = stack.pop()!
      for (const next of dependents.get(current) ?? []) {
        if (!seen.has(next)) {
          seen.add(next)
          stack.push(next)
        }
      }
    }
    return seen.size - 1
  }

  const reach = new Map(concepts.map((concept) => [concept.id, reachOf(concept.id)]))

  return [...concepts].sort((a, b) => {
    const reachDiff = (reach.get(b.id) ?? 0) - (reach.get(a.id) ?? 0)
    if (reachDiff !== 0) {
      return reachDiff
    }
    if (a.difficulty !== b.difficulty) {
      return a.difficulty - b.difficulty
    }
    if (a.ordinal !== b.ordinal) {
      return a.ordinal - b.ordinal
    }
    return a.id < b.id ? -1 : 1
  })
}

/**
 * Der Zielumfang, wenn er im Sprint Vorrang hat — sonst `null`.
 *
 * Vorrang gilt bewusst NUR bei knappem Termin. Ein Ziel mit vier Wochen Vorlauf und einem
 * Teilumfang soll den Rest des Pfads weiterhin nicht verdecken; dort ist das Ziel eine
 * Gewichtung (`goalUrgency`), keine Auswahl. Bei drei Tagen ist es umgekehrt: eine Sitzung, die
 * Randbegriffe zwischen die Zielkonzepte mischt, verduennt genau die Zeit, die knapp ist.
 */
export function sprintScopeOf(goal: LearningGoal | null, nowIso: string): Set<string> | null {
  if (!goal || goal.status !== 'active' || goal.conceptIds.length === 0) {
    return null
  }
  if (daysUntilDue(goal.dueAt, nowIso) > SPRINT_MAX_DAYS) {
    return null
  }
  return new Set(goal.conceptIds)
}

/**
 * Braucht dieses Konzept fuer das Ziel noch Arbeit?
 *
 * Absichtlich ueber `estimateConceptMinutes` und damit ueber exakt dieselbe Definition, die
 * `assessGoal` fuer `openConceptCount` benutzt. Ein zweiter Fertigkeitsbegriff waere hier
 * besonders teuer: der Ziel-Chip saegte „geht auf", waehrend der Planer dasselbe Konzept
 * weiterhin fuer offen hielte (oder umgekehrt).
 *
 * Nicht verwendbar waere „meldet eine Dringlichkeit": `rootCauseUrgency` liefert auch fuer ein
 * laengst sitzendes Konzept noch einen winzigen Wert (aus der Differenz von Beherrschung und
 * Sicherheit). Der Umfang waere damit nie erledigt, und der Pfad liefe nach dem Sprintumfang
 * nie von selbst weiter.
 */
export function needsWorkForGoal(
  image: LearnerConceptImage | undefined,
  targetDepth: ApplicationDepth,
  nowIso: string,
): boolean {
  return estimateConceptMinutes({ image, targetDepth, nowIso }) > 0
}

/** Verbleibende Tage bis zum Termin, mindestens 0 — dieselbe Rechnung wie in `assessGoal`. */
export function daysUntilDue(dueAt: string, nowIso: string): number {
  const due = new Date(dueAt).getTime()
  const now = new Date(nowIso).getTime()
  if (!Number.isFinite(due) || !Number.isFinite(now)) {
    return 0
  }
  return Math.max(0, Math.ceil((due - now) / MS_PER_DAY))
}

/**
 * Den Sprintumfang vorschlagen.
 *
 * Gibt `null` zurueck, wenn der Termin weiter weg ist als `SPRINT_MAX_DAYS` — dann ist der
 * normale Pfad zustaendig und es gibt nichts zu sagen. Ein Aufrufer darf das Ergebnis also als
 * „gilt hier ueberhaupt etwas Besonderes?" lesen.
 *
 * Gefuellt wird gierig in Tragweitenreihenfolge, nicht ueber eine Stueckzahl: ein Konzept, das
 * bereits sitzt, kostet null Minuten und kommt gratis mit; ein halb gelerntes kostet den Rest.
 * Deshalb kann derselbe Aufruf auch spaeter im Sprint wiederholt werden — er beantwortet dann
 * die Frage „wie viel passt jetzt noch?" und ist die Grundlage fuer das Rueckhol-Angebot.
 */
export function planSprintScope(args: {
  concepts: BrainConcept[]
  edges: BrainPrerequisiteEdge[]
  images: Map<string, LearnerConceptImage>
  minutesPerDay: number
  dueAt: string
  nowIso: string
}): SprintPlan | null {
  const daysLeft = daysUntilDue(args.dueAt, args.nowIso)
  if (daysLeft > SPRINT_MAX_DAYS) {
    return null
  }

  const minutesPerDay = Math.max(0, args.minutesPerDay)
  const perConcept = MINUTES_TO_REACH[SPRINT_TARGET_DEPTH]
  const breadthLimit = Math.min(breadthCeilingFor(daysLeft), args.concepts.length)

  /*
   * Die Zeitgrenze rechnet mit `daysLeft`, nicht mit `daysLeft + 1`: der Termin gilt zum
   * Tagesende (so setzt ihn die Einrichtung), der Prueftag selbst ist also kein Lerntag mehr.
   */
  const minutesAvailable = daysLeft * minutesPerDay
  const timeLimit = Math.min(Math.floor(minutesAvailable / perConcept), args.concepts.length)

  const ranked = rankByFoundation(args.concepts, args.edges)
  const costOf = (concept: BrainConcept) =>
    estimateConceptMinutes({
      image: args.images.get(concept.id),
      targetDepth: SPRINT_TARGET_DEPTH,
      nowIso: args.nowIso,
    })

  /*
   * Im Ein-Tages-Fall gewinnt die Breite gegen die eingetragene Zeit (siehe DAY_FLOOR_MAX_DAYS).
   * Sonst gilt schlicht die kleinere der beiden Grenzen.
   */
  const floorApplies = daysLeft <= DAY_FLOOR_MAX_DAYS && breadthLimit > timeLimit
  const budgetMinutes = floorApplies ? Number.POSITIVE_INFINITY : minutesAvailable
  const budgetCount = floorApplies ? breadthLimit : Math.min(timeLimit, breadthLimit)

  const conceptIds: string[] = []
  const droppedConceptIds: string[] = []
  let spent = 0
  let counted = 0
  /*
   * Welche Bedingung beim ERSTEN Weglassen gegriffen hat — nicht welche Grenze rechnerisch
   * kleiner ist. Bei teilweise gelernten Konzepten koennen beide gleich gross sein und trotzdem
   * die Minuten zuerst ausgehen; die Warnung wuerde dann den falschen Ausweg nennen.
   */
  let binding: SprintLimit = 'none'

  for (const concept of ranked) {
    const cost = costOf(concept)
    // Was nichts mehr kostet, sitzt bereits — es zaehlt weder gegen die Zeit noch gegen die
    // Breite, denn beide Grenzen begrenzen NEUEN Stoff.
    if (cost <= 0) {
      conceptIds.push(concept.id)
      continue
    }
    const countExhausted = counted >= budgetCount
    const minutesExhausted = spent + cost > budgetMinutes
    if (countExhausted || minutesExhausted) {
      if (binding === 'none') {
        binding = floorApplies ? 'dayFloor' : minutesExhausted ? 'time' : 'breadth'
      }
      droppedConceptIds.push(concept.id)
      continue
    }
    conceptIds.push(concept.id)
    spent += cost
    counted += 1
  }

  const openCount = ranked.filter((concept) => costOf(concept) > 0).length

  /*
   * „Die Zeit war die Grenze" darf nur dastehen, wenn mehr Zeit auch tatsaechlich hilft. Passt
   * der offene Stoff selbst bei unendlich viel Zeit nicht unter die Breitengrenze, dann ist die
   * Breite die eigentliche Grenze — und der Satz „oder X Minuten am Tag, dann geht alles durch"
   * waere schlicht falsch. Beide Grenzen greifen im Alltag oft gleichzeitig; genannt wird die,
   * gegen die der genannte Ausweg auch wirkt.
   */
  const limit: SprintLimit = binding === 'time' && openCount > breadthLimit ? 'breadth' : binding

  /*
   * Was es kosten wuerde, dass NICHTS wegfaellt. Nur sinnvoll, wenn die Zeit die Grenze war —
   * gegen die Breitengrenze hilft keine zusaetzliche Stunde, und eine Zahl zu nennen, die das
   * Problem nicht loest, waere schlimmer als keine.
   */
  const minutesPerDayForAll =
    limit === 'time' && daysLeft > 0 ? Math.ceil((openCount * perConcept) / daysLeft) : 0

  return {
    daysLeft,
    targetDepth: SPRINT_TARGET_DEPTH,
    conceptIds,
    droppedConceptIds,
    limit,
    timeLimit,
    breadthLimit,
    minutesPerDayForAll,
    retention: projectRetention(daysLeft),
  }
}

/**
 * Was von einem heute auf Zielniveau gebrachten Konzept spaeter noch uebrig ist.
 *
 * Ausgangspunkt ist `GOAL_MASTERY_TARGET` — der Wert, ab dem `assessGoal` ein Konzept als
 * erledigt zaehlt. Gerechnet wird mit der Standardverfallsrate: im Sprint gibt es noch keine
 * gelernte Rate je Konzept, dafuer braeuchte es Sitzungen ueber mehrere Tage.
 */
export function projectRetention(daysLeft: number, mastery = GOAL_MASTERY_TARGET): RetentionProjection {
  const decay = (days: number) => applyDecay(mastery, DEFAULT_DECAY_RATE, Math.max(0, days))
  return {
    atDueDate: decay(daysLeft),
    afterOneWeek: decay(daysLeft + 7),
    afterOneMonth: decay(daysLeft + 30),
  }
}

function conceptWord(count: number): string {
  return count === 1 ? 'Konzept' : 'Konzepte'
}

function dayWord(count: number): string {
  return count === 1 ? 'Tag' : 'Tagen'
}

/**
 * Die Warnung in der Einrichtung — ohne Konzepte, allein aus Termin und Zeit.
 *
 * Sie muss ohne das Konzeptnetz auskommen, weil sie in Schritt 3 steht und das Netz erst in
 * Schritt 4 entsteht. Sie sagt deshalb nichts ueber den Umfang, sondern nur ueber das, was aus
 * Termin und Zeit schon feststeht: die erreichbare Tiefe und den fehlenden Abstand.
 *
 * Leerer String heisst: kein knapper Termin, hier ist nichts zu sagen.
 */
export function describeSprintDeadline(daysLeft: number, minutesPerDay: number): string {
  if (daysLeft > SPRINT_MAX_DAYS) {
    return ''
  }

  const budget = Math.max(0, daysLeft * Math.max(0, minutesPerDay))
  const reachable = Math.floor(budget / MINUTES_TO_REACH[SPRINT_TARGET_DEPTH])
  const ceiling = breadthCeilingFor(daysLeft)
  const room = daysLeft <= DAY_FLOOR_MAX_DAYS ? ceiling : Math.min(reachable, ceiling)

  const opener =
    daysLeft <= 0
      ? 'Der Termin ist heute.'
      : `Bis zum Termin ${daysLeft === 1 ? 'ist es ein Tag' : `sind es ${daysLeft} Tage`}.`

  return (
    `${opener} Dafuer reicht es zum Wiedererkennen von rund ${room} ${conceptWord(room)} — ` +
    'nicht zum Anwenden. Und wiederholen kann ich in dieser Zeit nichts: mein kuerzester ' +
    'Abstand zwischen zwei Durchgaengen ist groesser als dein Fenster. Du siehst gleich, was ' +
    'das fuer dein Material heisst.'
  )
}

/**
 * Der Umfangsvorschlag im Klartext — mit dem Ausweg, wo es einen gibt.
 *
 * Kapitel 7 verlangt im Nichtmachbarkeitsfall einen konkreten Vorschlag statt einer Warnung.
 * Zu Ende gedacht heisst das: nicht nur nennen, was wegfaellt, sondern auch, was es kostete,
 * dass nichts wegfaellt. Ob jemand zwei Stunden hat, entscheidet er selbst — er soll nur den
 * Preis kennen.
 */
export function describeSprintScope(plan: SprintPlan, conceptCount: number): string {
  const kept = plan.conceptIds.length
  const time = plan.daysLeft <= 0 ? 'heute' : `in ${plan.daysLeft} ${dayWord(plan.daysLeft)}`

  if (plan.limit === 'none') {
    return `Alle ${conceptCount} ${conceptWord(conceptCount)} ${time} — auf Erkennen-Niveau, nicht zum Anwenden.`
  }

  const head = `${kept} von ${conceptCount} ${conceptWord(conceptCount)} ${time}, auf Erkennen-Niveau.`

  if (plan.limit === 'time') {
    return `${head} Mehr gibt deine Zeit nicht her — ${plan.minutesPerDayForAll} Minuten am Tag, und alles geht durch.`
  }

  if (plan.limit === 'dayFloor') {
    const hours = Math.round((kept * MINUTES_TO_REACH[SPRINT_TARGET_DEPTH]) / 6) / 10
    return (
      `${head} Rund ${hours.toString().replace('.', ',')} Stunden — mehr, als du eingetragen ` +
      'hast, aber bei einem Tag die ehrlichere Zahl.'
    )
  }

  return `${head} Mehr neuer Stoff bringt nichts, auch mit mehr Zeit. Es hilft nur ein spaeterer Termin.`
}

/**
 * Die Haltbarkeitswarnung.
 *
 * Bewusst zwei getrennte Aussagen, weil sie zwei verschiedene Dinge betreffen: die TIEFE
 * betrifft die Pruefung, die HALTBARKEIT betrifft die Zeit danach. Zusammengezogen entstuende
 * der falsche Eindruck, das Gelernte sei schon am Termin weg — das behauptet das Verfallsmodell
 * nicht, und eine uebertriebene Warnung wird beim ersten Gegenbeweis komplett verworfen.
 */
export function describeRetention(plan: SprintPlan): string {
  const percent = (value: number) => `${Math.round(value * 100)} Prozent`

  return (
    'Fuer den Termin reicht das, danach nicht: jedes Konzept bekommt genau einen Durchgang. ' +
    `Eine Woche spaeter sind noch rund ${percent(plan.retention.afterOneWeek)} davon da, nach ` +
    `einem Monat ${percent(plan.retention.afterOneMonth)}. Setz danach ein zweites Ziel.`
  )
}

/**
 * Liegt jemand vor dem Plan, und wie viel passt zusaetzlich hinein?
 *
 * Die Grundlage des Rueckhol-Angebots. Zurueckgeholt wird nur auf Knopfdruck: ein Umfang, der
 * von selbst waechst, macht genau den einen Satz unwahr, auf den sich die Person eingelassen
 * hat — und dann ist die Machbarkeitsaussage nichts mehr wert.
 *
 * Gemessen wird an der Beherrschung, nie an Sitzungszeit oder Aufgabenzahl (I1). Wer viel
 * beantwortet und wenig kann, liegt nicht vor dem Plan.
 */
export function sprintHeadroom(args: {
  concepts: BrainConcept[]
  edges: BrainPrerequisiteEdge[]
  images: Map<string, LearnerConceptImage>
  goalConceptIds: string[]
  minutesPerDay: number
  dueAt: string
  nowIso: string
}): { conceptIds: string[]; isScopeComplete: boolean } {
  const inScope = new Set(args.goalConceptIds)

  const openInScope = args.concepts.filter(
    (concept) =>
      inScope.has(concept.id) &&
      estimateConceptMinutes({
        image: args.images.get(concept.id),
        targetDepth: SPRINT_TARGET_DEPTH,
        nowIso: args.nowIso,
      }) > 0,
  )

  const plan = planSprintScope({
    concepts: args.concepts,
    edges: args.edges,
    images: args.images,
    minutesPerDay: args.minutesPerDay,
    dueAt: args.dueAt,
    nowIso: args.nowIso,
  })

  const conceptIds = plan ? plan.conceptIds.filter((conceptId) => !inScope.has(conceptId)) : []

  return { conceptIds, isScopeComplete: openInScope.length === 0 }
}
