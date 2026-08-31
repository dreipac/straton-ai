/**
 * Platzhalter-Modus fuer das Gehirn (Admin-Test ohne API-Kosten).
 *
 * `production/generateTask.ts` und `hooks/useBrainSession.ts` rufen fuer jede Aufgabe drei bis
 * vier Modellrollen auf (Generator, Kontrolleur zweifach, Pruefer) — genau die Kosten, die
 * Platzhalter-Modus im alten Lernmotor vermeidet (siehe `utils/learnPlaceholder.ts`). Bis zu
 * dieser Datei hatte das Gehirn dafuer keine Entsprechung: `generationMode` kam in `brain/`
 * nirgends vor, ein Platzhalter-Lernpfad rief also trotzdem die echten Agenten auf, sobald eine
 * Sitzung startete.
 *
 * Diese Datei liefert die deterministischen Ersatzstuecke — kein Netzwerk, kein Modell:
 *  - `buildPlaceholderTask` ersetzt `generateClearedTask` (keine Erzeugung, kein Kontrolleur).
 *  - `evaluatePlaceholderVerdict` ersetzt den Pruefer-Aufruf in `useBrainSession.answer`.
 *
 * Bewertungsregel identisch zum alten Motor: bei einer Auswahl ist die erste Option immer
 * richtig, bei freiem Text zaehlt das Wort „Test". Simpel und absichtlich vorhersagbar, nicht
 * realistisch — der Zweck ist, den kompletten Sitzungsablauf ohne KI durchklicken zu koennen.
 */

import type { ApplicationDepth, BrainConcept, ExaminerVerdict, GeneratedTask, TaskFormat } from '../types'
import { composeMatchingAnswer, formatSpec } from './formats'
import { placeholderDelay } from '../../utils/learnPlaceholder'

export { placeholderDelay }

const DEPTH_LABEL: Record<ApplicationDepth, string> = {
  recognize: 'Erkennen',
  apply: 'Anwenden',
  transfer: 'Uebertragen',
}

/** Feste Ablenker — genuegen fuer den Platzhalter-Zweck, muessen keine echten Verwechslungen sein. */
const PLACEHOLDER_DISTRACTORS = ['Zweite Option (falsch)', 'Dritte Option (falsch)', 'Vierte Option (falsch)']

/** Feste Paare fuer den Zuordnungs-Platzhalter — Reihenfolge = die richtige Zuordnung (A-1, B-2, C-3). */
const PLACEHOLDER_MATCH_TERMS = ['Begriff A', 'Begriff B', 'Begriff C']
const PLACEHOLDER_MATCH_DESCRIPTIONS = ['Beschreibung 1', 'Beschreibung 2', 'Beschreibung 3']

export type BuildPlaceholderTaskArgs = {
  concept: BrainConcept
  depth: ApplicationDepth
  format: TaskFormat
  /** Begruendung des Planers (I8) — wandert unveraendert durch, wie bei der echten Erzeugung. */
  reason: string
}

/**
 * Ersetzt `generateClearedTask` im Platzhalter-Modus: keine Agentenaufrufe, sofort eine
 * durchgereichte, formal gueltige Aufgabe. Der Torwaechter (I5) hat hier nichts zu pruefen — es
 * gibt keine Behauptung ueber das Quellmaterial, die geprueft werden muesste.
 */
export function buildPlaceholderTask(args: BuildPlaceholderTaskArgs): GeneratedTask {
  const { concept, depth, format, reason } = args
  const spec = formatSpec(format)
  const depthLabel = DEPTH_LABEL[depth]

  if (format === 'matching') {
    // Eigener Zweig statt Teil des multipleChoice-Zweigs (siehe unten): eine Zuordnung braucht
    // matchTerms/matchDescriptions statt options, sonst rendert BrainSession.tsx den generischen
    // Fliesstext-Zweig statt der interaktiven Zuordnung — der Platzhalter-Modus wuerde die neue
    // Oberflaeche dann nie zu Gesicht bekommen.
    //
    // `correct` entsteht ueber dieselbe Funktion, die auch die echte Nutzereingabe zusammensetzt
    // (`composeMatchingAnswer`) — mit der Identitaetszuordnung "0,1,2" (Begriff i -> Beschreibung
    // i). So bleibt die Musterloesung garantiert im selben Format wie eine echte Antwort, auch
    // wenn sich dieses Format einmal aendert.
    const correct = composeMatchingAnswer(PLACEHOLDER_MATCH_TERMS, PLACEHOLDER_MATCH_DESCRIPTIONS, '0,1,2')
    return {
      conceptId: concept.id,
      format,
      depth,
      difficulty: concept.difficulty,
      prompt: `Platzhalter-Zuordnung (${depthLabel}) zu „${concept.name}" — ordne jeden Begriff seiner Beschreibung zu (A-1, B-2, C-3 ist richtig).`,
      expectedAnswer: correct,
      sourceGrounding: 'Platzhalter-Modus: kein Materialbeleg, ohne KI erzeugt.',
      reason,
      matchTerms: PLACEHOLDER_MATCH_TERMS,
      matchDescriptions: PLACEHOLDER_MATCH_DESCRIPTIONS,
    }
  }

  if (spec.hasUniqueAnswer && spec.depths.includes('recognize')) {
    // multipleChoice: Auswahl mit fester richtiger erster Option.
    // Tabelle in der Aufgabenstellung als Demo -- renderLearnStepContent erkennt GFM-Pipe-Tabellen
    // (Trennzeile |---|---|) und Aufzählungen (-, *, •), statt alles als eine Fliesstext-Zeile
    // zu zeigen. Nur Anzeige, aendert nichts an Bewertung/Optionen.
    const correct = `Richtige Antwort zu „${concept.name}"`
    return {
      conceptId: concept.id,
      format,
      depth,
      difficulty: concept.difficulty,
      prompt: `Platzhalter-Frage (${depthLabel}) zu „${concept.name}" — vergleiche die Beträge:\n| Position | Netto | Brutto |\n| --- | --- | --- |\n| Ware A | 100 € | 119 € |\n| Ware B | 250 € | 297,50 € |\nWelche Option ist richtig?`,
      expectedAnswer: correct,
      sourceGrounding: 'Platzhalter-Modus: kein Materialbeleg, ohne KI erzeugt.',
      reason,
      options: [correct, ...PLACEHOLDER_DISTRACTORS],
    }
  }

  if (spec.hasUniqueAnswer) {
    // calculation / clozeCalculation: eindeutige, aber freie Eingabe.
    return {
      conceptId: concept.id,
      format,
      depth,
      difficulty: concept.difficulty,
      prompt: `Platzhalter-Aufgabe (${depthLabel}) zu „${concept.name}": Tippe die Zahl 42 als Antwort.`,
      expectedAnswer: '42',
      sourceGrounding: 'Platzhalter-Modus: kein Materialbeleg, ohne KI erzeugt.',
      reason,
    }
  }

  // shortAnswer / procedure / scenario / errorHunt / justification: freie Prosa-Antwort.
  // Aufzählung in der Aufgabenstellung als Demo (siehe Kommentar oben bei der Tabelle).
  return {
    conceptId: concept.id,
    format,
    depth,
    difficulty: concept.difficulty,
    prompt: `Platzhalter-Aufgabe (${depthLabel}) zu „${concept.name}" — gegeben:\n- Nettobetrag: 100 €\n- Steuersatz: 19 %\nTippe das Wort „Test" als Antwort.`,
    expectedAnswer: 'Im Platzhalter-Modus zaehlt jede Antwort mit dem Wort „Test".',
    sourceGrounding: 'Platzhalter-Modus: kein Materialbeleg, ohne KI erzeugt.',
    reason,
  }
}

/**
 * Ersetzt den Pruefer-Aufruf (`callWithEscalation({ role: 'pruefer', ... })`) im Platzhalter-Modus.
 * Volle Zuversicht, weil die Regel selbst keine Auslegungssache kennt.
 */
export function evaluatePlaceholderVerdict(args: {
  concept: BrainConcept
  task: GeneratedTask
  userAnswer: string
}): ExaminerVerdict {
  const { concept, task, userAnswer } = args
  const spec = formatSpec(task.format)
  const answer = userAnswer.trim()

  const isCorrect =
    spec.hasUniqueAnswer && task.options && task.options.length > 0
      ? answer === task.options[0]
      : spec.hasUniqueAnswer
        ? answer === task.expectedAnswer
        : answer.toLowerCase().includes('test')

  if (isCorrect) {
    return { credit: 1, partialCredit: { platzhalter: 1 }, cause: null, confidence: 1 }
  }

  return {
    credit: 0,
    partialCredit: { platzhalter: 0 },
    cause: {
      kind: 'confused',
      object: concept.name,
      rawDescription: 'Platzhalter-Bewertung ohne KI: Antwort weicht von der festen Musterloesung ab.',
      subject: concept.name,
    },
    confidence: 1,
  }
}
