/**
 * Schicht 5 — Qualitaetssicherung (Kapitel 7.2).
 *
 * Eine generierte Aufgabe kann auf drei Arten kaputt sein:
 *   1. inhaltlich falsch
 *   2. gar nicht loesbar
 *   3. die hinterlegte Musterloesung stimmt nicht
 *
 * Gegenmassnahmen:
 *   Fehlerart 1  Abgleich mit dem Quellmaterial (Invariante I5) — immer.
 *   Fehlerart 3  Gegenloesen bei Aufgaben mit eindeutiger Antwort — ein zweites Modell loest die
 *                Aufgabe unabhaengig, OHNE die Musterloesung zu kennen. Weicht das Ergebnis ab,
 *                geht die Aufgabe nicht raus.
 *
 * Warum Fehlerart 3 die gefaehrlichste ist: der Pruefer bestraft den Nutzer dann fuer eine
 * RICHTIGE Antwort. Das kostet doppelt — der Nutzer verliert sofort das Vertrauen, und ein
 * falsches Signal wandert ins Lernerbild, wo es zusaetzlich propagiert.
 *
 * Diese Datei enthaelt die Entscheidungs- und Vergleichslogik. Die Modellaufrufe (Kontrolleur)
 * liegen in `agents/client.ts`.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { ControlVerdict, GeneratedTask } from '../types'
import { InvariantViolation } from '../invariants'
import { requiresCounterSolve } from './formats'

/**
 * Welche Pruefungen eine Aufgabe durchlaufen muss.
 *
 * Der Quellenabgleich ist nicht verhandelbar (I5). Das Gegenloesen haengt am Format.
 */
export type QualityGatePlan = {
  sourceCheck: true
  counterSolve: boolean
}

export function gatePlanFor(task: Pick<GeneratedTask, 'format'>): QualityGatePlan {
  return { sourceCheck: true, counterSolve: requiresCounterSolve(task.format) }
}

/**
 * Zwei Antworten auf Gleichwertigkeit pruefen.
 *
 * Bewusst tolerant bei Schreibweise und Einheiten, streng bei der Sache: „255.255.255.192" und
 * „255.255.255.192/26" sind dasselbe Ergebnis, „24" und „26" nicht. Ein zu strenger Vergleich
 * wuerde korrekte Aufgaben aussortieren und die Produktion lahmlegen; ein zu lockerer wuerde
 * genau die Fehlerart durchlassen, gegen die das Gegenloesen antritt.
 */
export function answersAgree(a: string, b: string): boolean {
  const normalise = (value: string) => {
    const collapsed = value
      .toLowerCase()
      // \u00a0 steht explizit dabei, obwohl \s es abdeckt: das geschuetzte Leerzeichen kommt in
      // Modellausgaben haeufig vor, und ohne diese Notiz sieht die Klasse nach einem Tippfehler aus.
      .replace(/[\s\u00a0]+/g, '')
      .trim()
    const stripped = collapsed.replace(/[.,;:!?"'`´()[\]]+$/g, '')
    /*
     * Faellt die Interpunktionsbereinigung auf leer zurueck, war sie zu gierig: bei einer Antwort,
     * die ausschliesslich aus Zeichen dieser Klasse besteht — etwa der IPv6-Unspecified-Adresse
     * „::" —, wuerde sie sich selbst wegstreichen. Dann gilt die unbereinigte Fassung. Ohne diesen
     * Rueckfall faellt jede solche Antwort ins „leer" der naechsten Zeile und damit immer durch,
     * auch gegen sich selbst.
     */
    return stripped.length > 0 ? stripped : collapsed
  }

  const left = normalise(a)
  const right = normalise(b)
  if (left.length === 0 || right.length === 0) {
    return false
  }
  if (left === right) {
    return true
  }
  // Zahlen aus beiden Antworten vergleichen — deckt „26" vs. „/26" und „x = 26" ab.
  const numbersOf = (value: string) => (value.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'))
  const leftNumbers = numbersOf(left)
  const rightNumbers = numbersOf(right)
  if (leftNumbers.length > 0 && leftNumbers.length === rightNumbers.length) {
    return leftNumbers.every((n, i) => Number(n) === Number(rightNumbers[i]))
  }
  return left.includes(right) || right.includes(left)
}

/**
 * Bei einer Auswahlfrage: die vom Kontrolleur gewaehlte Option ueber ihre POSITION bestimmen,
 * statt ueber den Wortlaut zu vergleichen.
 *
 * Der Grund liegt in dem, was `answersAgree` NICHT leisten kann: bei kurzen Werten (Zahlen,
 * Zuordnungen) reicht Zeichenketten- und Zahlenabgleich, weil es fast nichts umzuformulieren
 * gibt. Bei Auswahlfragen sind die Optionen aber oft ganze Saetze — und ein unabhaengig loesendes
 * Modell umschreibt sie routinemaessig ("Weil sie …" statt "Weil die Familie …", ein
 * abgeschnittener Nachsatz), obwohl es dieselbe Option meint. Das ist keine falsche Loesung,
 * sondern eine andere Formulierung derselben Loesung — und genau dafuer ist Zeichenkettenvergleich
 * blind.
 *
 * Die Positionsnummer umgeht das Problem, statt es zu tolerieren: sie laesst sich nicht
 * umformulieren. Der Kontrolleur-Auftrag verlangt sie deshalb ausdruecklich (Kapitel 7.2). Haelt
 * sich das Modell trotzdem nicht daran — ein Ausrutscher, ein aelteres Modell —, faellt diese
 * Funktion auf den urspruenglichen Text zurueck: eine Antwort, die zufaellig doch woertlich
 * uebereinstimmt, soll nicht an einer zu strengen Auswertung scheitern.
 */
export function resolveCounterSolveAnswer(counterAnswer: string, options: string[] | undefined): string {
  if (!options || options.length === 0) {
    return counterAnswer
  }

  const trimmed = counterAnswer.trim()

  // „2", „2.", „Option 2" — die vom Kontrolleur-Auftrag verlangte Form.
  const numberMatch = trimmed.match(/^(?:option\s*)?(\d+)/i)
  if (numberMatch) {
    const index = Number(numberMatch[1]) - 1
    if (index >= 0 && index < options.length) {
      return options[index]
    }
  }

  // „B", „b)" — falls das Modell trotz Auftrag in Buchstaben antwortet.
  const letterMatch = trimmed.match(/^([a-z])\b/i)
  if (letterMatch) {
    const index = letterMatch[1].toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0)
    if (index >= 0 && index < options.length) {
      return options[index]
    }
  }

  return counterAnswer
}

/**
 * Der abschliessende Satz jeder Ablehnung nach I5 — reine Zusammenfassung, ohne eigenen Befund.
 *
 * Als Konstante, weil `buildRejectionHint` ihn wieder herausfiltern muss: als Hinweis an den
 * Generator waere er wertlos ("deine Aufgabe war nicht verankert" sagt nicht, WAS fehlte) und
 * wuerde den eigentlichen Grund nur verduennen. Zwei Kopien derselben Zeichenkette in zwei
 * Funktionen wuerden frueher oder spaeter auseinanderlaufen, und der Filter griffe stillschweigend
 * nicht mehr.
 */
const NOT_ANCHORED_ISSUE = 'Aufgabe laesst sich nicht im Quellmaterial verankern.'

/**
 * Aus dem Befund des Kontrolleurs den Hinweis bauen, mit dem der naechste Erzeugungsversuch
 * ansetzen kann — oder `null`, wenn nichts Verwertbares darin steht.
 *
 * Der Grund, warum es das ueberhaupt gibt: ein Wiederholungsversuch ohne diesen Hinweis bekommt
 * exakt dieselbe Ausgangslage wie der gescheiterte — dasselbe Konzept, denselben Auszug, dasselbe
 * Format. Nach I11 (gleiche Lage, gleiches Ergebnis) ist damit auch dasselbe Ergebnis zu erwarten:
 * `MAX_GENERATION_ATTEMPTS` Modellaufrufe, die alle am selben Punkt scheitern, und am Ende ein
 * Abbruch. Der Kontrolleur hat den Mangel aber praezise benannt ("die Einschraenkung X steht nicht
 * im Auszug"); ihn wegzuwerfen und stattdessen blind zu wiederholen ist die eigentliche
 * Schwachstelle — nicht der einzelne Mangel, den er gerade gefunden hat.
 *
 * Bewusst unspezifisch gegenueber dem GRUND: hier wird nicht nach Fehlerarten unterschieden. Was
 * der Kontrolleur beanstandet, geht zurueck — auch eine Beanstandung, die es heute noch nicht
 * gibt. Genau das unterscheidet diese Rueckkopplung von einer Sonderbehandlung je Einzelfall.
 */
export function buildRejectionHint(issues: string[]): string | null {
  const substantive = issues
    .map((issue) => issue.trim())
    .filter((issue) => issue.length > 0 && issue !== NOT_ANCHORED_ISSUE)
  return substantive.length > 0 ? substantive.join(' ') : null
}

/**
 * Den Befund des Kontrolleurs zusammensetzen.
 *
 * `counterAnswer` ist null, wenn nicht gegengeloest wurde (offene Aufgabe). Das ist ein anderer
 * Zustand als „gegengeloest und abweichend" und wird deshalb als `counterSolved: null` gefuehrt,
 * nicht als `false`.
 */
export function buildControlVerdict(args: {
  task: GeneratedTask
  sourceAligned: boolean
  sourceIssues?: string[]
  counterAnswer?: string | null
  /** Siehe `ControlVerdict.materialInsufficient`. Nur relevant, wenn `sourceAligned` false ist. */
  materialInsufficient?: boolean
}): ControlVerdict {
  const plan = gatePlanFor(args.task)
  const issues = [...(args.sourceIssues ?? [])]

  let counterSolved: boolean | null = null
  if (plan.counterSolve) {
    if (args.counterAnswer == null || args.counterAnswer.trim().length === 0) {
      counterSolved = false
      issues.push('Gegenloesen erforderlich, aber keine unabhaengige Antwort erhalten.')
    } else {
      counterSolved = answersAgree(args.counterAnswer, args.task.expectedAnswer)
      if (!counterSolved) {
        issues.push(
          `Unabhaengige Loesung weicht ab: „${args.counterAnswer.trim().slice(0, 120)}" statt „${args.task.expectedAnswer.slice(0, 120)}".`,
        )
      }
    }
  }

  if (!args.sourceAligned) {
    issues.push(NOT_ANCHORED_ISSUE)
  }

  return {
    sourceAligned: args.sourceAligned,
    counterSolved,
    counterAnswer: args.counterAnswer ?? null,
    passed: args.sourceAligned && counterSolved !== false,
    issues,
    materialInsufficient: !args.sourceAligned && args.materialInsufficient === true,
  }
}

/**
 * Invariante I5 — Torwaechter vor der Auslieferung.
 *
 * „Kein generiertes Material erreicht den Nutzer ohne Quellenabgleich." Halluzinierte Inhalte
 * vergiften ueber den Pruefer auch das Lernerbild: der Nutzer antwortet auf eine falsche Frage,
 * der Pruefer bewertet gegen eine falsche Musterloesung, und das Ergebnis propagiert.
 *
 * Wirft statt zurueckzugeben. Eine Aufgabe, die diesen Punkt erreicht, ohne geprueft zu sein,
 * ist ein Programmierfehler, kein Randfall.
 */
export function assertTaskCleared(task: GeneratedTask, verdict: ControlVerdict | null): void {
  if (!verdict) {
    throw new InvariantViolation('I5', `Aufgabe zu „${task.conceptId}" ohne Kontrolleur-Befund ausgeliefert.`)
  }
  if (!verdict.sourceAligned) {
    throw new InvariantViolation('I5', `Aufgabe zu „${task.conceptId}" ohne Quellenverankerung ausgeliefert.`)
  }
  if (gatePlanFor(task).counterSolve && verdict.counterSolved !== true) {
    throw new InvariantViolation(
      'I5',
      `Aufgabe zu „${task.conceptId}" mit eindeutiger Antwort wurde nicht erfolgreich gegengeloest.`,
    )
  }
}

/**
 * Wie oft ein abgelehnter Versuch wiederholt wird, bevor das Konzept uebersprungen wird.
 *
 * Ohne Obergrenze koennte ein Konzept, dessen Quellmaterial luecken hat, die Sitzung endlos
 * blockieren: der Generator produziert, der Kontrolleur lehnt ab, der Nutzer wartet.
 */
export const MAX_GENERATION_ATTEMPTS = 3

export type ProductionOutcome =
  | { status: 'ready'; task: GeneratedTask; verdict: ControlVerdict }
  | { status: 'retry'; attempt: number; issues: string[] }
  | { status: 'abandoned'; issues: string[] }

/** Ergebnis eines Kontrollversuchs in eine Ablaufentscheidung uebersetzen. */
export function decideProduction(args: {
  task: GeneratedTask
  verdict: ControlVerdict
  attempt: number
}): ProductionOutcome {
  if (args.verdict.passed) {
    return { status: 'ready', task: args.task, verdict: args.verdict }
  }
  /*
   * Materialluecke statt Formulierungsfehler: der Auszug aendert sich zwischen Versuchen nicht
   * (`generateTask.ts` gibt ihn unveraendert weiter), also scheitert eine Wiederholung aus
   * demselben Grund (I11 — gleiche Lage, gleiches Ergebnis). Sofort aufgeben statt
   * `MAX_GENERATION_ATTEMPTS` an einem von vornherein aussichtslosen Konzept zu verbrauchen.
   *
   * ABER nicht bei einer Auswahlfrage. Deren Ablenker sind per Definition falsche Aussagen und
   * damit im Auszug nicht belegbar — der Kontrolleur meldet dann „Material reicht nicht", obwohl
   * der zentrale Begriff sehr wohl belegt ist und nur die ABLENKER unpassend gewaehlt waren. Genau
   * dieser Fehlalarm ist beobachtet worden (Ablenker zu Steuerarten, die der Auszug nicht nennt).
   * Anders als eine echte Materialluecke ist das ein Formulierungsmangel: der naechste Versuch
   * zieht andere Ablenker und kann gelingen. Ein Sofortabbruch wuerde hier eine sonst brauchbare
   * Aufgabe wegen einer Formfrage verwerfen — dieselbe Regel wie bei Schicht 1/2 in
   * `generateTask.ts`. Ohne Optionen (Kurzantwort, Rechnung) gibt es keine Ablenker und damit
   * keinen Fehlalarm: dort bleibt der Sofortabbruch.
   */
  if (args.verdict.materialInsufficient && (args.task.options?.length ?? 0) === 0) {
    return { status: 'abandoned', issues: args.verdict.issues }
  }
  if (args.attempt + 1 < MAX_GENERATION_ATTEMPTS) {
    return { status: 'retry', attempt: args.attempt + 1, issues: args.verdict.issues }
  }
  return { status: 'abandoned', issues: args.verdict.issues }
}
