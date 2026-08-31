/**
 * Schicht 4 — Erklaerpflicht (Invariante I8).
 *
 * „Weil gewichtet statt starr entschieden wird, ist die Auswahl von aussen nicht mehr
 *  offensichtlich. Zu jeder Aufgabe muss in einem Satz sagbar sein, warum genau sie jetzt kommt."
 *
 * Der Satz entsteht HIER, deterministisch, aus dem Anspruch und der Lage. Die Rolle „Erklaerer"
 * aus Kapitel 12 darf ihn spaeter sprachlich glaetten — aber sie darf nie die Voraussetzung
 * dafuer sein, dass es ihn gibt. Sonst haenge eine Invariante an einem Modellaufruf, der
 * langsam sein, teuer sein oder ausfallen kann; im Ausfall stuende die Aufgabe ohne Begruendung
 * da, und genau das verbietet I8.
 *
 * Rein — kein DOM, kein I/O, kein Modell (auch I11).
 */

import type { ApplicationDepth, UrgencyClaim } from '../types'
import { assertHasReason } from '../invariants'

const DEPTH_PHRASE: Record<ApplicationDepth, string> = {
  recognize: 'zum Wiedererkennen',
  apply: 'zum Anwenden',
  transfer: 'in ungewohnter Verpackung',
}

export type ExplanationContext = {
  claim: UrgencyClaim
  conceptName: string
  depth: ApplicationDepth
  /** Vorformulierter Grund aus dem Dringlichkeitssignal. */
  signalReason: string
  /** Aus der Wiederholungs-Mindestreserve gezogen (I9). */
  fromReviewReserve: boolean
  /** Tage bis zum Termin, falls ein Ziel aktiv ist. */
  daysToDeadline?: number
  /** Konzept, dessen Fehlschlag diesen Umweg ausgeloest hat. */
  triggeredBy?: string
}

/**
 * Der eine Satz.
 *
 * Bewusst ohne Fachjargon: „Voraussetzungskante", „Propagation" und „Konfidenz" kommen nicht
 * vor. Der Nutzer soll seinen eigenen Stoff wiedererkennen, nicht die Architektur.
 */
export function explainSelection(context: ExplanationContext): string {
  const name = context.conceptName.trim() || 'dieses Konzept'
  const depth = DEPTH_PHRASE[context.depth]

  /*
   * Leer vorbelegt und mit `default`-Zweig, obwohl die Union alle Faelle abdeckt: der Anspruch
   * kann aus `learn_task_log.claim` kommen und damit aus der Datenbank, wo ein aelterer oder
   * neuerer Wert stehen kann, den diese Fassung nicht kennt. Ohne Vorbelegung liefe die Funktion
   * dann in einen TypeError, statt den Guard fuer Invariante I8 ausloesen zu lassen — und ein
   * Absturz ist die schlechtere Art, eine fehlende Begruendung zu melden.
   */
  let sentence = ''
  switch (context.claim) {
    case 'review':
      sentence = context.fromReviewReserve
        ? `„${name}" ist faellig — auch im Endspurt lasse ich Wiederholung nicht ganz ausfallen.`
        : `„${name}" faengt an zu verblassen, deshalb jetzt nochmal ${depth}.`
      break
    case 'rootCause':
      sentence = context.triggeredBy
        ? `Bei „${context.triggeredBy}" hakte es — „${name}" ist die Voraussetzung dahinter, deshalb zuerst das.`
        : `„${name}" ist noch kaum belegt; damit pruefe ich, ob es wirklich sitzt.`
      break
    case 'goal':
      sentence =
        typeof context.daysToDeadline === 'number' && context.daysToDeadline <= 3
          ? `„${name}" gehoert zu deinem Termin in ${context.daysToDeadline} ${context.daysToDeadline === 1 ? 'Tag' : 'Tagen'} und sitzt noch nicht.`
          : `„${name}" gehoert zum Umfang deines Ziels und ist noch offen.`
      break
    case 'motivation':
      sentence = `Nach den letzten Aufgaben etwas, das sitzt: „${name}".`
      break
    case 'coldStart':
      sentence = `„${name}" hilft mir gerade am meisten, einzuschaetzen, wo du stehst.`
      break
    default:
      sentence = ''
      break
  }

  // Faellt eine Formulierung wider Erwarten leer aus, greift der Grund aus dem Signal.
  const result = sentence.trim().length > 0 ? sentence : context.signalReason
  assertHasReason(result, `Auswahl von "${name}"`)
  return result
}

/**
 * Der Satz vor der ersten Aufgabe einer neuen Karte (Kapitel 9, Sichtbarkeit).
 *
 * „Die adaptive Suche liegt zwangslaeufig daneben, bevor sie trifft — genau daraus gewinnt sie
 *  ihre Information. Entscheidend ist, wie der Nutzer diese Fehlgriffe deutet."
 *
 * Ohne Vorwarnung denkt er bei einer zu leichten Aufgabe: „das Ding haelt mich fuer einen
 * Anfaenger, das taugt nichts." Nach diesem Satz denkt er: „es tastet sich ran." Identisches
 * Erlebnis, voellig andere Bewertung.
 */
export const COLD_START_DISCLOSURE =
  'Die ersten Aufgaben nutze ich, um dich einzuschaetzen — sie koennen zu leicht oder zu schwer ' +
  'wirken. Danach sitzt das Niveau.'

/**
 * Begruendung eines adaptiven Einschubs im Ueberblick (Kapitel 11, Auflage).
 *
 * „Waechst der Pfad im Hintergrund, weil Umwege eingebaut werden, und die Prozentzahl faellt
 *  deshalb, wirkt das wie ein Fehler. Als markierter Einschub mit Begruendung wirkt dasselbe
 *  Ereignis wie Fuersorge."
 */
export function explainInsert(args: { conceptName: string; triggeredByName: string }): string {
  const reason = `Eingeschoben, weil „${args.triggeredByName}" ohne „${args.conceptName}" nicht sicher wird.`
  assertHasReason(reason, `Einschub von "${args.conceptName}"`)
  return reason
}

/**
 * Auftrag an die Rolle „Erklaerer" (Kapitel 12): Kuerze und Verstaendlichkeit.
 *
 * Der deterministische Satz geht als Vorlage mit. Das Modell formuliert um, erfindet aber
 * nichts hinzu — und wenn es ausfaellt, bleibt die Vorlage stehen.
 */
export function polishRequestFor(deterministicSentence: string, conceptName: string): {
  draft: string
  conceptName: string
} {
  return { draft: deterministicSentence, conceptName }
}

/**
 * Die geglaettete Fassung uebernehmen — oder eben nicht.
 *
 * Zurueckgewiesen wird, was leer, zu lang oder mehrsaetzig ist. Ein Erklaerer, der einen Absatz
 * liefert, hat seine Rolle verfehlt; dann gilt die Vorlage.
 */
export const MAX_EXPLANATION_CHARS = 180

export function acceptPolished(deterministicSentence: string, polished: string | null | undefined): string {
  const candidate = (polished ?? '').trim()
  if (candidate.length === 0 || candidate.length > MAX_EXPLANATION_CHARS) {
    return deterministicSentence
  }
  // Mehr als ein Satzende deutet auf einen Absatz statt auf den einen Satz hin.
  const sentenceEnds = candidate.match(/[.!?](\s|$)/g)?.length ?? 0
  if (sentenceEnds > 1) {
    return deterministicSentence
  }
  return candidate
}
