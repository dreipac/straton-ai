/**
 * Schicht 4 — Zustaendigkeitsgrenze zwischen Wiederholung und Pfad (Kapitel 6.7).
 *
 * „Der Planer speist zwei getrennte Oberflaechen. Die Grenze verlaeuft nach AUSLOESER, nicht
 *  nach Inhalt."
 *
 * |                  | Wiederholung                          | Pfad                             |
 * |------------------|---------------------------------------|----------------------------------|
 * | Ausloeser        | Verfall                               | Fehler und Luecken               |
 * | Inhalt           | was beherrscht wurde und verloren geht| was noch nicht beherrscht wird   |
 * | Anwendungstiefe  | Erkennen                              | alle Stufen                      |
 * | Charakter        | kurz, mechanisch                      | Erklaerung, Ursachensuche, Einschuebe |
 *
 * Warum das eine eigene Datei ist und nicht ein paar Bedingungen im Planer: die Grenze wird an
 * drei Stellen gebraucht — beim Fuellen des Stapels, beim Einmischen der Mindestreserve in die
 * Sitzung (I9) und beim Zurueckbefoerdern nach einer verpatzten Wiederholung. Drei Kopien
 * derselben Bedingung laufen auseinander, und der Fehler waere unangenehm still: ein Konzept
 * taucht in beiden Oberflaechen auf oder in keiner.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { ApplicationDepth, LearnerConceptImage } from '../types'
import { CONSOLIDATED_MASTERY, effectiveMastery } from '../memory/learnerImage'

export { CONSOLIDATED_MASTERY }

/**
 * Untergrenze, ab der ein Konzept den Stapel wieder verlaesst.
 *
 * Kapitel 6.7: „Eine verpatzte Wiederholung senkt die Beherrschung und kann ein Konzept zurueck
 * in den Pfad befoerdern." Unterhalb dieses Werts ist Auffrischen nicht mehr die richtige
 * Antwort — dort fehlt etwas, und Fehlendes wird aufgebaut, nicht aufgefrischt.
 *
 * Zwei Schwellen statt einer, und das ist der Punkt: aufgenommen wird bei 0.7, entlassen erst
 * unter 0.45. Mit nur einer Schwelle wuerde eine mittelmaessige Antwort ein Konzept zwischen den
 * beiden Oberflaechen hin- und herschieben — heute im Stapel, morgen im Pfad, uebermorgen wieder
 * im Stapel. Das waere fuer den Nutzer nicht als System erkennbar, sondern als Zufall.
 *
 * Gemessen wird am GESPEICHERTEN Wert, nicht am verfallenen: Verfall ist der Grund, warum etwas
 * im Stapel liegt, und darf es nicht daraus entfernen. Nur neue Evidenz kann ein Konzept
 * zurueck in den Pfad befoerdern — genau so steht es in 6.7.
 */
export const FALLS_BACK_TO_PATH_MASTERY = 0.45

/**
 * Unterhalb dieser Sicherheit gilt eine hohe Beherrschung als unbelegt.
 *
 * Solche Konzepte gehoeren in den Pfad, nicht in den Stapel: der Stapel frischt auf, was belegt
 * ist. Hier ist erst zu klaeren, ob der Wert ueberhaupt stimmt — und das ist Ursachensuche.
 */
export const UNVERIFIED_CONFIDENCE = 0.3

/** Wem ein Konzept zum Zeitpunkt `nowIso` zufaellt. */
export type Responsibility = 'review' | 'path' | 'idle'

export type ResponsibilityVerdict = {
  conceptId: string
  responsibility: Responsibility
  /** Der Ausloeser, nicht der Inhalt — das ist die Grenze aus 6.7. */
  trigger: 'decay' | 'error' | 'gap' | 'none'
  /** In einem Satz zeigbar (Grundlage fuer die Grundangabe in der Stapeluebersicht). */
  reason: string
}

/**
 * Ist dieses Konzept ueberhaupt wiederholbar?
 *
 * Drei Bedingungen, jede aus einer Folgerung in 6.7:
 *  1. Es gab direkte Evidenz — sonst wurde es nie gelernt und kann nicht verfallen.
 *  2. Es war einmal gefestigt — dasselbe Argument, nur ueber den Wert statt ueber die Zaehlung.
 *  3. Es ist nicht unter die Rueckfallgrenze gerutscht — dann fehlt etwas, und Fehlendes gehoert
 *     in den Pfad.
 */
export function isReviewEligible(image: LearnerConceptImage): boolean {
  if (image.directEvidenceCount === 0) {
    return false
  }
  return image.everConsolidated && image.mastery >= FALLS_BACK_TO_PATH_MASTERY
}

/**
 * War das Konzept schon einmal gefestigt?
 *
 * Liest das persistierte Flag statt den aktuellen Wert. Der Unterschied entscheidet den Fall,
 * um den es in 6.7 eigentlich geht: ein Konzept, das seit sieben Wochen liegt, ist verblasst —
 * aber es wurde beherrscht. Aus dem aktuellen Wert abgeleitet fiele es aus beiden Oberflaechen:
 * aus dem Stapel, weil es zu tief steht, und aus dem Pfad, weil dort nichts schiefging.
 */
export function wasEverConsolidated(image: LearnerConceptImage): boolean {
  return image.everConsolidated
}

/**
 * Muss dieses Konzept auf einer Stufe ueber „Erkennen" aufgefrischt werden?
 *
 * Kapitel 6.7: „Ein Konzept, das auf Anwenden- oder Uebertragen-Ebene aufgefrischt werden muss,
 * gehoert in den Pfad — die Wiederholung ist auf Erkennen ausgelegt."
 *
 * Der Stapel fragt mechanisch ab; eine Transferaufgabe zwischen siebzehn Kurzabfragen waere
 * weder kurz noch mechanisch und bekaeme auch keine Erklaerung dazu.
 */
export function needsDeeperRefresh(image: LearnerConceptImage): boolean {
  return image.depth !== 'recognize' && image.mastery < CONSOLIDATED_MASTERY
}

/** Die Anwendungstiefe, auf der der Stapel arbeitet. Immer dieselbe (Kapitel 6.7). */
export const REVIEW_STACK_DEPTH: ApplicationDepth = 'recognize'

/**
 * Zustaendigkeit eines Konzepts bestimmen.
 *
 * Die Reihenfolge der Pruefungen ist die Aussage: **Fehler schlagen Verfall.** Kapitel 6.7 sagt
 * „Fehler landen nie in der Wiederholung. Ein Fehler zeigt, dass etwas fehlt; Fehlendes wird
 * aufgebaut, nicht aufgefrischt." Ein Konzept, das markiert UND faellig ist, gehoert deshalb in
 * den Pfad — dort bekommt es die Ursachensuche, die der Stapel nicht leisten kann.
 */
export function responsibilityFor(image: LearnerConceptImage, nowIso: string): ResponsibilityVerdict {

  // 1 — Fehler und Verdacht: immer der Pfad.
  if (image.reviewNeeded) {
    return {
      conceptId: image.conceptId,
      responsibility: 'path',
      trigger: 'error',
      reason: image.reviewReason.trim().length > 0 ? image.reviewReason : 'Hier hat etwas nicht gestimmt.',
    }
  }

  // 2 — Luecke: nie gelernt, durch neue Evidenz zu tief gefallen, oder unbelegte Hoehe.
  if (image.directEvidenceCount === 0) {
    return {
      conceptId: image.conceptId,
      responsibility: 'path',
      trigger: 'gap',
      reason: 'Dazu gibt es noch nichts — das kommt im Pfad.',
    }
  }
  if (!isReviewEligible(image)) {
    return {
      conceptId: image.conceptId,
      responsibility: 'path',
      trigger: 'gap',
      reason: 'Das sitzt noch nicht fest genug zum Auffrischen — es wird aufgebaut.',
    }
  }
  if (needsDeeperRefresh(image)) {
    return {
      conceptId: image.conceptId,
      responsibility: 'path',
      trigger: 'gap',
      reason: 'Das muss ueber das Wiedererkennen hinaus aufgefrischt werden — dafuer ist der Pfad da.',
    }
  }
  /*
   * Unbelegte Hoehe: ein hoher Wert, der auf fast nichts beruht (Kapitel 4.2).
   *
   * Beide Werte gespeichert statt gealtert. Die Frage lautet „worauf beruht diese Einschaetzung",
   * und die Antwort aendert sich nicht dadurch, dass Zeit vergeht. Mit den gealterten Werten
   * wuerde jedes lange liegende Konzept irgendwann als unbelegt gelten und aus dem Stapel
   * fallen — dieselbe Falle wie bei der Beherrschung, nur eine Zeile weiter.
   */
  if (image.mastery >= CONSOLIDATED_MASTERY && image.confidence < UNVERIFIED_CONFIDENCE) {
    return {
      conceptId: image.conceptId,
      responsibility: 'path',
      trigger: 'gap',
      reason: 'Der Wert steht hoch, ist aber kaum belegt — das pruefe ich im Pfad nach.',
    }
  }

  // 3 — Verfall: der Stapel.
  if (isDue(image, nowIso)) {
    return {
      conceptId: image.conceptId,
      responsibility: 'review',
      trigger: 'decay',
      reason: describeDueReason(image, nowIso),
    }
  }

  return {
    conceptId: image.conceptId,
    responsibility: 'idle',
    trigger: 'none',
    reason: 'Sitzt und ist nicht faellig.',
  }
}

const MS_PER_DAY = 86_400_000

function daysBetweenIso(fromIso: string | null, toIso: string): number {
  if (!fromIso) {
    return 0
  }
  const from = new Date(fromIso).getTime()
  const to = new Date(toIso).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return 0
  }
  return (to - from) / MS_PER_DAY
}

/** Faellig im Sinne des Stapels: das Wiederholungsdatum ist erreicht. */
export function isDue(image: LearnerConceptImage, nowIso: string): boolean {
  if (!image.nextReviewAt) {
    return false
  }
  const due = new Date(image.nextReviewAt).getTime()
  const now = new Date(nowIso).getTime()
  return Number.isFinite(due) && Number.isFinite(now) && due <= now
}

/**
 * Der Faelligkeitsgrund im Klartext (UI-Spezifikation 5.2).
 *
 * Drei Formen, weil sie drei verschiedene Dinge sagen: lange nicht angefasst, gleich faellig,
 * planmaessig. Eine einzige Formulierung fuer alle drei waere kuerzer und weniger wert — der
 * Grund ist genau die Information, die einen Stapel vom Kartenstapel unterscheidet.
 */
export function describeDueReason(image: LearnerConceptImage, nowIso: string): string {
  const untouched = Math.floor(daysBetweenIso(image.lastSeenAt, nowIso))
  if (untouched >= 14) {
    return `${untouched} Tage nicht angefasst`
  }

  const daysUntilDue = image.nextReviewAt ? daysBetweenIso(nowIso, image.nextReviewAt) : 0
  if (daysUntilDue > 0) {
    const rounded = Math.max(1, Math.round(daysUntilDue))
    return `verfaellt in ${rounded} ${rounded === 1 ? 'Tag' : 'Tagen'}`
  }

  return 'planmaessige Auffrischung'
}

export type ReviewQueueEntry = {
  conceptId: string
  reason: string
  /** Wie weit die verfallene Beherrschung unter der Festigungsschwelle liegt, 0..1. */
  slippage: number
  nextReviewAt: string | null
}

/**
 * Der Wiederholungsstapel (UI-Spezifikation 5.2).
 *
 * Enthaelt ausschliesslich Konzepte, deren Ausloeser der Verfall ist. Sortiert nach Abrutschen,
 * damit das am staerksten Verblasste zuerst kommt; bei Gleichstand entscheidet die Id, damit die
 * Liste zweimal dieselbe ist (I11 gilt auch hier — der Stapel ist eine Planerausgabe).
 */
export function buildReviewQueue(
  images: Iterable<LearnerConceptImage>,
  nowIso: string,
): ReviewQueueEntry[] {
  const queue: ReviewQueueEntry[] = []
  for (const image of images) {
    const verdict = responsibilityFor(image, nowIso)
    if (verdict.responsibility !== 'review') {
      continue
    }
    const mastery = effectiveMastery(image, nowIso)
    queue.push({
      conceptId: image.conceptId,
      reason: verdict.reason,
      slippage: Math.max(0, CONSOLIDATED_MASTERY - mastery) / CONSOLIDATED_MASTERY,
      nextReviewAt: image.nextReviewAt,
    })
  }

  return queue.sort((a, b) =>
    b.slippage !== a.slippage ? b.slippage - a.slippage : a.conceptId < b.conceptId ? -1 : 1,
  )
}

/**
 * Ist ein Konzept nach einer verpatzten Wiederholung in den Pfad zurueckgerutscht?
 *
 * Kapitel 6.7, „Uebergaenge in beide Richtungen". Der Vergleich laeuft ueber die Zustaende vor
 * und nach der Antwort, nicht ueber die Antwort selbst: entscheidend ist nicht, dass jemand
 * falsch lag, sondern dass das Konzept dadurch unter die Grenze gefallen ist. Ein einzelner
 * Fehler bei 0.9 gehoert weiterhin in den Stapel.
 */
export function slippedBackToPath(before: LearnerConceptImage, after: LearnerConceptImage): boolean {
  return isReviewEligible(before) && !isReviewEligible(after)
}

/**
 * Zaehlung fuer die Tab-Anzeige (UI-Spezifikation 5.7).
 *
 * Gezaehlt werden KONZEPTE, nicht Abfragen: „17 Lernkarten" suggeriert 17 existierende Objekte,
 * tatsaechlich sind es abgeleitete Pruefpunkte. Eine Zahl, die ohne Nutzerhandlung springt,
 * wirkt kaputt — die Konzeptzahl tut das nicht.
 */
export function dueConceptCount(images: Iterable<LearnerConceptImage>, nowIso: string): number {
  return buildReviewQueue(images, nowIso).length
}
