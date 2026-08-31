/**
 * Schicht 5 — Vorproduktion um eine Aufgabe versetzt (Kapitel 7.1, urspruengliche Fassung).
 *
 * HISTORISCH: `useBrainSession.ts` verwendet dieses Modul nicht (und hat es nie verwendet —
 * es entstand als eigene, reine Ablaufsteuerung, wurde aber im Hook durch eine einfachere
 * Ad-hoc-Logik ersetzt). Seit der Entscheidung, Pfad-Sitzungen vollstaendig im Voraus zu
 * erzeugen (siehe Kopfkommentar von `hooks/useBrainSession.ts` und Dokumentation
 * `06-stand-und-offenes.md`, Abweichung „Vollstaendige Vorproduktion einer Sitzung"), ist der
 * hier beschriebene Ablauf — EIN Element versetzt vorproduzieren, mit Staleness-Pruefung ueber
 * `basisFingerprint` — fuer den Pfad ueberholt. Die Datei bleibt stehen, weil ihre Bausteine
 * (Fingerabdruck, Staleness-Test) fachlich sauber und getestet sind und fuer eine kuenftige
 * Rueckkehr zu versetzter Vorproduktion (etwa bei sehr langen Sitzungen, wo volle Vorproduktion
 * zu viele gleichzeitige Modellaufrufe waere) wiederverwendbar bleiben.
 *
 * Erzeugungszeitpunkt war urspruenglich ECHTZEIT: nur in Echtzeit erzeugtes Material kennt den
 * Moment — es weiss, dass der Nutzer vor zwei Minuten genau diesen Fehler gemacht hat.
 * Vorratsproduktion waere schneller und pruefbarer, aber blind fuer die aktuelle Lage.
 *
 * Die Latenzloesung: das Gehirn erzeugt die NAECHSTE Aufgabe, waehrend der Nutzer an der
 * aktuellen sitzt. Formal bleibt es Echtzeit, weil alle Signale bis zur letzten Sekunde
 * einfliessen; der Nutzer wartet nie. Nur das allererste Element einer Sitzung hat
 * unvermeidbare Wartezeit.
 *
 * Diese Datei ist die Ablaufsteuerung dieser Versetzung — ohne Netzwerk, ohne Timer, ohne DOM.
 * Sie beschreibt, WANN vorproduziert wird und WANN eine Vorproduktion verworfen werden muss.
 *
 * Abgrenzung zum Wiederholungsstapel: fuer ihn gilt seit Version 1.1 eine benannte Ausnahme —
 * dort wird ein Vorrat vorgehalten statt versetzt vorproduziert (`production/reviewStock.ts`).
 * Der Unterschied ist nicht graduell: hier entsteht jede Aufgabe aus der aktuellen Lage und
 * wird verworfen, sobald diese sich aendert; dort ueberlebt eine Abfrage mehrere Durchgaenge.
 * Diese Datei ist fuer den PFAD zustaendig, und dort bleibt es bei Echtzeit.
 */

import type { GeneratedTask, PlannedTask } from '../types'

/**
 * Ein vorproduziertes Element mit der Lage, aus der heraus es entstand.
 *
 * Der `basisFingerprint` ist der Grund, warum diese Struktur ueberhaupt existiert: eine
 * Vorproduktion, die aus einer inzwischen ueberholten Lage stammt, waere Vorratsproduktion mit
 * Extraschritten. Der Abgleich verwirft sie, statt sie auszuliefern.
 */
export type PrefetchedTask = {
  planned: PlannedTask
  task: GeneratedTask
  basisFingerprint: string
  producedAt: string
}

/**
 * Fingerabdruck der Entscheidungsgrundlage.
 *
 * Bewusst grob: er soll erkennen, ob sich die AUSWAHL geaendert haette, nicht ob sich irgendein
 * Wert um ein Tausendstel verschoben hat. Enthalten sind das gewaehlte Konzept, die Tiefe, das
 * Format und die Anzahl der seither eingelaufenen Beobachtungen.
 */
export function fingerprintOf(planned: PlannedTask, evidenceCount: number): string {
  return [planned.conceptId, planned.depth, planned.format, planned.claim, evidenceCount].join('|')
}

/**
 * Ist die Vorproduktion noch gueltig?
 *
 * Ungueltig wird sie, sobald eine neue Beobachtung eingelaufen ist, die die Auswahl veraendert
 * haette — genau der Fall, fuer den Echtzeit gegenueber Vorrat gewaehlt wurde. Eine
 * Vorproduktion aus der Lage vor dem letzten Fehler weiterzuverwenden, waere derselbe Fehler in
 * klein.
 */
export function prefetchIsStale(prefetched: PrefetchedTask, currentFingerprint: string): boolean {
  return prefetched.basisFingerprint !== currentFingerprint
}

/** Zustand der Vorproduktionsschleife einer Sitzung. */
export type PrefetchState = {
  /** Was der Nutzer gerade vor sich hat. */
  current: PrefetchedTask | null
  /** Was im Hintergrund entsteht oder fertig bereitliegt. */
  upcoming: PrefetchedTask | null
  /** Laeuft gerade eine Produktion? Verhindert doppelte Auftraege. */
  producing: boolean
  /** Anzahl bisher ausgelieferter Aufgaben — das erste Element wartet, alle weiteren nicht. */
  delivered: number
}

export function initialPrefetchState(): PrefetchState {
  return { current: null, upcoming: null, producing: false, delivered: 0 }
}

export type PrefetchDecision =
  /** Der Nutzer wartet: das allererste Element muss synchron erzeugt werden. */
  | { action: 'produceBlocking' }
  /** Fertiges Element ausliefern und im Hintergrund das naechste anstossen. */
  | { action: 'deliverAndPrefetch'; deliver: PrefetchedTask }
  /** Vorproduktion ist ueberholt — verwerfen und neu erzeugen, waehrend der Nutzer wartet. */
  | { action: 'discardAndProduceBlocking'; discarded: PrefetchedTask }
  /** Produktion laeuft bereits; abwarten. */
  | { action: 'wait' }

/**
 * Entscheiden, was beim Anfordern der naechsten Aufgabe geschieht.
 *
 * Die vier Faelle decken den gesamten Ablauf ab. Der dritte ist der teure und deshalb der
 * wichtige: er tritt genau dann ein, wenn die Vorproduktion ihren Zweck verfehlt hat, und er
 * ist der Preis dafuer, dass das Material den Moment kennt.
 */
export function nextPrefetchDecision(args: {
  state: PrefetchState
  currentFingerprint: string
}): PrefetchDecision {
  const { state, currentFingerprint } = args

  if (state.upcoming) {
    if (prefetchIsStale(state.upcoming, currentFingerprint)) {
      return { action: 'discardAndProduceBlocking', discarded: state.upcoming }
    }
    return { action: 'deliverAndPrefetch', deliver: state.upcoming }
  }

  if (state.producing) {
    return { action: 'wait' }
  }

  return { action: 'produceBlocking' }
}

/** Nach der Auslieferung: das gelieferte Element wird zum aktuellen, die Vorproduktion ist leer. */
export function afterDelivery(state: PrefetchState, delivered: PrefetchedTask): PrefetchState {
  return {
    current: delivered,
    upcoming: null,
    producing: true,
    delivered: state.delivered + 1,
  }
}

/** Nach einer abgeschlossenen Hintergrundproduktion. */
export function afterProduction(state: PrefetchState, produced: PrefetchedTask | null): PrefetchState {
  return { ...state, upcoming: produced, producing: false }
}

/**
 * Wartet der Nutzer gerade sichtbar?
 *
 * Nur beim allerersten Element einer Sitzung soll die Oberflaeche eine Wartezeit zeigen. Taucht
 * sie spaeter auf, ist die Vorproduktion nicht hinterhergekommen — das ist ein Befund, kein
 * Normalzustand, und die Oberflaeche darf das anders behandeln.
 */
export function waitIsExpected(state: PrefetchState): boolean {
  return state.delivered === 0
}
