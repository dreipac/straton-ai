/**
 * Typen des Konzept-Netzes + Lerner-Modells (neue Lernbereich-Architektur).
 *
 * Diese Typen spiegeln die normalisierten Tabellen aus
 * `supabase/migrations/20260725120000_learn_concept_engine_foundation.sql` in camelCase.
 * Die Engine-Module (bkt, forgetting, conceptGraph, masteryScoring, adaptiveEngine, reviewScheduler)
 * arbeiten ausschliesslich auf diesen reinen Datentypen — kein DOM, keine I/O.
 */

export type EdgeType = 'prerequisite' | 'related' | 'opposite'
export type CardType = 'knowledge' | 'application' | 'distinction' | 'cloze'
export type EvaluationMethod = 'exact' | 'semantic' | 'contains'
export type CardStatus = 'new' | 'learning' | 'review' | 'mastered'

/** Rueckverweis eines Konzepts ins Originalmaterial (fuer quellen-verankerte Erklaerungen). */
export type SourceRef = {
  doc?: string
  section?: string
  pageFrom?: number
  pageTo?: number
}

/** Atomare Wissenseinheit eines Lernpfads (Schicht 1). */
export type Concept = {
  id: string
  pathId: string
  /** Stabiler, normalisierter Schluessel (z. B. "vlsm-berechnung"). */
  slug: string
  name: string
  description: string
  /** 1 (leicht) .. 5 (schwer). */
  difficulty: number
  sourceRef: SourceRef
  ordinal: number
}

/** Gerichtete, typisierte Beziehung zwischen zwei Konzepten. */
export type ConceptEdge = {
  id: string
  pathId: string
  fromConceptId: string
  toConceptId: string
  type: EdgeType
}

/** Eine einzelne Beobachtung: richtig/falsch bei gegebener Schwierigkeit, mit Zeitstempel. */
export type Outcome = {
  correct: boolean
  /** 1..5 */
  difficulty: number
  /** ISO-Zeitstempel der Beobachtung. */
  at: string
  /** Optionaler Teil-Credit ∈ [0,1] (semantische Teilbewertung); fehlt → binaer aus `correct`. */
  credit?: number
}

/** BKT-Wissenszustand eines Users fuer EIN Konzept (Schicht 3, Herzstueck). */
export type LearnerConceptState = {
  conceptId: string
  /** P(Mastery) 0..1. */
  pMastery: number
  attempts: number
  correct: number
  /** Neueste zuerst, gedeckelt (~20). */
  outcomeHistory: Outcome[]
  /** Individuelle Vergessens-Rate (>= 0; 0 = kein Verfall). */
  decayRate: number
  lastSeenAt: string | null
  nextReviewAt: string | null
}

/** Generierte, konzept-getaggte Lernkarte eines Pfads (Schicht 5, Tabelle learn_cards). */
export type LearnCard = {
  id: string
  pathId: string
  /** Optionale Bindung an einen Schritt (lose, kann null sein). */
  stepId: string | null
  /** Referenzierte Konzept-IDs (>=0). */
  conceptIds: string[]
  question: string
  answer: string
  cardType: CardType
  /** 1..5 */
  difficulty: number
  expectedAnswer: string
  evaluationMethod: EvaluationMethod
}

/** SR-Zustand (SM-2-artig) einer Lernkarte fuer einen User (Schicht 4/6). */
export type LearnerCardState = {
  cardId: string
  srStage: number
  /** SM-2 Easiness-Faktor, >= 1.3. */
  easiness: number
  intervalDays: number
  status: CardStatus
  lastReviewedAt: string | null
  nextReviewAt: string | null
}
