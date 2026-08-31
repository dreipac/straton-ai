/**
 * Schicht 5 — Vorratserzeugung fuer Wiederholungsabfragen (Kapitel 7.1, neu in 1.1).
 *
 * Dies ist die EINZIGE Ausnahme von der Echtzeitregel, und sie ist eng benannt:
 *
 * „Fuer den Wiederholungsstapel gilt Echtzeit NICHT. Dort wird ein kleiner Vorrat pro Konzept
 *  vorgehalten und rotierend ausgespielt; er wird neu erzeugt, sobald sich im Lernerbild dieses
 *  Konzepts etwas geaendert hat. […] Diese Ausnahme gilt ausschliesslich fuer die Wiederholung.
 *  Alle Aufgaben im Pfad bleiben Echtzeit."
 *
 * Die Begruendung ist eine Produktbeobachtung, keine technische: „Bei einer Lernsitzung mit fuenf
 * Aufgaben faellt Erzeugungszeit nicht auf, weil vorproduziert wird. Bei einem Stapel aus vielen
 * kurzen Abfragen, den ein Nutzer im Zug durchklickt, ist Tempo das gesamte Produkterlebnis."
 *
 * Was der Vorrat kostet, steht ebenfalls im Dokument: den Momentbezug. Vertretbar, „weil
 * Wiederholungen auf Erkennen-Niveau kaum vom aktuellen Moment abhaengen" — und genau deshalb
 * darf diese Datei nie fuer Pfadaufgaben verwendet werden. `assertReviewOnly` macht diesen
 * Missbrauch zu einem Fehler statt zu einer Abkuerzung.
 *
 * Rein — kein DOM, kein I/O. Die Persistenz liegt in `services/`.
 */

import type { GeneratedTask, LearnerConceptImage, TaskFormat } from '../types'
import { REVIEW_STACK_DEPTH } from '../planner/responsibility'

/**
 * Wie viele Abfragen je Konzept vorgehalten werden.
 *
 * „Ein kleiner Vorrat" — vier ist die Groesse, bei der die Rotation spuerbar wird, ohne dass der
 * Vorrat bei jeder Aenderung im Lernerbild teuer neu entsteht. Bei zwei faellt die Wiederholung
 * derselben Formulierung sofort auf, bei zehn zahlt man fuer Abfragen, die nie gestellt werden.
 */
export const REVIEW_STOCK_SIZE = 4

/**
 * Ab wie vielen verbliebenen Abfragen nachproduziert wird, ohne den Vorrat zu verwerfen.
 *
 * Nachfuellen statt neu erzeugen: der Vorrat ist noch gueltig, er geht nur zur Neige. Erst eine
 * Aenderung im Lernerbild macht ihn ungueltig.
 */
export const REVIEW_STOCK_REFILL_THRESHOLD = 1

export type ReviewStockItem = {
  task: GeneratedTask
  /** Wie oft diese Abfrage bereits ausgespielt wurde — steuert die Rotation. */
  timesServed: number
}

export type ReviewStock = {
  conceptId: string
  items: ReviewStockItem[]
  /** Stand des Lernerbilds, aus dem der Vorrat entstand. */
  fingerprint: string
  /** Zeigerposition der Rotation. */
  rotation: number
  createdAt: string
}

/**
 * Fingerabdruck des Lernerbilds fuer die Vorratsgueltigkeit.
 *
 * „Neu erzeugt, sobald sich im Lernerbild dieses Konzepts etwas geaendert hat" — gemeint sind die
 * GESPEICHERTEN Werte. Der Verfall gehoert ausdruecklich nicht dazu: er laeuft kontinuierlich
 * weiter und wuerde den Vorrat bei jedem Aufruf fuer ungueltig erklaeren. Damit waere die
 * Ausnahme aus 7.1 aufgehoben und man haette Echtzeit mit Zwischenschritt.
 *
 * Die Beherrschung geht gerundet ein: eine Verschiebung um ein Tausendstel aendert nichts daran,
 * welche Abfragen sinnvoll sind, wohl aber der Sprung von 0.6 auf 0.8.
 */
export function stockFingerprintOf(image: LearnerConceptImage): string {
  return [
    image.conceptId,
    image.directEvidenceCount,
    Math.round(image.mastery * 10),
    Math.round(image.confidence * 10),
    image.depth,
    image.everConsolidated ? '1' : '0',
  ].join('|')
}

/** Ist der Vorrat durch eine Aenderung im Lernerbild ueberholt? */
export function stockIsStale(stock: ReviewStock, image: LearnerConceptImage): boolean {
  return stock.fingerprint !== stockFingerprintOf(image)
}

export type StockDecision =
  /** Der Vorrat traegt — die naechste Abfrage kommt sofort. */
  | { action: 'serve'; item: ReviewStockItem; next: ReviewStock }
  /** Der Vorrat traegt noch, geht aber zur Neige: im Hintergrund nachfuellen. */
  | { action: 'serveAndRefill'; item: ReviewStockItem; next: ReviewStock; missing: number }
  /** Ueberholt oder leer: neu erzeugen. Nur hier wartet der Nutzer. */
  | { action: 'regenerate'; reason: string }

/**
 * Die naechste Abfrage aus dem Vorrat holen.
 *
 * Rotation nach Ausspielhaeufigkeit, nicht nach Reihenfolge: so kommt zuerst dran, was am
 * laengsten nicht dran war. Bei Gleichstand entscheidet die Position — deterministisch, damit
 * derselbe Stapel zweimal denselben Ablauf hat (I11 gilt auch hier).
 *
 * „Die Formulierungen wechseln zwischen den Durchgaengen, damit du das Konzept lernst und nicht
 * die Karte" (UI-Spezifikation 5.2) — genau das leistet die Rotation.
 */
export function nextFromStock(stock: ReviewStock | null, image: LearnerConceptImage): StockDecision {
  if (!stock || stock.items.length === 0) {
    return { action: 'regenerate', reason: 'Kein Vorrat vorhanden.' }
  }
  if (stockIsStale(stock, image)) {
    return { action: 'regenerate', reason: 'Das Lernerbild hat sich geaendert — der Vorrat ist ueberholt.' }
  }

  let bestIndex = 0
  for (let i = 1; i < stock.items.length; i += 1) {
    if (stock.items[i].timesServed < stock.items[bestIndex].timesServed) {
      bestIndex = i
    }
  }

  const item = stock.items[bestIndex]
  const items = stock.items.map((entry, index) =>
    index === bestIndex ? { ...entry, timesServed: entry.timesServed + 1 } : entry,
  )
  const next: ReviewStock = { ...stock, items, rotation: stock.rotation + 1 }

  const missing = REVIEW_STOCK_SIZE - items.length
  if (missing > REVIEW_STOCK_REFILL_THRESHOLD) {
    return { action: 'serveAndRefill', item: { ...item, timesServed: item.timesServed + 1 }, next, missing }
  }
  return { action: 'serve', item: { ...item, timesServed: item.timesServed + 1 }, next }
}

/**
 * Einen frisch erzeugten Vorrat anlegen.
 *
 * Der Fingerabdruck wird beim Anlegen festgehalten, nicht beim Ausspielen: er beschreibt die
 * Lage, AUS DER heraus die Abfragen entstanden sind. Genau dieser Unterschied macht die spaetere
 * Gueltigkeitspruefung aussagekraeftig.
 */
export function buildStock(args: {
  conceptId: string
  tasks: GeneratedTask[]
  image: LearnerConceptImage
  nowIso: string
}): ReviewStock {
  return {
    conceptId: args.conceptId,
    items: args.tasks.slice(0, REVIEW_STOCK_SIZE).map((task) => ({ task, timesServed: 0 })),
    fingerprint: stockFingerprintOf(args.image),
    rotation: 0,
    createdAt: args.nowIso,
  }
}

/** Einen bestehenden Vorrat auffuellen, ohne die Ausspielzaehler zu verlieren. */
export function topUpStock(stock: ReviewStock, tasks: GeneratedTask[]): ReviewStock {
  const room = Math.max(0, REVIEW_STOCK_SIZE - stock.items.length)
  if (room === 0) {
    return stock
  }
  return {
    ...stock,
    items: [...stock.items, ...tasks.slice(0, room).map((task) => ({ task, timesServed: 0 }))],
  }
}

/**
 * Die Ausnahme bleibt eine Ausnahme (Kapitel 7.1, letzter Satz).
 *
 * Ein Vorrat fuer Pfadaufgaben waere Vorratsproduktion — genau die Entscheidung, die Kapitel 7.1
 * gegen die Echtzeit abgewogen und verworfen hat. Die Pfadaufgabe weiss, dass die Person vor
 * zwei Minuten diesen Fehler gemacht hat; eine vorproduzierte weiss es nicht.
 *
 * Wirft, statt zurueckzugeben: eine Pfadaufgabe aus dem Vorrat ist kein Randfall, sondern eine
 * stillschweigend geaenderte Architekturentscheidung.
 */
export function assertReviewOnly(context: { depth: string; fromReviewStack: boolean }): void {
  if (!context.fromReviewStack) {
    throw new Error(
      'Vorratserzeugung ist nach Kapitel 7.1 ausschliesslich fuer den Wiederholungsstapel zugelassen. ' +
        'Pfadaufgaben bleiben Echtzeit.',
    )
  }
  if (context.depth !== REVIEW_STACK_DEPTH) {
    throw new Error(
      `Der Wiederholungsstapel arbeitet auf „${REVIEW_STACK_DEPTH}" (Kapitel 6.7); ` +
        `angefragt war „${context.depth}".`,
    )
  }
}

/**
 * Zugelassene Formate im Stapel.
 *
 * Der Stapel laeuft auf Erkennen (Kapitel 6.7) und ist „kurz, mechanisch". Die Kurzantwort
 * bleibt trotzdem dabei: sie ist die einzige Form, in der die Person tippt statt wiederzuerkennen,
 * und ohne sie waere der Stapel wieder ein Karteikartensystem mit Umdrehen.
 */
export function reviewStackFormats(): TaskFormat[] {
  return ['multipleChoice', 'shortAnswer', 'matching']
}
