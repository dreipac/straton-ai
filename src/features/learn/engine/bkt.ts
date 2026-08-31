/**
 * Bayesian Knowledge Tracing (BKT) — Schicht 3.
 *
 * Kern der probabilistischen Wissensschaetzung. Statt "richtig/versuche" wird P(Mastery) bayesianisch
 * fortgeschrieben: jede Beobachtung aktualisiert die Wahrscheinlichkeit, dass der User das Konzept
 * beherrscht, moduliert durch die Schwierigkeit der Frage.
 *
 * Eigenschaften, die aus dem Modell FOLGEN (keine Sonderfaelle noetig):
 *  - Richtig bei schwerer Frage hebt staerker (niedriger Guess -> starkes Evidenz-Signal).
 *  - Falsch bei sehr schwerer Frage senkt schwaecher (hoher Slip -> schwaches Gegen-Signal).
 *  - Verlaufstrend zaehlt: 5x falsch dann 3x richtig endet hoeher als 3x richtig dann 5x falsch,
 *    weil BKT sequentiell ist und juengste Beobachtungen den aktuellen P(L) dominieren.
 */

export type BktParams = {
  /** Slip bei Schwierigkeit 1; steigt je Schwierigkeitsstufe um slipPerDifficulty. */
  slipBase: number
  slipPerDifficulty: number
  /** Guess bei Schwierigkeit 1; sinkt je Schwierigkeitsstufe um guessPerDifficulty. */
  guessBase: number
  guessPerDifficulty: number
  /** Lernwahrscheinlichkeit (Transition unbekannt -> bekannt) pro Interaktion. */
  learn: number
}

export const DEFAULT_BKT_PARAMS: BktParams = {
  slipBase: 0.05,
  slipPerDifficulty: 0.04,
  guessBase: 0.3,
  guessPerDifficulty: 0.05,
  learn: 0.12,
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function clampDifficulty(difficulty: number): number {
  if (!Number.isFinite(difficulty)) {
    return 3
  }
  return Math.max(1, Math.min(5, Math.round(difficulty)))
}

/** Slip-Wahrscheinlichkeit (Meister antwortet falsch) — steigt mit Schwierigkeit. */
export function slipFor(difficulty: number, params: BktParams = DEFAULT_BKT_PARAMS): number {
  const d = clampDifficulty(difficulty)
  return Math.max(0.02, Math.min(0.45, params.slipBase + params.slipPerDifficulty * (d - 1)))
}

/** Guess-Wahrscheinlichkeit (Nicht-Meister antwortet richtig) — sinkt mit Schwierigkeit. */
export function guessFor(difficulty: number, params: BktParams = DEFAULT_BKT_PARAMS): number {
  const d = clampDifficulty(difficulty)
  return Math.max(0.03, Math.min(0.5, params.guessBase - params.guessPerDifficulty * (d - 1)))
}

/**
 * Ein BKT-Update. `prior` = P(Mastery) vor der Beobachtung, Rueckgabe = P(Mastery) danach.
 *
 * Weiche Evidenz (Teilbewertung): ist `outcome.credit` ∈ [0,1] gesetzt, wird zwischen dem Richtig- und
 * dem Falsch-Posterior interpoliert ("Methode richtig, Rechenfehler" → Teil-Credit). `credit=1` ist
 * identisch zu `correct:true`, `credit=0` identisch zu `correct:false` — bestehendes Verhalten bleibt
 * exakt erhalten, wenn kein `credit` uebergeben wird.
 */
export function updateMastery(
  prior: number,
  outcome: { correct: boolean; difficulty: number; credit?: number },
  params: BktParams = DEFAULT_BKT_PARAMS,
): number {
  const learnedBefore = clamp01(prior)
  const slip = slipFor(outcome.difficulty, params)
  const guess = guessFor(outcome.difficulty, params)

  // Posterior P(L | richtig) und P(L | falsch) via Bayes.
  const numCorrect = learnedBefore * (1 - slip)
  const denCorrect = numCorrect + (1 - learnedBefore) * guess
  const posteriorCorrect = denCorrect > 0 ? numCorrect / denCorrect : learnedBefore

  const numIncorrect = learnedBefore * slip
  const denIncorrect = numIncorrect + (1 - learnedBefore) * (1 - guess)
  const posteriorIncorrect = denIncorrect > 0 ? numIncorrect / denIncorrect : learnedBefore

  // Teil-Credit interpoliert die beiden Posteriors (weiche Evidenz).
  const credit = typeof outcome.credit === 'number' ? clamp01(outcome.credit) : outcome.correct ? 1 : 0
  const posterior = credit * posteriorCorrect + (1 - credit) * posteriorIncorrect

  // Lern-Transition: mit Wahrscheinlichkeit `learn` wird das Konzept in dieser Interaktion gelernt.
  return clamp01(posterior + (1 - posterior) * params.learn)
}

/**
 * Initialer "kalter" Prior nur aus der Schwierigkeit (schwerer -> niedriger). Ein Graph-Boost aus
 * bereits gemeisterten Voraussetzungen/verwandten Konzepten kommt separat aus `conceptGraph`.
 */
export function seedPrior(difficulty: number): number {
  const d = clampDifficulty(difficulty)
  return clamp01(Math.max(0.1, Math.min(0.5, 0.4 - 0.05 * (d - 1))))
}

/**
 * P(Mastery) aus einer Beobachtungshistorie neu berechnen (Fold von Seed-Prior).
 * `outcomes` MUSS chronologisch (aeltestes zuerst) sein.
 */
export function computeMasteryFromHistory(
  outcomes: { correct: boolean; difficulty: number }[],
  options: { seed?: number; params?: BktParams } = {},
): number {
  const params = options.params ?? DEFAULT_BKT_PARAMS
  const seed =
    options.seed ??
    (outcomes.length > 0 ? seedPrior(outcomes[0].difficulty) : 0.3)
  return outcomes.reduce((prior, outcome) => updateMastery(prior, outcome, params), clamp01(seed))
}
