/**
 * Straton Gehirn — gemeinsame Datentypen.
 *
 * Referenz: `straton-gehirn-architektur.md`. Jeder Typ hier hat eine Entsprechung im Dokument;
 * die Kapitelnummer steht jeweils dabei.
 *
 * Diese Datei enthaelt ausschliesslich Typen und Konstanten — keine Logik, kein DOM, kein I/O.
 * Die Feldnamen spiegeln die Tabellen aus den Migrationen `20260818120000_learn_brain_memory.sql`,
 * `…121000_learn_brain_perception_planner.sql` und `…122000_learn_brain_consolidation.sql`
 * in camelCase.
 */

// ---------------------------------------------------------------------------
// Schicht 2 — Gedaechtnis
// ---------------------------------------------------------------------------

/**
 * Herkunft eines Wissensatoms (Invariante I4).
 *
 * Ohne Quelle keine Pruefbarkeit: ein Schueler wird an seinem Skript gemessen, nicht am
 * Weltwissen. `aiSupplement` muss in der Oberflaeche unterscheidbar bleiben.
 *
 * `unknown` ist ein reiner ALTBESTANDSWERT und kein vierter regulaerer Fall. Er steht auf
 * Konzepten, die angelegt wurden, bevor die Herkunft erzwungen wurde — ihre Herkunft ist
 * nachtraeglich nicht rekonstruierbar. Sie ungefragt als `material` zu fuehren waere die
 * eigentliche I4-Verletzung: eine behauptete Quelle ohne Beleg ist schlimmer als ein
 * eingestandenes Nichtwissen. Der Kartograf kann diesen Wert nicht erzeugen (der Vertrag in
 * `agents/contracts.ts` verwirft ihn), und die Datenbank laesst ihn nur fuer Bestandszeilen zu.
 */
export type ConceptOrigin = 'material' | 'aiSupplement' | 'user' | 'unknown'

/** Herkunft einer Voraussetzungskante. */
export type EdgeOrigin = 'cartographer' | 'consolidator' | 'user'

/**
 * Anwendungstiefe (Kapitel 4.2) — auf welcher Ebene ein Konzept sitzt.
 *
 * Die dritte Stufe entscheidet Pruefungen und wird von Karteikartensystemen nie geprueft.
 */
export type ApplicationDepth = 'recognize' | 'apply' | 'transfer'

/** Aufsteigende Ordnung der Anwendungstiefe; Index = Rang. */
export const DEPTH_ORDER: readonly ApplicationDepth[] = ['recognize', 'apply', 'transfer']

/** Rang einer Anwendungstiefe (0..2). Hoeher = tiefer verankert. */
export function depthRank(depth: ApplicationDepth): number {
  const index = DEPTH_ORDER.indexOf(depth)
  return index < 0 ? 0 : index
}

/** Rueckverweis eines Konzepts ins Originalmaterial. */
export type BrainSourceRef = {
  doc?: string
  section?: string
  pageFrom?: number
  pageTo?: number
}

/**
 * Ein Konzept im Wissensgraphen (Kapitel 4.1).
 *
 * Aufloesung ist KONZEPTEBENE, nicht Themenebene: nicht „Subnetting", sondern
 * „Subnetzmaske aus Hostanzahl ableiten". Nur so kann das Gehirn sagen, *was* die fehlenden
 * 40 Prozent sind, statt nur *dass* 40 Prozent fehlen.
 *
 * Enthaelt bewusst KEINE personenbezogenen Leistungsdaten (Invariante I10).
 */
export type BrainConcept = {
  id: string
  pathId: string
  slug: string
  name: string
  description: string
  /** 1 (leicht) .. 5 (schwer). */
  difficulty: number
  origin: ConceptOrigin
  sourceRef: BrainSourceRef
  /** Woertlicher Beleg aus dem Quelldokument, soweit vorhanden. */
  sourceQuote: string
  ordinal: number
}

/**
 * Gerichtete Voraussetzungskante: `from` ist Voraussetzung fuer `to`.
 *
 * Nur eine gerichtete Abhaengigkeit erlaubt Ursachenforschung. Eine reine Hierarchie sagt,
 * wo etwas steht, nicht warum jemand scheitert.
 */
export type BrainPrerequisiteEdge = {
  id: string
  pathId: string
  fromConceptId: string
  toConceptId: string
  origin: EdgeOrigin
}

/**
 * Das Lernerbild pro Konzept (Kapitel 4.2) — die drei Werte.
 *
 * `mastery` bewegt sich ausschliesslich durch direkte Evidenz (I1) und nie durch Chat (I2)
 * oder Propagation (I3). `confidence` ist die einzige Groesse, die Propagation und
 * Strukturumbauten bewegen duerfen.
 */
export type LearnerConceptImage = {
  conceptId: string
  /** Beherrschung 0..1 — wie gut die Person das Konzept kann. */
  mastery: number
  /** Sicherheit 0..1 — wie belastbar diese Einschaetzung ist. */
  confidence: number
  /** Hoechste durch direkte Evidenz belegte Anwendungstiefe. */
  depth: ApplicationDepth
  depthEvidence: DepthEvidence
  /** Anzahl direkter Evidenzereignisse (bewertete Aufgaben). */
  directEvidenceCount: number
  /** Summiertes Evidenzgewicht der direkten Evidenz. */
  directEvidenceWeight: number
  /**
   * Anteil der Sicherheit, der allein aus Propagation stammt (I3). Getrennt gefuehrt, damit er
   * zurueckgenommen werden kann, sobald der Zweifel durch echte Evidenz aufgeloest ist.
   */
  propagationConfidencePenalty: number
  /** Vom Planer gelesene Markierung „ueberpruefungsbeduerftig". */
  reviewNeeded: boolean
  reviewReason: string
  decayRate: number
  /** Kaltstartphase (Kapitel 9): erhoehte Lernrate, solange kaum Evidenz vorliegt. */
  coldStart: boolean
  /**
   * War dieses Konzept schon einmal gefestigt? (Kapitel 6.7)
   *
   * Eigenes Feld statt einer Ableitung aus dem aktuellen Wert, weil die Frage „war es je da"
   * vom Verfall nicht beantwortet werden darf. Ein Konzept, das seit sieben Wochen liegt, ist
   * verblasst — aber es wurde beherrscht, und genau das macht es zu einem Fall fuer die
   * Wiederholung statt fuer den Pfad. Wird nur durch direkte Evidenz gesetzt und nie
   * zurueckgenommen.
   */
  everConsolidated: boolean
  lastDirectEvidenceAt: string | null
  lastSeenAt: string | null
  nextReviewAt: string | null
}

/** Evidenzzaehler je Anwendungstiefe. */
export type DepthEvidence = Partial<Record<ApplicationDepth, { attempts: number; correct: number }>>

// ---------------------------------------------------------------------------
// Schicht 3 — Wahrnehmung
// ---------------------------------------------------------------------------

/**
 * Zugelassene Signalquellen (Kapitel 5.1). Die beiden haben sehr unterschiedliche Qualitaet
 * und werden von der Architektur unterschiedlich behandelt:
 *
 * | | gradedTask | chat |
 * |---|---|---|
 * | Menge | selten | haeufig, Hauptdatenquelle |
 * | Verlaesslichkeit | hoch | verrauscht |
 * | Darf Beherrschung erhoehen | ja | nie (I2) |
 * | Wirkt primaer auf | Beherrschung | Sicherheit, Verdachtsmarkierung |
 */
export type EvidenceSource = 'gradedTask' | 'chat'

/**
 * Fehlerursache in halbstrukturierter Form (Kapitel 5.2): *was* schiefging.
 *
 * Freiheit im Inhalt, Disziplin in der Form. Reine Prosa laesst sich spaeter nicht gruppieren,
 * eine feste Auswahlliste wuerde Fachspezifisches nie finden — deshalb feste Satzform plus
 * freies Objekt.
 */
export type ErrorCauseKind = 'confused' | 'omitted' | 'misapplied' | 'overlooked'

/** Eine Fehlerursache: was schiefging und worauf bezogen. */
export type ErrorCause = {
  kind: ErrorCauseKind
  /** Worauf bezogen — frei, z. B. „Netz- und Broadcast-Adresse". */
  object: string
  /** Rohtext des Pruefers; Grundlage der spaeteren Gruppierung, nie fuer Statistik. */
  rawDescription: string
  /** Herkunft mitschreiben (Kapitel 10, Auflage 2) — nachtraeglich nicht rekonstruierbar. */
  subject: string
}

/**
 * Die vollstaendige Ausgabe des Pruefers zu einer Antwort (Kapitel 5.2).
 *
 * Drei Dinge, nicht eines. Die Zuversicht ist die wichtigste der drei (Kapitel 5.3):
 * ein Pruefer ohne Zuversichtsangabe behauptet bei Auslegungssache genauso selbstbewusst
 * etwas wie bei einem eindeutigen Fall, und das Gehirn uebernaehme es gleich stark.
 */
export type ExaminerVerdict = {
  /** Teilpunkte 0..1 — nicht nur richtig/falsch. */
  credit: number
  /** Aufschluesselung, z. B. { approach: 1, execution: 0 }. „Rechenweg korrekt, Ergebnis falsch". */
  partialCredit: Record<string, number>
  /** Fehlerursache; null bei fehlerfreier Antwort. */
  cause: ErrorCause | null
  /** Zuversicht des Pruefers in die eigene Bewertung, 0..1. */
  confidence: number
}

/** Eine Beobachtung, wie sie in das Lernerbild einlaeuft. */
export type EvidenceEvent = {
  id?: string
  userId: string
  pathId: string
  conceptId: string
  source: EvidenceSource
  verdict: ExaminerVerdict
  depth: ApplicationDepth
  format: string
  /** 1..5 */
  difficulty: number
  evidenceWeight: number
  /** Bei niedriger Zuversicht an ein staerkeres Modell weitergereicht (Kapitel 5.3). */
  escalated: boolean
  masteryDelta: number
  confidenceDelta: number
  occurredAt: string
}

/**
 * Aussagekraeftige Chatsignale (Kapitel 5.1). Keines davon darf die Beherrschung heben (I2) —
 * Fragen stellen beweist nichts.
 */
export type ChatSignalKind =
  /** Dieselbe Frage mehrfach ueber Wochen. */
  | 'repeatedQuestion'
  /** Abbruch einer Erklaerung. */
  | 'abandonedExplanation'
  /** Fragt nach der Loesung statt nach dem Warum. */
  | 'asksForSolution'
  /** Fragt nach dem Warum — das schwaechste der Signale, senkt am wenigsten. */
  | 'asksForReason'

export type ChatSignal = {
  kind: ChatSignalKind
  conceptId: string
  /** Wie oft dieses Signal fuer dieses Konzept im Betrachtungsfenster auftrat. */
  occurrences: number
  /** Spanne in Tagen, ueber die sich die Vorkommen verteilen. */
  spanDays: number
  observedAt: string
}

// ---------------------------------------------------------------------------
// Schicht 4 — Exekutive
// ---------------------------------------------------------------------------

/**
 * Die vier konkurrierenden Ansprueche (Kapitel 6.2) plus `coldStart` fuer die adaptive Suche
 * der ersten Sitzungen (Kapitel 9).
 */
export type UrgencyClaim = 'review' | 'rootCause' | 'goal' | 'motivation' | 'coldStart'

/** Eine Dringlichkeitsmeldung eines Anspruchs fuer ein bestimmtes Konzept. */
export type UrgencySignal = {
  claim: UrgencyClaim
  conceptId: string
  /** Roh-Dringlichkeit 0..1, vor Gewichtung. */
  urgency: number
  /** Menschenlesbarer Grund, Basis fuer die Erklaerpflicht (I8). */
  reason: string
}

/**
 * Das Ziel als echtes Objekt (Kapitel 6.3). Ohne alle drei Angaben kann das Gehirn nicht
 * rueckwaerts rechnen und keine ehrliche Machbarkeitsaussage treffen.
 */
export type LearningGoal = {
  id: string
  userId: string
  pathId: string
  title: string
  /** Termin — wann. */
  dueAt: string
  /** Umfang — welche Konzepte dazugehoeren. */
  conceptIds: string[]
  /** Verfuegbare Zeit — wie viel realistisch pro Tag. */
  minutesPerDay: number
  /**
   * Anwendungstiefe, auf die der Umfang gebracht werden soll.
   *
   * Die vierte Angabe, und die einzige, die man senken kann, ohne dass etwas wegfaellt. Bei
   * knappem Termin steht hier `recognize` — erst flacher, dann weniger (siehe `planner/sprint.ts`).
   */
  targetDepth: ApplicationDepth
  status: 'active' | 'achieved' | 'expired' | 'cancelled'
}

/** Eine vom Planer getroffene Auswahl, inklusive der geforderten Begruendung (I8). */
export type PlannedTask = {
  conceptId: string
  claim: UrgencyClaim
  urgency: number
  /** Der eine Satz, der dem Nutzer zeigbar ist. */
  reason: string
  /** Alle Ansprueche zum Entscheidungszeitpunkt — fuer Debugbarkeit, nie fuer den Nutzer. */
  urgencyBreakdown: Record<string, number>
  depth: ApplicationDepth
  format: TaskFormat
  /** Wurde diese Aufgabe aus der Wiederholungs-Mindestreserve gezogen (I9)? */
  fromReviewReserve: boolean
}

// ---------------------------------------------------------------------------
// Schicht 5 — Produktion
// ---------------------------------------------------------------------------

/**
 * Produktionsformate (Kapitel 6.6, verbindliche Zuordnung).
 *
 * Genau drei Formate je Anwendungstiefe — die Liste ist der Tabelle aus Kapitel 6.6
 * entnommen und nicht erweiterbar, ohne diese Tabelle zu aendern. Der Nutzer waehlt den
 * Typ nie: „Werden nie Uebertragen-Aufgaben gestellt, bleibt die dritte Stufe im Lernerbild
 * dauerhaft leer — unabhaengig davon, wie gut der Nutzer ist."
 *
 * Welches Format wann gewaehlt wird, steht in `production/formats.ts`.
 */
export type TaskFormat =
  // Erkennen
  | 'multipleChoice'     // Auswahlfrage
  | 'shortAnswer'        // Kurzantwort
  | 'matching'           // Zuordnung
  // Anwenden
  | 'calculation'        // Rechenaufgabe mit Eingabe
  | 'procedure'          // Verfahrensaufgabe
  | 'clozeCalculation'   // Lueckenrechnung
  // Uebertragen
  | 'scenario'           // eingekleidetes Szenario ohne Nennung des Konzepts
  | 'errorHunt'          // Fehlersuche in gegebener Loesung
  | 'justification'      // Begruendungsfrage

/**
 * Evidenzstaerke eines Formats (Kapitel 6.6, dritte Spalte).
 *
 * Sie folgt der Anwendungstiefe, nicht dem einzelnen Format: was auf Uebertragen geprueft wird,
 * sagt mehr aus als dasselbe Konzept auf Erkennen. Geht als Faktor in das Evidenzgewicht ein.
 */
export type EvidenceStrength = 'medium' | 'high' | 'highest'

/** Eine erzeugte, noch ungepruefte Aufgabe. */
export type GeneratedTask = {
  conceptId: string
  format: TaskFormat
  depth: ApplicationDepth
  difficulty: number
  prompt: string
  expectedAnswer: string
  /** Nachweis, worauf im Quellmaterial die Aufgabe beruht (I5). */
  sourceGrounding: string
  /** Erklaerpflicht: warum genau diese Aufgabe jetzt kommt (I8). */
  reason: string
  /**
   * Antwortmoeglichkeiten — nur bei Auswahlformaten belegt.
   *
   * Steht am Typ und nicht in einem Zusatzfeld, weil der Kontrolleur sie mitpruefen muss: bei
   * einer Auswahlfrage entscheidet die Qualitaet der ABLENKER darueber, ob die Aufgabe etwas
   * misst. Drei offensichtlich falsche Optionen machen aus Wiedererkennen ein Ausschlussverfahren.
   */
  options?: string[]
  /**
   * Nur bei `format === 'matching'` belegt: die linke Spalte (Begriffe) fuer eine interaktive
   * Zuordnung statt eines Fliesstexts.
   *
   * Rein additiv und rein fuer die Oberflaeche (`BrainSession.tsx`) — `prompt` und
   * `expectedAnswer` tragen die Paare weiterhin vollstaendig als Text, genau wie vor dieser
   * Erweiterung. Kontrolleur und Pruefer bekommen dieselben Felder wie zuvor und bleiben
   * unveraendert; nur wer `matchTerms`/`matchDescriptions` fehlt (aeltere Aufgaben, ein
   * Modell, das die Zusatzfelder einmal ausliess), faellt in der Oberflaeche auf das
   * bisherige Freitextfeld zurueck. Torwaechter I5 prueft weiterhin ausschliesslich
   * `prompt`/`expectedAnswer`.
   */
  matchTerms?: string[]
  /** Nur bei `format === 'matching'` belegt: die rechte Spalte (Beschreibungen), siehe `matchTerms`. */
  matchDescriptions?: string[]
  /**
   * Woher die ANTWORT stammt — die Erweiterung von I4 auf die Aufgabenebene.
   *
   * Material kann zwei verschiedene Rollen haben: Wahrheitsquelle (ein Lehrbuch sagt, was richtig
   * ist) oder blosse Themenquelle (ein Dossier stellt die Fragen, die man koennen muss, ohne sie
   * zu beantworten). Bisher kannte das Gehirn nur die erste — ein Dossier-Konzept liess sich
   * deshalb nie verankern und wurde abgebrochen, obwohl es pruefungsrelevant ist.
   *
   * `undefined` oder `'material'`: aus dem Auszug belegt, der Normalfall, unveraenderte Strenge.
   * `'web'`: der Auszug stellte nur die Frage; die Antwort stammt aus einer Websuche und wurde
   * gegen deren Ergebnisse geprueft.
   * `'model'`: auch die Websuche half nicht; die Antwort stammt aus dem Fachwissen des Modells,
   * geprueft auf Richtigkeit, Widerspruchsfreiheit und Passung zur Frage des Dossiers.
   *
   * Bei `'web'` und `'model'` MUSS die Oberflaeche das anzeigen. Der Grundgedanke von I4 gilt hier
   * genauso: nicht verschweigen, sondern benennen — die Person soll wissen, was sie im Unterricht
   * gegenpruefen sollte.
   */
  answerProvenance?: 'material' | 'web' | 'model'
}

/** Befund des Kontrolleurs zu einer erzeugten Aufgabe (Kapitel 7.2). */
export type ControlVerdict = {
  /** Deckt Fehlerart 1 ab: inhaltlich falsch. */
  sourceAligned: boolean
  /** Deckt Fehlerart 3 ab: hinterlegte Musterloesung stimmt nicht. Null = nicht gegengeloest. */
  counterSolved: boolean | null
  /** Unabhaengig ermittelte Antwort des Kontrolleurs, falls gegengeloest. */
  counterAnswer: string | null
  passed: boolean
  issues: string[]
  /**
   * Nur aussagekraeftig, wenn `sourceAligned` false ist: liegt die Ablehnung an einer Materiallue-
   * cke (der zentrale Begriff kommt im Auszug gar nicht vor oder wird dort nicht definiert) statt
   * an der konkreten Formulierung DIESES Versuchs? Dann bringt keine Wiederholung mit demselben
   * Auszug etwas — `decideProduction` gibt sofort auf statt `MAX_GENERATION_ATTEMPTS` zu erschoep-
   * fen (Kapitel 6.6/7.2, I11: gleiche Lage, gleiches Ergebnis).
   */
  materialInsufficient: boolean
}

// ---------------------------------------------------------------------------
// Schicht 6 — Konsolidierung
// ---------------------------------------------------------------------------

/** Die Operationen des Konsolidierers (Kapitel 8.2). */
export type StructureOperation =
  | 'addEdge'         // umkehrbar, automatisch
  | 'removeEdge'      // umkehrbar, automatisch
  | 'splitConcept'    // teilweise umkehrbar, automatisch, mit Wertregel (8.3)
  | 'mergeConcepts'   // ZERSTOERERISCH — Nutzerbestaetigung erforderlich (I6)
  | 'promotePattern'  // umkehrbar, automatisch
  | 'mergePatterns'   // ZERSTOERERISCH — gleiche Regel (Kapitel 10)

/**
 * Die entscheidende Unterscheidung ist umkehrbar gegen zerstoererisch, nicht gross gegen klein.
 * Eine Kante laesst sich wieder entfernen. Eine Verschmelzung loescht die Unterscheidung dauerhaft.
 */
export const DESTRUCTIVE_OPERATIONS: readonly StructureOperation[] = ['mergeConcepts', 'mergePatterns']

export function isDestructive(operation: StructureOperation): boolean {
  return DESTRUCTIVE_OPERATIONS.includes(operation)
}

export type StructureProposal = {
  id?: string
  userId: string
  pathId: string
  operation: StructureOperation
  payload: Record<string, unknown>
  evidence: Record<string, unknown>
  /** In der Sprache des Nutzers, nicht in Graphensprache (Kapitel 8.2). */
  question: string
  rationale: string
  requiresConfirmation: boolean
  status: 'pending' | 'accepted' | 'rejected' | 'expired' | 'autoApplied'
  /** I7: niemals mitten im Lernen. */
  surfaceContext: 'sessionStart' | 'mapReview'
  expiresAt: string
}

/** Protokolleintrag eines tatsaechlich durchgefuehrten Umbaus (Kapitel 8.4). */
export type StructureLogEntry = {
  id?: string
  userId: string
  pathId: string
  proposalId: string | null
  operation: StructureOperation
  payload: Record<string, unknown>
  evidence: Record<string, unknown>
  /** Wie es rueckgaengig zu machen ist. Ohne diese Angabe darf der Umbau nicht stattfinden. */
  undoPayload: Record<string, unknown>
  destructive: boolean
  appliedAt: string
  revertedAt: string | null
}

/** Ein benanntes Fehlermuster (Kapitel 10). */
export type ErrorPattern = {
  id: string
  userId: string
  /** Stabil, sobald vergeben (I12). */
  name: string
  kind: ErrorCauseKind
  object: string
  /**
   * Generisch oder fachspezifisch — ergibt sich aus der mitgeschriebenen Herkunft:
   * ein Muster ueber viele unverwandte Konzepte ist generisch, eines, das sich in einer
   * Ecke des Graphen ballt, fachspezifisch.
   */
  scope: 'generic' | 'domainSpecific' | 'unknown'
  subjects: string[]
  distinctConceptCount: number
  occurrenceCount: number
  distinctDayCount: number
  /** Anzeigeschwelle erreicht: das Gehirn redet erst ueber Gewissheit. */
  surfaced: boolean
  userDisputed: boolean
  mergedIntoId: string | null
  firstSeenAt: string
  lastSeenAt: string
}

// ---------------------------------------------------------------------------
// Kapitel 11 — Pfad
// ---------------------------------------------------------------------------

/**
 * Ein Eintrag der festen Pfadreihenfolge. `position` ist eine Bruchzahl, kein Index —
 * so passt ein Einschub oder ein aufgespaltenes Konzept an seine logisch richtige Stelle.
 */
export type PathOrderEntry = {
  conceptId: string
  position: number
  kind: 'base' | 'insert'
  /** Adaptive Einschuebe muessen im Ueberblick sichtbar und begruendet sein. */
  insertReason: string
}

// ---------------------------------------------------------------------------
// Kapitel 12 — Modellrollen
// ---------------------------------------------------------------------------

/**
 * Die sechs Rollen, die ein Modell brauchen.
 *
 * Der Planer fehlt hier bewusst und dauerhaft: er ist deterministisch (Invariante I11).
 * Diese Union ist die Typebene derselben Aussage wie der Check-Constraint auf
 * `learn_brain_agent_models.role` — „Planer" ist kein moeglicher Wert, nicht bloss ein
 * unerwuenschter.
 */
export type BrainAgentRole =
  | 'kartograf'
  | 'aufbereiter'
  | 'pruefer'
  | 'generator'
  | 'kontrolleur'
  | 'konsolidierer'
  | 'erklaerer'

export type BrainModelProvider = 'openai' | 'anthropic' | 'gemini'

/** Ein Eintrag der Vermittlungsschicht: welche Rolle laeuft auf welchem Modell. */
export type BrainAgentModelBinding = {
  role: BrainAgentRole
  provider: BrainModelProvider
  model: string
  /** Kapitel 5.3: das teure Modell wird nur bei Zweifel geweckt. */
  escalationProvider: BrainModelProvider | null
  escalationModel: string | null
  maxOutputTokens: number
}
