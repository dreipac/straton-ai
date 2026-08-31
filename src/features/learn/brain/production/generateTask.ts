/**
 * Der eine Weg, auf dem eine Aufgabe entsteht (Kapitel 7.2).
 *
 * Erzeugen, gegen die Quelle pruefen, bei eindeutiger Antwort unabhaengig gegenloesen, dann erst
 * freigeben. Der Kontrolleur bekommt beim Gegenloesen ausdruecklich KEINE Musterloesung — sonst
 * bestaetigt er sie bloss.
 *
 * Warum das hier steht und nicht in den Hooks: Pfad und Wiederholungsstapel brauchen beide eine
 * freigegebene Aufgabe, und zwei Kopien dieses Ablaufs waeren zwei Torwaechter. Einer davon
 * bliebe frueher oder spaeter hinter dem anderen zurueck, und ein halber Torwaechter ist bei I5
 * dasselbe wie keiner.
 *
 * Die einzige Datei dieser Schicht mit Aussenkontakt: sie ruft Agenten auf. Alles Urteilende
 * daran (`buildControlVerdict`, `decideProduction`, `assertTaskCleared`) bleibt rein und
 * pruefbar; hier steht nur die Reihenfolge.
 */

import type { ApplicationDepth, BrainConcept, GeneratedTask, TaskFormat } from '../types'
import {
  descriptionsDescribeTheText,
  extractMatchPairsFromPrompt,
  extractOrdinalOptionReference,
  formatSpec,
  optionsLookLikeFullAssignments,
  permuteOptionsDeterministically,
  promptReferencesTheSource,
  requiresCounterSolve,
} from './formats'
import {
  answersAgree,
  assertTaskCleared,
  buildControlVerdict,
  buildRejectionHint,
  decideProduction,
  resolveCounterSolveAnswer,
} from './quality'
import { callBrainAgent } from '../agents/client'
import type { GeneratorResult } from '../agents/contracts'
import { parseCounterSolveResult, parseGeneratorResult, parseSourceCheckResult } from '../agents/contracts'

/**
 * Welche Option einer Auswahlfrage die richtige ist — und ob die beiden Angaben des Generators
 * darueber ueberhaupt uebereinstimmen.
 *
 * Der Generator liefert die Information doppelt: als Index (`correctOptionIndex`) und als
 * ausformulierte `expectedAnswer`. Die Doppelung ist hier ausdruecklich erwuenscht — sie erlaubt
 * einen Abgleich. Blind dem Index zu folgen waere gefaehrlich: sagt das Modell aus Gewohnheit „0",
 * obwohl seine eigene Musterloesung die dritte Option meint, wuerde eine RICHTIGE Musterloesung
 * durch eine falsche ersetzt — und der Nutzer bekaeme fuer die richtige Antwort null Punkte. Das
 * ist Fehlerart 3 aus Kapitel 7.2, die teuerste von allen.
 */
type CorrectOptionResolution =
  /** Index gesichert: `options[index]` ist die verbindliche Musterloesung. */
  | { kind: 'index'; index: number }
  /** Index und Musterloesung widersprechen sich — Erzeugungsmangel, nichts uebernehmen. */
  | { kind: 'mismatch' }
  /** Keine Positionsangabe bestimmbar; `expectedAnswer` bleibt unveraendert stehen. */
  | { kind: 'unknown' }

function resolveCorrectOption(generated: GeneratorResult): CorrectOptionResolution {
  const { options, expectedAnswer, correctOptionIndex } = generated
  if (options.length === 0) {
    return { kind: 'unknown' }
  }

  /*
   * Ist `expectedAnswer` selbst nur ein Verweis („Die erste Option ist richtig: …") statt einer
   * Aussage, geht beim Ersetzen nichts verloren — im Gegenteil, erst dadurch wird sie mit einer
   * Option woertlich vergleichbar. Nur wenn der Generator zusaetzlich einen widersprechenden Index
   * nennt, ist unklar, welche Angabe gilt.
   */
  const pointer = extractOrdinalOptionReference(expectedAnswer, options.length)
  if (pointer !== null) {
    if (correctOptionIndex === null || correctOptionIndex === pointer) {
      return { kind: 'index', index: pointer }
    }
    return { kind: 'mismatch' }
  }

  if (correctOptionIndex === null) {
    return { kind: 'unknown' }
  }

  /*
   * Index UND ausformulierte Musterloesung: beide muessen dieselbe Option meinen. `answersAgree`
   * ist bei Schreibweise tolerant und in der Sache streng — genau der Massstab, der hier gebraucht
   * wird, denn eine Musterloesung darf die Option ergaenzen („… , weil …"), aber nicht ersetzen.
   */
  return answersAgree(options[correctOptionIndex], expectedAnswer)
    ? { kind: 'index', index: correctOptionIndex }
    : { kind: 'mismatch' }
}

/**
 * Ein Formmangel einer Auswahlfrage, der einen einzelnen Neuversuch rechtfertigt — oder `null`.
 *
 * Beide Faelle sind Mangel an der ERZEUGUNG, nicht am Material: ein zweiter Versuch mit derselben
 * Ausgangslage kann sie beheben, weil das Modell andere Optionen zieht. Deshalb liegen sie
 * ausserhalb von I5 und ausserhalb von `decideProduction` (siehe Aufrufstelle).
 */
function multipleChoiceDefectHint(generated: GeneratorResult): string | null {
  if (optionsLookLikeFullAssignments(generated.options)) {
    return (
      'Der letzte Versuch hat als Optionen alternative Komplett-Zuordnungen angeboten ' +
      '(z. B. "A-1, B-2, C-3" gegen "A-2, B-1, C-3"). Das ist bei multipleChoice nicht ' +
      'erlaubt: jede Option ist eine eigenstaendige Aussage ueber EINEN Begriff, mit ' +
      'plausiblen Ablenkern zu genau diesem einen Begriff.'
    )
  }
  if (resolveCorrectOption(generated).kind === 'mismatch') {
    return (
      'Im letzten Versuch zeigte correctOptionIndex auf eine andere Option, als expectedAnswer ' +
      'inhaltlich beschreibt. Beide muessen dieselbe Option meinen: setze correctOptionIndex auf ' +
      'die tatsaechliche Position der richtigen Option und schreibe in expectedAnswer genau diese ' +
      'Aussage aus.'
    )
  }
  return null
}

/**
 * Der Fragetext handelt vom Dokument statt von der Sache — siehe `promptReferencesTheSource`.
 *
 * Gilt fuer alle Formate, deshalb getrennt von den formatgebundenen Mangelpruefungen.
 */
function promptDefectHint(generated: GeneratorResult): string | null {
  if (promptReferencesTheSource(generated.prompt)) {
    return (
      'Der Aufgabentext des letzten Versuchs verwies auf das Quelldokument selbst (etwa „Im ' +
      'Dossier wird genannt …", „laut dem Text …", „welche der im Material aufgefuehrten …"). ' +
      'Der Auszug ist die Grundlage der Aufgabe, nicht ihr Gegenstand: er darf im Fragetext nicht ' +
      'vorkommen. Frage direkt nach der Sache — „Was sind Besitzsteuern?" statt „Wie werden ' +
      'Besitzsteuern im Dossier beschrieben?". Der Quellbezug gehoert ausschliesslich in ' +
      'sourceGrounding.'
    )
  }
  return null
}

/**
 * Derselbe Gedanke fuer Zuordnungen: ein Formmangel, den ein zweiter Versuch beheben kann.
 *
 * Geprueft werden die Beschreibungen — auch die aus dem Aufgabentext nachgelesenen, denn ob der
 * Generator sie als Feld geliefert oder nur in den Text geschrieben hat, aendert nichts an ihrer
 * Tauglichkeit.
 */
function matchingDefectHint(generated: GeneratorResult): string | null {
  const descriptions =
    generated.matchDescriptions.length > 0
      ? generated.matchDescriptions
      : (extractMatchPairsFromPrompt(generated.prompt)?.descriptions ?? [])

  if (descriptions.length > 0 && descriptionsDescribeTheText(descriptions)) {
    return (
      'Im letzten Versuch beschrieben die Zuordnungen den Auszug statt die Begriffe (etwa "im ' +
      'Text genannte Beispiele dafuer" oder "Bereich, zu dem hier gefragt wird"). Jede ' +
      'Beschreibung muss sagen, was der Begriff IN DER SACHE bedeutet, damit die Zuordnung ' +
      'Verstaendnis misst und nicht den Aufbau des Textes. Waehle notfalls andere Begriffe aus ' +
      'dem Auszug, zu denen der Auszug echte Bedeutungen hergibt.'
    )
  }
  return null
}

export type GenerateTaskArgs = {
  concept: BrainConcept
  depth: ApplicationDepth
  format: TaskFormat
  /** Der Auszug, gegen den geprueft wird. Ohne ihn ist keine Freigabe nach I5 moeglich. */
  sourceExcerpt: string
  /** Die Begruendung des Planers (I8) — wandert unveraendert in die Aufgabe. */
  reason: string
  /** Letzte bekannte Fehlerursache, damit die Aufgabe daran ansetzen kann. */
  lastErrorHint?: string | null
  attempt?: number
  /**
   * Der Befund, an dem der vorige Versuch gescheitert ist — siehe `buildRejectionHint`. Wird
   * ausschliesslich von der Wiederholung unten gesetzt, nie von den Aufrufern: beim ersten Versuch
   * gibt es definitionsgemaess noch nichts zu beheben.
   */
  rejectionHint?: string | null
  /**
   * Websuche, falls verfuegbar — wird NUR aufgerufen, wenn der Kontrolleur festgestellt hat, dass
   * der Auszug die Frage stellt, ohne sie zu beantworten (`posesQuestionOnly`). Niemals im
   * Normalfall: eine Suche kostet Guthaben und waere dort auch fachlich falsch, weil das Material
   * die Wahrheitsquelle ist.
   *
   * Wird sie nicht uebergeben oder schlaegt sie fehl, faellt die Erzeugung auf das Fachwissen des
   * Modells zurueck (`answerProvenance: 'model'`) — nie auf einen Abbruch.
   */
  searchWeb?: (query: string) => Promise<string>
  /**
   * Woher die Antwort dieses Durchlaufs kommen darf. Steuert die Rekursion unten und landet
   * unveraendert in `GeneratedTask.answerProvenance`. `undefined` = erster Durchlauf, es gilt der
   * strenge Deckungsmassstab.
   */
  answerProvenance?: 'web' | 'model'
}

export async function generateClearedTask(args: GenerateTaskArgs): Promise<GeneratedTask> {
  const { concept } = args
  const attempt = args.attempt ?? 0
  const spec = formatSpec(args.format)

  /*
   * Schneller, ehrlicher Abbruch statt drei stiller Fehlversuche.
   *
   * Ohne jeden Auszug kann der Generator nichts Belegbares schreiben und der Kontrolleur nichts
   * verankern — das Ergebnis waere in JEDEM der `MAX_GENERATION_ATTEMPTS` Versuche dasselbe, weil
   * sich an der Ausgangslage zwischen den Versuchen nichts aendert (I11: gleiche Lage, gleiches
   * Ergebnis). Drei Modellaufrufe zu verbrauchen, um dreimal denselben Mangel zu melden, waere
   * teuer und wuerde den eigentlichen Befund hinter der generischen Abbruchmeldung verstecken.
   */
  if (attempt === 0 && args.sourceExcerpt.trim().length === 0) {
    throw new Error(
      `Zu „${concept.name}" liegt weder ein Materialbeleg noch eine Beschreibung vor — ohne ` +
        'Quelle laesst sich keine belegbare Aufgabe erzeugen (Invariante I5).',
    )
  }

  let generated = parseGeneratorResult(
    (
      await callBrainAgent({
        role: 'generator',
        payload: {
          conceptName: concept.name,
          conceptDescription: concept.description,
          depth: args.depth,
          format: args.format,
          difficulty: concept.difficulty,
          sourceExcerpt: args.sourceExcerpt,
          lastErrorHint: args.lastErrorHint ?? null,
          rejectionHint: args.rejectionHint ?? null,
          formatBrief: spec.brief,
        },
      })
    ).data,
  )

  if (!generated) {
    throw new Error('Der Generator hat keine verwertbare Aufgabe geliefert.')
  }

  /*
   * Ein einzelner Neuversuch beim Generator wegen eines FORMMANGELS — nie wegen des Inhalts.
   *
   * Bewusst ausserhalb von I5: der Kontrolleur bekommt gleich nur das Endergebnis zu sehen, nie
   * den verworfenen Versuch. Kein Bezug zu `attempt`/`MAX_GENERATION_ATTEMPTS`/`decideProduction`
   * — genau EIN Zusatzaufruf, keine Schleife. Bleibt der Mangel, wird trotzdem das vorhandene
   * Ergebnis verwendet: eine Formfrage darf nie zum Abbruch einer sonst brauchbaren Aufgabe
   * fuehren.
   */
  async function retryOnDefect(defectHint: string | null): Promise<void> {
    if (defectHint) {
      const retried = parseGeneratorResult(
        (
          await callBrainAgent({
            role: 'generator',
            payload: {
              conceptName: concept.name,
              conceptDescription: concept.description,
              depth: args.depth,
              format: args.format,
              difficulty: concept.difficulty,
              sourceExcerpt: args.sourceExcerpt,
              /*
               * Der Fehlerbezug der Person bleibt stehen; der Formmangel geht ueber
               * `rejectionHint` zurueck. Bis dieses Feld existierte, wurde der Mangel in
               * `lastErrorHint` gelegt und verdraengte dort den Fehler der Person — der
               * Neuversuch verlor damit genau die Zuspitzung, wegen der die Aufgabe in Echtzeit
               * erzeugt wird (I8).
               */
              lastErrorHint: args.lastErrorHint ?? null,
              rejectionHint: defectHint,
              formatBrief: spec.brief,
            },
          })
        ).data,
      )
      if (retried) {
        generated = retried
      }
    }
  }

  /*
   * Effektives Format dieser Aufgabe. Bleibt normalerweise `args.format` — weicht nur ab, wenn
   * Schicht 1 unten eine Falschauslieferung deterministisch umtauft. `args.format` selbst bleibt
   * unangetastet: ein etwaiger naechster Versuch (siehe `outcome.status === 'retry'` unten) soll
   * wieder das vom Planer entschiedene Format anfragen, nicht das hier reparierte.
   */
  let effectiveFormat: TaskFormat = args.format

  /*
   * Schicht 1: harte, deterministische Korrektur fuer das konkret beobachtete Symptom bei
   * multipleChoice — der Generator schreibt trotz Anweisung ("GENAU EINEN Begriff") eine
   * Zuordnung, erkennbar an derselben Kennzeichnung ("A) ... B) ... C) ..." gefolgt von
   * "1) ... 2) ... 3) ...") wie beim Format `matching` selbst. Findet `extractMatchPairsFromPrompt`
   * dieses Muster im Prompt, ist das kein Verdacht mehr, sondern ein Beweis: eine echte
   * Auswahlfrage nach EINEM Begriff braucht diese Kennzeichnung nie. Kein Modellaufruf noetig —
   * dieselben, bereits erzeugten Begriffe/Beschreibungen werden nur als das behandelt, was sie
   * sind. `options` faellt weg, sonst haelt der Kontrolleur die Aufgabe gleich wieder faelschlich
   * fuer eine Auswahlfrage (`options` ist dort das alleinige Erkennungsmerkmal, siehe
   * `agents/prompts.ts`, Rolle Kontrolleur).
   */
  const misissuedMatch = args.format === 'multipleChoice' ? extractMatchPairsFromPrompt(generated.prompt) : null
  if (misissuedMatch) {
    effectiveFormat = 'matching'
    generated = {
      ...generated,
      options: [],
      matchTerms: misissuedMatch.terms,
      matchDescriptions: misissuedMatch.descriptions,
    }
  } else {
    /*
     * Schicht 2, nur wenn Schicht 1 nichts fand: alle Formmaengel dieser Ausgabe auf einmal.
     *
     * Gesammelt statt nacheinander geprueft, weil `retryOnDefect` bewusst nur EINEN Zusatzaufruf
     * kennt — findet man zwei Maengel und meldet nur den ersten, kaeme der zweite nie zur Sprache.
     * Der Fragetext-Mangel gilt fuer jedes Format, die beiden anderen nur fuer ihres.
     */
    const hints = [
      promptDefectHint(generated),
      args.format === 'multipleChoice' ? multipleChoiceDefectHint(generated) : null,
      args.format === 'matching' ? matchingDefectHint(generated) : null,
    ].filter((hint): hint is string => hint !== null)
    await retryOnDefect(hints.length > 0 ? hints.join(' ') : null)
  }
  /*
   * Musterloesung und Optionsreihenfolge einer Auswahlfrage festzurren.
   *
   * Zwei Dinge in einem Schritt, weil beide dieselbe Positionsangabe brauchen:
   *
   *  1. Musterloesung kanonisieren — steht fest, WELCHE Option richtig ist, wird `expectedAnswer`
   *     auf deren woertlichen Text gesetzt. Damit vergleichen Kontrolleur (Gegenloesen) und
   *     Pruefer spaeter denselben Text, den auch die Oberflaeche anzeigt, statt einer freien
   *     Formulierung, die zufaellig damit uebereinstimmen muesste. Widersprechen sich Index und
   *     Musterloesung (`mismatch`, nach dem Neuversuch oben immer noch), wird NICHTS ersetzt: die
   *     Formulierung des Generators bleibt stehen, und es entscheidet wie zuvor der Kontrolleur.
   *     Lieber der alte, unscharfe Textvergleich als eine stillschweigend falsche Musterloesung.
   *
   *  2. Optionen mischen — siehe `permuteOptionsDeterministically`. Ohne das steht die richtige
   *     Option ueberdurchschnittlich oft an erster Stelle, und die Aufgabe waere ohne Lesen
   *     loesbar. Der Streuwert stammt aus Konzept und Aufgabentext, nicht aus Zufall: dieselbe
   *     Aufgabe ergibt zweimal dieselbe Reihenfolge (I11).
   */
  if (effectiveFormat === 'multipleChoice' && generated.options.length > 0) {
    const resolution = resolveCorrectOption(generated)
    const permuted = permuteOptionsDeterministically(
      generated.options,
      resolution.kind === 'index' ? resolution.index : null,
      `${concept.id}|${generated.prompt}`,
    )
    generated = {
      ...generated,
      options: permuted.options,
      ...(permuted.correctIndex !== null ? { expectedAnswer: permuted.options[permuted.correctIndex] } : {}),
    }
  }

  /*
   * Nachlese-Fallback: haelt der Generator die Pflichtfelder nicht ein (siehe `agents/prompts.ts`,
   * Abschnitt "matching"), aus dem Aufgabentext selbst gewinnen statt bei der Fliesstext-Anzeige
   * zu bleiben. Nur ein zweiter Blick auf denselben Text, den der Kontrolleur gleich prueft — keine
   * neue Behauptung, siehe `extractMatchPairsFromPrompt`.
   */
  const matchFallback =
    args.format === 'matching' && (generated.matchTerms.length === 0 || generated.matchDescriptions.length === 0)
      ? extractMatchPairsFromPrompt(generated.prompt)
      : null

  const task: GeneratedTask = {
    conceptId: concept.id,
    format: effectiveFormat,
    depth: args.depth,
    difficulty: concept.difficulty,
    prompt: generated.prompt,
    expectedAnswer: generated.expectedAnswer,
    sourceGrounding: generated.sourceGrounding,
    reason: args.reason,
    ...(generated.options.length > 0 ? { options: generated.options } : {}),
    /*
     * Rein additiv fuer die Oberflaeche (siehe `GeneratedTask.matchTerms`). Kontrolleur und
     * Pruefer bekommen weiterhin nur `prompt`/`expectedAnswer`/`options` wie zuvor — diese
     * Felder wandern an ihnen vorbei direkt in die Aufgabe.
     */
    ...(generated.matchTerms.length > 0
      ? { matchTerms: generated.matchTerms }
      : matchFallback
        ? { matchTerms: matchFallback.terms }
        : {}),
    ...(generated.matchDescriptions.length > 0
      ? { matchDescriptions: generated.matchDescriptions }
      : matchFallback
        ? { matchDescriptions: matchFallback.descriptions }
        : {}),
    // Nur gesetzt, wenn die Antwort NICHT aus dem Material stammt — siehe `answerProvenance`.
    ...(args.answerProvenance ? { answerProvenance: args.answerProvenance } : {}),
  }

  const sourceCheck = parseSourceCheckResult(
    (
      await callBrainAgent({
        role: 'kontrolleur',
        /*
         * Faellt der Quellenabgleich als Schutz weg, ist die Modellguete der einzige verbliebene.
         * Dann soll auch das staerkere Modell pruefen (Kapitel 5.3).
         */
        escalate: args.answerProvenance === 'model',
        payload: {
          mode: 'source_check',
          taskPrompt: task.prompt,
          expectedAnswer: task.expectedAnswer,
          sourceExcerpt: args.sourceExcerpt,
          /*
           * Beim Durchlauf aus dem Fachwissen ist bereits geklaert, dass der Auszug die Antwort
           * nicht enthaelt — auf Deckung zu pruefen hiesse, dieselbe Ablehnung ein zweites Mal zu
           * erzeugen. Beim Web-Durchlauf bleibt es bewusst bei `coverage`: die Suchergebnisse
           * stehen dann im Auszug, also ist Deckung wieder pruefbar und wird auch verlangt.
           */
          ...(args.answerProvenance === 'model' ? { standard: 'consistency' as const } : {}),
          /*
           * Derselbe Grund wie beim Gegenloesen weiter unten: `options` ist ein getrenntes Feld
           * fuer die Schaltflaechen der Oberflaeche und steht nie im Fragetext selbst. Verweist
           * eine Auswahlfrage im Text auf „folgende Aussagen", ohne dass der Kontrolleur die
           * Optionen kennt, kann er unmoeglich beurteilen, ob die Musterloesung eindeutig
           * bestimmbar ist — und lehnt eine inhaltlich einwandfreie Aufgabe allein deshalb ab.
           */
          ...(task.options && task.options.length > 0 ? { options: task.options } : {}),
        },
      })
    ).data,
  )

  /*
   * Das Dossier stellt die Frage, beantwortet sie aber nicht (Kapitel 3, erweitert um I4 auf der
   * Aufgabenebene — siehe `GeneratedTask.answerProvenance`).
   *
   * Das ist KEIN Abbruchgrund. Ein Arbeitsheft ist Themenquelle, nicht Wahrheitsquelle: die Frage
   * darin ist genau das, was gekonnt werden muss. Bricht das Gehirn hier ab, kann die Person den
   * groessten Teil ihres Dossiers nie ueben.
   *
   * Zwei Wege, in dieser Reihenfolge, weil der erste belegbar bleibt und der zweite nicht:
   *  1. Websuche — die Ergebnisse wandern in den Auszug, damit gilt wieder der normale
   *     Deckungsmassstab. Die Antwort ist dann belegt, nur eben nicht durch das Dossier.
   *  2. Fachwissen des Modells — geprueft auf Richtigkeit, Widerspruchsfreiheit und Passung zur
   *     Frage (`standard: 'consistency'`), auf dem staerkeren Modell.
   * Beide Wege kennzeichnen die Aufgabe; die Oberflaeche zeigt es an.
   *
   * Die Grenze bleibt scharf: dieser Zweig oeffnet sich nur, wenn der Kontrolleur den Auszug
   * ausdruecklich als „stellt die Frage, ohne sie zu beantworten" beurteilt hat. Ein Konzept ohne
   * jeden Materialbezug faellt weiterhin durch — das Gehirn erfindet sich keinen Lehrplan.
   */
  if (!sourceCheck.sourceAligned && sourceCheck.posesQuestionOnly && args.answerProvenance !== 'model') {
    if (args.answerProvenance !== 'web' && args.searchWeb) {
      // Die Frage des Dossiers ist die Suchanfrage — nicht die erzeugte Aufgabe, die ja gerade
      // verworfen wird. Fehlschlag und leeres Ergebnis sind gleichwertig: es geht ohne Suche weiter.
      const webContext = await args.searchWeb(`${concept.name} ${concept.description}`.trim()).catch(() => '')
      if (webContext.trim().length > 0) {
        return generateClearedTask({
          ...args,
          sourceExcerpt: `${args.sourceExcerpt}

Recherche (nicht aus deinem Material):
${webContext}`,
          answerProvenance: 'web',
        })
      }
    }
    return generateClearedTask({ ...args, answerProvenance: 'model' })
  }

  let counterAnswer: string | null = null
  if (requiresCounterSolve(effectiveFormat)) {
    const counter = parseCounterSolveResult(
      (
        await callBrainAgent({
          role: 'kontrolleur',
          payload: {
            mode: 'counter_solve',
            // Ohne Musterloesung — das ist der ganze Sinn des Gegenloesens (Kapitel 7.2).
            taskPrompt: task.prompt,
            /*
             * Bei einer Auswahlfrage steht der Fragestamm in `prompt`, die Antwortmoeglichkeiten
             * aber getrennt in `options` — dieses Feld existiert nur fuer die Schaltflaechen der
             * Oberflaeche. Ohne es hier mitzugeben, saehe der Kontrolleur eine Frage ohne
             * Antwortmoeglichkeiten und koennte sie gar nicht in der erwarteten Form beantworten:
             * das Gegenloesen scheiterte dann unabhaengig davon, ob die Aufgabe richtig war.
             */
            ...(task.options && task.options.length > 0 ? { options: task.options } : {}),
          },
        })
      ).data,
      task.options?.length ?? 0,
    )
    /*
     * Bei einer Auswahlfrage liefert der Kontrolleur idealerweise einen strukturellen Index
     * (`selectedOptionIndex`) statt einer Positionsnummer in Prosa: `task.options[index]` ist
     * exakt derselbe Text, aus dem oben auch `task.expectedAnswer` berechnet wurde, ein exakter
     * Stringvergleich in `answersAgree` genuegt dann — keine Umformulierung kann mehr dazwischen-
     * funken. Liefert der Kontrolleur trotzdem nur Prosa in `answer` (kein gueltiger Index),
     * Fallback auf die bisherige Positionsnummer-in-Text-Aufloesung.
     */
    counterAnswer =
      effectiveFormat === 'multipleChoice' && counter.selectedOptionIndex !== null && task.options
        ? task.options[counter.selectedOptionIndex]
        : resolveCounterSolveAnswer(counter.answer, task.options)
  }

  const verdict = buildControlVerdict({
    task,
    sourceAligned: sourceCheck.sourceAligned,
    // Der eigentliche Grund des Kontrolleurs — ohne ihn sieht die abgebrochene Aufgabe nur den
    // generischen Satz „laesst sich nicht verankern" und nie, WELCHE Behauptung fehlte.
    sourceIssues: sourceCheck.issues,
    counterAnswer,
    materialInsufficient: sourceCheck.materialInsufficient,
  })
  const outcome = decideProduction({ task, verdict, attempt })

  if (outcome.status === 'ready') {
    // Torwaechter (I5). Wirft, wenn etwas durchgerutscht ist — kein stiller Durchlauf.
    assertTaskCleared(task, verdict)
    return task
  }
  if (outcome.status === 'retry') {
    /*
     * Der Befund des Kontrolleurs geht mit in den naechsten Versuch — siehe `buildRejectionHint`.
     * Ohne ihn waeren die `MAX_GENERATION_ATTEMPTS` Versuche drei identische Anfragen mit drei
     * identischen Ablehnungen; der Kontrolleur hat den Mangel ja bereits genau benannt.
     *
     * `?? args.rejectionHint`: bleibt ausnahmsweise kein verwertbarer Befund uebrig, gilt weiter
     * der des vorigen Versuchs, statt den Generator wieder ins Blinde zu schicken.
     */
    return generateClearedTask({
      ...args,
      attempt: outcome.attempt,
      rejectionHint: buildRejectionHint(outcome.issues) ?? args.rejectionHint ?? null,
    })
  }
  throw new Error(
    `Zu „${concept.name}" liess sich keine belegbare Aufgabe erzeugen: ${outcome.issues.join(' ')}`,
  )
}
