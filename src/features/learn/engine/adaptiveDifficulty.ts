/**
 * Echtzeit-Schwierigkeit (Schicht 4, Entscheidung 4).
 *
 * Reine, deterministische Funktionen, die die Karten-Reihenfolge eines Uebungs-Sets an den aktuellen
 * Wissensstand des Lernenden anpassen: schwache Konzepte zuerst (Remediation), danach ein Anstieg der
 * Schwierigkeit (leicht → schwer). `nextDifficultyTarget` liefert zusaetzlich das laufende Schwierigkeits-
 * Ziel aus den letzten Antworten (fuer Echtzeit-Auswahl der naechsten Karte).
 *
 * Kein DOM/I/O — voll unit-testbar.
 */

export type MasteryBandRank = 0 | 1 | 2 | 3

/** Band-Rang analog conceptConditioning: schwach(0) < neu(1) < mittel(2) < beherrscht(3). */
export function masteryBandRank(mastery: number | null): MasteryBandRank {
  if (mastery === null) return 1
  if (mastery < 0.3) return 0
  if (mastery < 0.7) return 2
  return 3
}

/**
 * Laufendes Schwierigkeits-Ziel (1..5) aus den letzten Antworten: eine Serie richtiger Antworten hebt
 * das Ziel an, Fehler senken es. `base` ist der Startwert (Default 3).
 */
export function nextDifficultyTarget(recentCorrect: boolean[], base = 3): number {
  // Nur die letzten 4 Antworten gewichten (Echtzeit-Charakter).
  const window = recentCorrect.slice(-4)
  const delta = window.reduce((acc, correct) => acc + (correct ? 1 : -1), 0)
  return Math.max(1, Math.min(5, base + delta))
}

/** Karte, deren Anordnung sich aus Schwierigkeit (1..5) + Konzept-Mastery (0..1|null) ergibt. */
export type OrderableCard = {
  difficulty: number
  mastery: number | null
}

/**
 * Deterministische adaptive Deck-Reihenfolge: primaer nach Mastery-Band (schwach zuerst → Remediation),
 * sekundaer nach Schwierigkeit aufsteigend (leicht → schwer als Anstieg), stabil bei Gleichstand.
 * Reine Umsortierung — keine Karte wird entfernt.
 */
export function adaptiveDeckOrder<T>(cards: readonly T[], read: (card: T) => OrderableCard): T[] {
  return cards
    .map((card, index) => ({ card, index, meta: read(card) }))
    .sort((a, b) => {
      const ra = masteryBandRank(a.meta.mastery)
      const rb = masteryBandRank(b.meta.mastery)
      if (ra !== rb) {
        return ra - rb
      }
      if (a.meta.difficulty !== b.meta.difficulty) {
        return a.meta.difficulty - b.meta.difficulty
      }
      return a.index - b.index
    })
    .map((entry) => entry.card)
}
