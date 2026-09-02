/**
 * Anbindung: Lernpfad-Bereich (UI-Spezifikation Kapitel 3 und 15).
 *
 * Diese Datei ist die Naht zwischen Gehirn und Oberflaeche. Sie erzeugt genau die Felder, die
 * Kapitel 15 pro Bildschirm auflistet — nicht mehr und nicht weniger — und sie tut es als reine
 * Funktion: kein React, kein Netzwerk, keine Zeitquelle ausser dem hereingereichten `nowIso`.
 *
 * Warum eine eigene Schicht und nicht direkt in den Komponenten:
 *
 *  1. Kapitel 15 ist eine Zuordnungstabelle. Steht sie in Komponenten verteilt, laesst sie sich
 *     nicht mehr gegen das Dokument pruefen — hier schon, Feld fuer Feld.
 *  2. Die Regeln aus Kapitel 3.5 (Knotenzustaende) und 4.8 (Werte bewegen sich erst in der
 *     Bilanz) sind Produktentscheidungen, keine Gestaltung. In einer Komponente wuerden sie beim
 *     ersten Umbau des Layouts mit verschwinden.
 *  3. Die Oberflaeche darf keine eigene Meinung darueber bekommen, was „gefestigt" heisst. Sonst
 *     entstehen zwei Wahrheiten: eine im Planer und eine im Balken daneben.
 */

import type {
  BrainConcept,
  BrainPrerequisiteEdge,
  LearnerConceptImage,
  LearningGoal,
  PathOrderEntry,
  PlannedTask,
} from '../types'
import { CONSOLIDATED_MASTERY, effectiveConfidence, effectiveMastery } from '../memory/learnerImage'
import { prerequisitesOf } from '../memory/knowledgeGraph'
import { assessGoal, describeFeasibility } from '../planner/goal'
import { sprintScopeOf } from '../planner/sprint'
import { responsibilityFor } from '../planner/responsibility'

/** Ab dieser Sicherheit gilt eine Einschaetzung als belastbar genug fuer „gefestigt". */
export const SETTLED_CONFIDENCE = 0.4

/** Unterhalb dieser Sicherheit heisst der Zustand „unsicher" (Kapitel 3.5). */
export const UNCERTAIN_CONFIDENCE = 0.35

// ---------------------------------------------------------------------------
// Lernpfad-Kopf (Kapitel 3.1, Datenbedarf 15)
// ---------------------------------------------------------------------------

export type PathHeaderView = {
  /** Fortschritt gesamt — hochgerechnet aus der Beherrschung aller Konzepte. */
  progress: number
  conceptCount: number
  settledCount: number
  dueCount: number
  /** Kurzstatistik als fertiger Satz: „15 Konzepte · 7 gefestigt · 2 faellig". */
  summary: string
  goalChip: GoalChipView
  /**
   * Worauf sich `progress` bezieht.
   *
   * Im Sprint zaehlt der Ring den ZIELUMFANG, nicht den ganzen Pfad — sonst stuende er bei 50
   * Prozent, obwohl das Ziel vollstaendig erreicht ist. Weil die Bezugsgroesse damit wechselt,
   * darf sie nicht stillschweigend wechseln: `scopeNote` sagt sie an.
   *
   * Leer, solange sich der Ring auf den ganzen Pfad bezieht.
   */
  scopeNote: string
}

export type GoalChipView =
  | { state: 'unset'; label: 'Ziel setzen' }
  | {
      state: 'set'
      /** „Ziel: Pruefung Freitag · 11 Konzepte · wird knapp" */
      label: string
      title: string
      conceptCount: number
      feasibility: 'comfortable' | 'tight' | 'unrealistic'
      /** Der ehrliche Satz aus `planner/goal.ts` — Zahlen statt Zuspruch. */
      detail: string
    }

/**
 * Fortschritt eines Pfads fuer die Kopfzeile.
 *
 * Gezaehlt werden nur Konzepte MIT direkter Evidenz. Der kalte Startwert aus `emptyImage` liegt
 * je nach Schwierigkeit zwischen 0.2 und 0.4 — wuerde er mitgerechnet, zeigte ein frisch
 * angelegter Pfad rund 30 Prozent Fortschritt, ohne dass jemand eine Aufgabe geloest hat. Das
 * waere nicht bloss schmeichelhaft, sondern falsch: der Ring ist die Zahl, an der der Nutzer das
 * ganze Produkt misst.
 */
export function buildPathHeader(args: {
  concepts: BrainConcept[]
  images: Map<string, LearnerConceptImage>
  goal: LearningGoal | null
  nowIso: string
}): PathHeaderView {
  const { concepts, images, goal, nowIso } = args

  /*
   * Im Sprint bezieht sich der Ring auf den Zielumfang (Kapitel 6.3, Sonderfall). Ausserhalb
   * eines Sprints bleibt es beim ganzen Pfad — ein Ziel mit Vorlauf ist eine Gewichtung, keine
   * neue Bezugsgroesse, und ein Ring, der bei jeder Zielaenderung springt, waere unbrauchbar.
   */
  const sprintScope = sprintScopeOf(goal, nowIso)
  const counted = sprintScope ? concepts.filter((concept) => sprintScope.has(concept.id)) : concepts

  let masterySum = 0
  let settledCount = 0
  let dueCount = 0

  for (const concept of counted) {
    const image = images.get(concept.id)
    if (!image || image.directEvidenceCount === 0) {
      continue
    }
    const mastery = effectiveMastery(image, nowIso)
    masterySum += mastery
    if (isSettled(image, nowIso)) {
      settledCount += 1
    }
    if (responsibilityFor(image, nowIso).responsibility === 'review') {
      dueCount += 1
    }
  }

  const conceptCount = counted.length
  const progress = conceptCount > 0 ? masterySum / conceptCount : 0

  return {
    progress,
    conceptCount,
    settledCount,
    dueCount,
    summary: `${conceptCount} Konzepte · ${settledCount} gefestigt · ${dueCount} fällig`,
    goalChip: buildGoalChip({ images, goal, nowIso }),
    scopeNote: sprintScope ? `${conceptCount} von ${concepts.length} im Umfang` : '',
  }
}

const FEASIBILITY_LABEL: Record<'comfortable' | 'tight' | 'unrealistic', string> = {
  comfortable: 'geht auf',
  tight: 'wird knapp',
  unrealistic: 'geht sich nicht aus',
}

function buildGoalChip(args: {
  images: Map<string, LearnerConceptImage>
  goal: LearningGoal | null
  nowIso: string
}): GoalChipView {
  if (!args.goal) {
    return { state: 'unset', label: 'Ziel setzen' }
  }

  const assessment = assessGoal({ goal: args.goal, images: args.images, nowIso: args.nowIso })
  const feasibility = feasibilityOf(assessment)

  return {
    state: 'set',
    label: `Ziel: ${args.goal.title} · ${args.goal.conceptIds.length} Konzepte · ${FEASIBILITY_LABEL[feasibility]}`,
    title: args.goal.title,
    conceptCount: args.goal.conceptIds.length,
    feasibility,
    detail: describeFeasibility(assessment),
  }
}

/**
 * Die Machbarkeit auf drei Stufen verdichten — nur fuer den Chip.
 *
 * Die volle Aussage steht in `detail` und kommt unveraendert aus `describeFeasibility`: „Bis
 * Freitag sind es elf Konzepte bei geschaetzt 40 Minuten pro Tag." Der Chip verkuerzt das auf ein
 * Wort, ersetzt es aber nicht — Kapitel 6.3 nennt die Ehrlichkeit der Rueckrechnung ausdruecklich
 * ein Alleinstellungsmerkmal, und ein Wort allein waere wieder ein Motivationsspruch.
 *
 * „wird knapp" heisst: machbar, aber nur mit dem Verzicht, den die Rueckrechnung benennt.
 */
export function feasibilityOf(assessment: {
  feasible: boolean
  achievableWithDowngrade: boolean
}): 'comfortable' | 'tight' | 'unrealistic' {
  if (assessment.feasible) {
    return 'comfortable'
  }
  return assessment.achievableWithDowngrade ? 'tight' : 'unrealistic'
}

/**
 * „Gefestigt" im Sinne der Kopfzeile und der Knotendarstellung.
 *
 * Beide Werte muessen stimmen: hohe Beherrschung bei niedriger Sicherheit ist genau der Fall, den
 * die Trennung der beiden Werte sichtbar machen soll (Architekturkapitel 4.2). Ihn als gefestigt
 * auszuweisen wuerde die Unterscheidung wieder einebnen.
 */
export function isSettled(image: LearnerConceptImage, nowIso: string): boolean {
  return (
    effectiveMastery(image, nowIso) >= CONSOLIDATED_MASTERY &&
    effectiveConfidence(image, nowIso) >= SETTLED_CONFIDENCE
  )
}

// ---------------------------------------------------------------------------
// Jetzt-Karte (Kapitel 3.3, Datenbedarf 15)
// ---------------------------------------------------------------------------

/** Ausloeserart, wie sie die Kennzeichnung der Jetzt-Karte zeigt. */
export type NowTrigger = 'insert' | 'review' | 'goal' | 'regular'

export type NowCardView = {
  conceptId: string
  conceptName: string
  trigger: NowTrigger
  /** Der eine Satz (Invariante I8). Kommt aus dem Planer, geglaettet vom Erklaerer. */
  reason: string
  /** Geschaetzte Dauer der Sitzung in Minuten, aus Aufgabenzahl und Format. */
  estimatedMinutes: number
  taskCount: number
}

const TRIGGER_BY_CLAIM: Record<PlannedTask['claim'], NowTrigger> = {
  review: 'review',
  rootCause: 'insert',
  goal: 'goal',
  motivation: 'regular',
  coldStart: 'regular',
}

/**
 * Die Jetzt-Karte aus dem Sitzungsplan.
 *
 * Die Ausloeserart wird aus dem Anspruch abgeleitet, nicht separat gefuehrt: der Planer hat die
 * Entscheidung bereits getroffen, und eine zweite Ableitung daneben koennte ihr widersprechen.
 *
 * `rootCause` wird als „Einschub" gezeigt, weil genau das seine Wirkung auf den Pfad ist — ein
 * Konzept, das ausserhalb der Grundordnung dazwischengeschoben wird (Architekturkapitel 11).
 */
export function buildNowCard(args: {
  tasks: PlannedTask[]
  conceptNames: Map<string, string>
  minutesPerTask?: number
}): NowCardView | null {
  const first = args.tasks[0]
  if (!first) {
    return null
  }

  const minutesPerTask = args.minutesPerTask ?? 3
  return {
    conceptId: first.conceptId,
    conceptName: args.conceptNames.get(first.conceptId) ?? first.conceptId,
    trigger: TRIGGER_BY_CLAIM[first.claim],
    reason: first.reason,
    estimatedMinutes: Math.max(1, Math.round(args.tasks.length * minutesPerTask)),
    taskCount: args.tasks.length,
  }
}

// ---------------------------------------------------------------------------
// Themenliste und Knotenzustaende (Kapitel 3.4 und 3.5)
// ---------------------------------------------------------------------------

/**
 * Knotenzustand — die verbindliche Liste aus Kapitel 3.5.
 *
 * Der Zustand steckt in der Form, nicht in der Farbe; diese Schicht liefert deshalb den Zustand
 * als Wort und ueberlaesst der Darstellung, was sie daraus macht. Ein Zustand „gruen" gaebe es
 * hier nicht zu holen.
 */
export type NodeState = 'open' | 'current' | 'uncertain' | 'settled' | 'due'

/** Zusatzmarken. Mehrere gleichzeitig moeglich — „Einschub" und „faellig" schliessen sich nicht aus. */
export type NodeBadge = 'insert' | 'new' | 'due'

export type NodeView = {
  conceptId: string
  name: string
  state: NodeState
  badges: NodeBadge[]
  /** Nur bei Einschueben belegt: warum dieser Knoten hier steht. */
  insertReason: string | null
  /** Einschuebe werden eingerueckt dargestellt (Kapitel 3.5). */
  indented: boolean
  mastery: number
  confidence: number
  /**
   * Liegt bis zum Termin ausserhalb des Zielumfangs (Sprint, Kapitel 6.3).
   *
   * Bewusst ein eigenes Merkmal und KEIN sechster `NodeState`: „ausserhalb des Umfangs" ist
   * orthogonal zum Lernzustand. Ein Konzept kann gleichzeitig faellig und ausserhalb des
   * Umfangs sein — als Zustand ausgedrueckt verschluckte das eine das andere, und der
   * Faelligkeitspunkt verschwaende.
   *
   * Der Knoten bleibt vollstaendig bedienbar; er ist zurueckgenommen, nicht gesperrt.
   */
  outOfScope: boolean
}

export type TopicView = {
  /** Abgeleitet, nicht gespeichert — siehe `groupIntoTopics`. */
  title: string
  nodes: NodeView[]
  settledCount: number
  /** „2 von 5 · hier bist du gerade" */
  status: string
  containsCurrent: boolean
  /** Standardmaessig offen ist genau das Thema mit dem aktuellen Knoten (Kapitel 3.4). */
  expandedByDefault: boolean
}

/**
 * Zustand eines Knotens bestimmen (Kapitel 3.5, Spalte „Bedingung im Gehirn").
 *
 * Die Reihenfolge ist die Aussage. „Jetzt dran" gewinnt gegen alles: der Knoten, an dem gerade
 * gearbeitet wird, soll nicht gleichzeitig als „faellig" markiert danebenstehen. Danach kommt
 * „offen", weil ein Knoten ohne jede Evidenz weder unsicher noch faellig sein kann — er ist
 * schlicht unberuehrt.
 */
export function nodeStateFor(args: {
  image: LearnerConceptImage | undefined
  isCurrent: boolean
  nowIso: string
}): NodeState {
  if (args.isCurrent) {
    return 'current'
  }
  const image = args.image
  if (!image || image.directEvidenceCount === 0) {
    return 'open'
  }

  if (responsibilityFor(image, args.nowIso).responsibility === 'review') {
    return 'due'
  }
  if (image.reviewNeeded || effectiveConfidence(image, args.nowIso) < UNCERTAIN_CONFIDENCE) {
    return 'uncertain'
  }
  if (isSettled(image, args.nowIso)) {
    return 'settled'
  }
  return 'open'
}

export function buildNode(args: {
  concept: BrainConcept
  image: LearnerConceptImage | undefined
  order: PathOrderEntry | undefined
  isCurrent: boolean
  /** Konzepte, die die Konsolidierung seit dem letzten Besuch ergaenzt hat. */
  newConceptIds?: Set<string>
  /** Der Zielumfang, wenn er im Sprint gilt — sonst weglassen. */
  sprintScope?: Set<string>
  nowIso: string
}): NodeView {
  const state = nodeStateFor({ image: args.image, isCurrent: args.isCurrent, nowIso: args.nowIso })
  const isInsert = args.order?.kind === 'insert'

  const badges: NodeBadge[] = []
  if (isInsert) {
    badges.push('insert')
  }
  if (args.newConceptIds?.has(args.concept.id)) {
    badges.push('new')
  }
  if (state === 'due') {
    badges.push('due')
  }

  return {
    conceptId: args.concept.id,
    name: args.concept.name,
    state,
    badges,
    insertReason: isInsert ? (args.order?.insertReason ?? null) : null,
    indented: isInsert,
    mastery: args.image ? effectiveMastery(args.image, args.nowIso) : 0,
    confidence: args.image ? effectiveConfidence(args.image, args.nowIso) : 0,
    outOfScope: args.sprintScope ? !args.sprintScope.has(args.concept.id) : false,
  }
}

/**
 * Konzepte zu Themen gruppieren.
 *
 * Das Thema ist eine ABGELEITETE Ebene: „Die Hierarchie dient nur der Navigation; die
 * inhaltlichen Beziehungen stecken im Voraussetzungsgraph" (Kapitel 2). Gespeichert wird
 * ausschliesslich die Konzeptebene.
 *
 * Als Gruppierungsmerkmal dient der Abschnitt aus der Herkunftsangabe — die einzige Angabe, die
 * ohnehin mitgefuehrt wird (Invariante I4) und die der Gliederung des Materials folgt. Ein
 * zweites, eigens gepflegtes Themensystem waere die „zweite konkurrierende Ordnung", vor der
 * Kapitel 2 ausdruecklich warnt.
 *
 * Die Reihenfolge innerhalb eines Themas ist die Pfadreihenfolge, nicht die Konzeptreihenfolge:
 * Einschuebe stehen damit an der Stelle, an der sie eingefuegt wurden.
 */
export function groupIntoTopics(args: {
  concepts: BrainConcept[]
  images: Map<string, LearnerConceptImage>
  order: PathOrderEntry[]
  currentConceptId: string | null
  newConceptIds?: Set<string>
  /** Das laufende Ziel — nur fuer die Zurueckstellung ausserhalb des Sprintumfangs. */
  goal?: LearningGoal | null
  nowIso: string
}): TopicView[] {
  const sprintScope = sprintScopeOf(args.goal ?? null, args.nowIso)
  const positionById = new Map(args.order.map((entry) => [entry.conceptId, entry.position]))
  const orderById = new Map(args.order.map((entry) => [entry.conceptId, entry]))

  const sorted = [...args.concepts].sort((a, b) => {
    const pa = positionById.get(a.id)
    const pb = positionById.get(b.id)
    if (pa != null && pb != null && pa !== pb) {
      return pa - pb
    }
    if (pa != null && pb == null) {
      return -1
    }
    if (pa == null && pb != null) {
      return 1
    }
    return a.ordinal !== b.ordinal ? a.ordinal - b.ordinal : a.id < b.id ? -1 : 1
  })

  const byTitle = new Map<string, NodeView[]>()
  const titleOrder: string[] = []

  for (const concept of sorted) {
    const title = concept.sourceRef.section?.trim() || 'Weitere Konzepte'
    if (!byTitle.has(title)) {
      byTitle.set(title, [])
      titleOrder.push(title)
    }
    byTitle.get(title)!.push(
      buildNode({
        concept,
        image: args.images.get(concept.id),
        order: orderById.get(concept.id),
        isCurrent: concept.id === args.currentConceptId,
        ...(args.newConceptIds ? { newConceptIds: args.newConceptIds } : {}),
        ...(sprintScope ? { sprintScope } : {}),
        nowIso: args.nowIso,
      }),
    )
  }

  return titleOrder.map((title) => {
    const nodes = byTitle.get(title)!
    /*
     * Der Themenzaehler misst nur, was bis zum Termin dran ist. Stuende dort „2 von 8", waehrend
     * sechs davon bewusst zurueckgestellt sind, laese sich der Sprint als Rueckstand — genau die
     * Entmutigung, die das Zuschneiden vermeiden soll.
     */
    const inScope = nodes.filter((node) => !node.outOfScope)
    const settledCount = inScope.filter((node) => node.state === 'settled').length
    const containsCurrent = nodes.some((node) => node.state === 'current')
    return {
      title,
      nodes,
      settledCount,
      status: containsCurrent
        ? `${settledCount} von ${inScope.length} · hier bist du gerade`
        : `${settledCount} von ${inScope.length}`,
      containsCurrent,
      expandedByDefault: containsCurrent,
    }
  })
}

// ---------------------------------------------------------------------------
// Knoten-Panel (Kapitel 3.6)
// ---------------------------------------------------------------------------

export type ConfidenceWord = 'niedrig' | 'mittel' | 'hoch'

export type NodePanelView = {
  conceptId: string
  name: string
  /** Herkunftszeile — Invariante I4 an der Oberflaeche. */
  provenance: { line: string; needsUserCheck: boolean }
  mastery: number
  confidence: number
  confidenceWord: ConfidenceWord
  depth: 'recognize' | 'apply' | 'transfer'
  /** Der letzte Prueferbefund im Klartext; leer, wenn es noch keinen gibt. */
  lastFinding: string
  /** Voraussetzungen — fuer „Knoten bearbeiten". */
  prerequisites: { conceptId: string; name: string }[]
}

/**
 * Die Herkunftszeile (Kapitel 3.6, Punkt 2).
 *
 * „Bei KI-ergaenzten Knoten zusaetzlich ein Hinweis, dass der Nutzer pruefen soll, ob es im
 * Unterricht vorkam." Das ist der Punkt, an dem I4 fuer den Nutzer ueberhaupt einen Wert
 * bekommt: er wird an seinem Skript geprueft, nicht am Weltwissen.
 *
 * `unknown` (Altbestand) bekommt eine eigene, ehrliche Zeile. Ihn als „aus deinem Material" zu
 * zeigen waere die Behauptung, die Invariante I4 gerade verhindern soll.
 */
export function provenanceLine(concept: BrainConcept): { line: string; needsUserCheck: boolean } {
  switch (concept.origin) {
    case 'material': {
      const page = concept.sourceRef.pageFrom
        ? `Seite ${concept.sourceRef.pageFrom}${
            concept.sourceRef.pageTo && concept.sourceRef.pageTo !== concept.sourceRef.pageFrom
              ? `–${concept.sourceRef.pageTo}`
              : ''
          }`
        : concept.sourceRef.section?.trim()
      const doc = concept.sourceRef.doc?.trim() || 'Skript'
      return { line: page ? `${doc} ${page} · aus deinem Material` : `${doc} · aus deinem Material`, needsUserCheck: false }
    }
    case 'aiSupplement':
      return { line: 'KI-ergänzt · nicht in deinem Skript', needsUserCheck: true }
    case 'user':
      return { line: 'Von dir angelegt', needsUserCheck: false }
    case 'unknown':
      return { line: 'Herkunft nicht belegt · vor der Herkunftspflicht angelegt', needsUserCheck: true }
  }
}

/**
 * Sicherheit als Wort (Kapitel 3.6, Punkt 3).
 *
 * Ausdruecklich NICHT als Prozentwert: „sonst liest ein Schueler ‚Sicherheit 18 %' als zweite
 * Note". Die Beherrschung ist die Note, die Sicherheit ist eine Aussage ueber die Einschaetzung.
 */
export function confidenceWord(confidence: number): ConfidenceWord {
  if (confidence < UNCERTAIN_CONFIDENCE) {
    return 'niedrig'
  }
  return confidence < 0.7 ? 'mittel' : 'hoch'
}

export function buildNodePanel(args: {
  concept: BrainConcept
  image: LearnerConceptImage | undefined
  concepts: BrainConcept[]
  edges: BrainPrerequisiteEdge[]
  /** Letzter Prueferbefund im Klartext, aus `learn_evidence_events`. */
  lastFinding?: string
  nowIso: string
}): NodePanelView {
  const nameById = new Map(args.concepts.map((concept) => [concept.id, concept.name]))
  const confidence = args.image ? effectiveConfidence(args.image, args.nowIso) : 0

  return {
    conceptId: args.concept.id,
    name: args.concept.name,
    provenance: provenanceLine(args.concept),
    mastery: args.image ? effectiveMastery(args.image, args.nowIso) : 0,
    confidence,
    confidenceWord: confidenceWord(confidence),
    depth: args.image?.depth ?? 'recognize',
    lastFinding: args.lastFinding ?? '',
    prerequisites: prerequisitesOf(args.edges, args.concept.id).map((conceptId) => ({
      conceptId,
      name: nameById.get(conceptId) ?? conceptId,
    })),
  }
}

/**
 * Die einmalige Ersterklaerung der drei Werte (Kapitel 3.6, Pflicht).
 *
 * Wortlaut aus der Spezifikation uebernommen. Er steht hier und nicht in einer Komponente, weil
 * er eine Zusage ueber das Systemverhalten macht — insbesondere der Satz zur Sicherheit, der
 * verhindert, dass ein niedriger Wert als zweite Note gelesen wird.
 */
export const VALUE_EXPLANATION = [
  {
    term: 'Beherrschung',
    text: 'wie gut du das gerade kannst.',
  },
  {
    term: 'Sicherheit',
    text:
      'wie sicher ich mir bei dieser Einschätzung bin. Niedrig heisst nicht, dass du es nicht ' +
      'kannst, sondern dass ich es noch nicht oft genug gesehen habe.',
  },
  {
    /* Oberflaechenbegriff fuer „Anwendungstiefe" (Architekturkapitel 4.2 nennt sie so; die
       Oberflaeche zeigt seit Kapitel 3.6 den zugaenglicheren Namen). */
    term: 'Verständnisstufe',
    text:
      'ob du es wiedererkennst, anwenden kannst, oder in einer fremden Aufgabe erkennst, dass es ' +
      'gebraucht wird.',
  },
] as const

/** Welcher der drei Werte gerade erklärt wird (Knoten-Panel, Kapitel 3.6). */
export type BrainValueTerm = (typeof VALUE_EXPLANATION)[number]['term']

export const DEPTH_LABEL: Record<'recognize' | 'apply' | 'transfer', string> = {
  recognize: 'Erkennen',
  apply: 'Anwenden',
  transfer: 'Übertragen',
}
