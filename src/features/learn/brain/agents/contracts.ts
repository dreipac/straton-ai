/**
 * Ein- und Ausgabevertraege der sechs Modellrollen.
 *
 * Jede Rolle hat einen Auftrag (was hineingeht) und ein Ergebnis (was herauskommt). Die Parser
 * hier sind die Grenze zwischen Modellausgabe und Gehirn: ab hier gelten die Typen, davor gilt
 * nichts.
 *
 * Warum das streng ist: alles, was ein Modell liefert, kann falsch sein. Ein halb gefuelltes
 * Konzept ohne Herkunft wuerde Invariante I4 brechen, eine erfundene Zuversicht wuerde die
 * Eskalation aus Kapitel 5.3 aushebeln. Die Parser werfen solche Antworten weg, statt sie mit
 * Standardwerten aufzufuellen — ein stillschweigend ergaenztes Feld ist schlimmer als eine
 * abgelehnte Antwort, weil es aussieht wie ein Befund.
 *
 * Rein — kein DOM, kein I/O.
 */

import type {
  ApplicationDepth,
  ConceptOrigin,
  ErrorCauseKind,
  ExaminerVerdict,
  TaskFormat,
} from '../types'
import { parseExaminerVerdict } from '../perception/examiner'

function asString(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Ein 0-basierter Index in eine Optionsliste — strukturelle Alternative zu Freitext, der eine
 * Option woertlich wiederholen oder zeichengenau referenzieren muesste (siehe `GeneratorResult`
 * .correctOptionIndex und `CounterSolveResult.selectedOptionIndex`). Ausserhalb des gueltigen
 * Bereichs oder keine Ganzzahl: `null`, nie ein geratener Wert — ein falscher Index waere
 * schlimmer als ein fehlender, weil er wie ein Befund aussieht.
 */
function asOptionIndex(value: unknown, optionsCount: number): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 && n < optionsCount ? n : null
}

/**
 * JSON aus einer Modellantwort schaelen.
 *
 * Modelle liefern trotz klarer Anweisung gelegentlich Codeblock-Zaeune oder einen Satz davor.
 * Das ist kein Grund, die Antwort zu verwerfen — der Inhalt kann korrekt sein. Umschliessende
 * Zaeune und Vor-/Nachtext werden deshalb entfernt, alles Weitere bleibt streng.
 */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim()
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  try {
    return JSON.parse(withoutFence)
  } catch {
    // Erster { bis letzter } — faengt vorangestellte Erklaersaetze ab.
    const start = withoutFence.indexOf('{')
    const end = withoutFence.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(withoutFence.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

// ---------------------------------------------------------------------------
// Kartograf
// ---------------------------------------------------------------------------

export type CartographerRequest = {
  /** Der Materialauszug, aus dem kartiert wird. */
  material: string
  /** Bereits vorhandene Konzept-Slugs, damit keine Doppelungen entstehen. */
  existingSlugs: string[]
  documentName: string
}

export type CartographerConcept = {
  slug: string
  name: string
  description: string
  difficulty: number
  origin: ConceptOrigin
  sourceQuote: string
  section: string
}

export type CartographerResult = {
  concepts: CartographerConcept[]
  edges: { from: string; to: string }[]
  /** Konzepte, die verworfen wurden, mit Grund — fuer die Diagnose der kritischsten Rolle. */
  rejected: { slug: string; reason: string }[]
}

function parseOrigin(value: unknown): ConceptOrigin | null {
  if (value === 'material') return 'material'
  if (value === 'ai_supplement' || value === 'aiSupplement') return 'aiSupplement'
  if (value === 'user') return 'user'
  return null
}

/**
 * Kartografenausgabe pruefen.
 *
 * Verworfen wird ein Konzept, dem die Herkunft fehlt oder das sich als `material` ausgibt, ohne
 * einen Beleg zu nennen. Beides waere ein Bruch von Invariante I4 — und I4 ist der Grund, warum
 * ein Nutzer vor einer Pruefung ueberhaupt unterscheiden kann, was aus seinem Stoff stammt.
 * Kanten auf unbekannte Slugs fallen ebenfalls weg, sonst entstuenden Verweise ins Leere.
 */
export function parseCartographerResult(raw: unknown): CartographerResult {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const concepts: CartographerConcept[] = []
  const rejected: { slug: string; reason: string }[] = []

  const rawConcepts = Array.isArray(source.concepts) ? source.concepts : []
  for (const entry of rawConcepts) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const c = entry as Record<string, unknown>
    const slug = asString(c.slug, 120)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
    const name = asString(c.name, 160)
    if (!slug || !name) {
      rejected.push({ slug: slug || '(ohne slug)', reason: 'Slug oder Name fehlt.' })
      continue
    }

    const origin = parseOrigin(c.origin)
    if (!origin) {
      rejected.push({ slug, reason: 'Herkunftsmarkierung fehlt (Invariante I4).' })
      continue
    }

    const sourceQuote = asString(c.sourceQuote, 600)
    if (origin === 'material' && sourceQuote.length === 0) {
      rejected.push({ slug, reason: 'Als Material markiert, aber ohne Beleg aus dem Quelltext (Invariante I4).' })
      continue
    }

    concepts.push({
      slug,
      name,
      description: asString(c.description, 800),
      difficulty: Math.max(1, Math.min(5, Math.round(asNumber(c.difficulty, 3)))),
      origin,
      sourceQuote,
      section: asString(c.section, 200),
    })
  }

  const known = new Set(concepts.map((concept) => concept.slug))
  const edges: { from: string; to: string }[] = []
  const rawEdges = Array.isArray(source.edges) ? source.edges : []
  for (const entry of rawEdges) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const e = entry as Record<string, unknown>
    const from = asString(e.from, 120)
    const to = asString(e.to, 120)
    if (from && to && from !== to && known.has(from) && known.has(to)) {
      edges.push({ from, to })
    }
  }

  return { concepts, edges, rejected }
}

// ---------------------------------------------------------------------------
// Aufbereiter
// ---------------------------------------------------------------------------

/**
 * Welche Art von Punkt im Arbeitsheft steht.
 *
 * Die Unterscheidung ist der ganze Zweck der Rolle. Ein Arbeitsheft mischt drei Dinge, die im
 * Layout gleich aussehen und fuer das Lernen voellig Verschiedenes bedeuten — und bis es diese
 * Rolle gab, wurden alle drei gleich behandelt. Daraus entstand unter anderem eine Zuordnung, die
 * Personengruppen den OFFENEN FRAGEN des Dossiers zuordnete statt Definitionen: formal einwandfrei
 * im Material verankert, inhaltlich wertlos.
 */
export type WorkbookItemKind = 'wissensfrage' | 'arbeitsauftrag' | 'reflexion'

/** Woher die Antwort auf eine Wissensfrage stammt. Entspricht I4 auf der Ebene des Lehrstoffs. */
export type DerivedAnswerSource = 'material' | 'web' | 'model'

export type WorkbookItem = {
  kind: WorkbookItemKind
  /** Die Frage in der Formulierung des Aufbereiters, ohne Aufgabennummer. */
  question: string
  /** Nur bei `wissensfrage` belegt. */
  answer: string
  /** Nur bei `wissensfrage` belegt. */
  answerSource: DerivedAnswerSource | null
  /**
   * Der Aufbereiter ist sich unsicher. Nicht dasselbe wie „falsch": Raten und Wissen sehen im
   * fertigen Text gleich aus, und nur das Modell selbst kann den Unterschied melden. Steuert die
   * Websuche und die Anzeige.
   */
  needsResearch: boolean
  /** Bei `arbeitsauftrag`: das lernbare Thema dahinter, falls es eines gibt. */
  topic: string
  /** Woertliche Stelle im Abschnitt, hoechstens ein Satz. */
  sourceQuote: string
}

export type AufbereiterRequest = {
  /** Der Abschnitt aus dem Material. */
  materialChunk: string
  /** Name der Datei — hilft beim Landesbezug („Steuern_Schweiz.pdf"). */
  materialName: string
  /** Rechercheergebnisse, falls ein voriger Durchgang Unsicherheit gemeldet hat. */
  webContext: string | null
}

export type AufbereiterResult = {
  items: WorkbookItem[]
}

function parseWorkbookItemKind(value: unknown): WorkbookItemKind | null {
  if (value === 'wissensfrage' || value === 'arbeitsauftrag' || value === 'reflexion') {
    return value
  }
  return null
}

function parseDerivedAnswerSource(value: unknown): DerivedAnswerSource | null {
  if (value === 'material' || value === 'web' || value === 'model') {
    return value
  }
  return null
}

/**
 * Aufbereiterausgabe pruefen.
 *
 * Zwei Verwerfungsgruende, beide unnachgiebig:
 *
 *  - Eine Wissensfrage OHNE Antwort ist keine. Sie wuerde als leeres Konzept weiterlaufen und
 *    spaeter eine Aufgabe ohne Musterloesung erzeugen.
 *  - Eine Wissensfrage ohne `answerSource` verletzt I4 auf der Ebene des Lehrstoffs. Die Person
 *    wird an IHREM Material geprueft; ob ein Satz von dort stammt oder vom Modell ergaenzt wurde,
 *    ist der Unterschied zwischen einer Lernhilfe und einer Behauptung. Ein unmarkierter Satz ist
 *    schlimmer als ein fehlender, weil er sich nicht mehr als Ergaenzung zu erkennen gibt.
 *
 * Was NICHT geprueft wird: ob die Einordnung stimmt. Ob „Wie stellen Sie sich Ihr Zusammenleben
 * vor?" wirklich eine Reflexion ist, kann nur ein Modell beurteilen — ein Parser sieht dieselbe
 * Zeichenkette wie bei einer Wissensfrage. Diese Grenze zu kennen ist wichtiger, als sie mit
 * Stichwortlisten zu verwischen.
 */
export function parseAufbereiterResult(raw: unknown): AufbereiterResult {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const rawItems = Array.isArray(source.items) ? source.items : []
  const items: WorkbookItem[] = []

  for (const entry of rawItems) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const item = entry as Record<string, unknown>
    const kind = parseWorkbookItemKind(item.kind)
    const question = asString(item.question, 400)
    if (!kind || !question) {
      continue
    }

    const answer = asString(item.answer, 2000)
    const answerSource = parseDerivedAnswerSource(item.answerSource)

    if (kind === 'wissensfrage' && (!answer || !answerSource)) {
      continue
    }

    items.push({
      kind,
      question,
      answer: kind === 'wissensfrage' ? answer : '',
      answerSource: kind === 'wissensfrage' ? answerSource : null,
      needsResearch: item.needsResearch === true,
      topic: asString(item.topic, 200),
      sourceQuote: asString(item.sourceQuote, 600),
    })
  }

  return { items }
}

// ---------------------------------------------------------------------------
// Pruefer
// ---------------------------------------------------------------------------

export type ExaminerRequest = {
  conceptName: string
  taskPrompt: string
  expectedAnswer: string
  userAnswer: string
  subject: string
  depth: ApplicationDepth
}

export function parseExaminerResult(raw: unknown, subject: string): ExaminerVerdict {
  return parseExaminerVerdict(raw, subject)
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export type GeneratorRequest = {
  conceptName: string
  conceptDescription: string
  depth: ApplicationDepth
  format: TaskFormat
  difficulty: number
  /** Auszug aus dem Quellmaterial — die Aufgabe muss sich daraus beantworten lassen (I5). */
  sourceExcerpt: string
  /**
   * Der letzte Fehler zu diesem Konzept. Genau das ist der Grund fuer Echtzeit statt Vorrat:
   * die Aufgabe weiss, dass die Person vor zwei Minuten diesen Fehler gemacht hat.
   */
  lastErrorHint: string | null
  /**
   * Warum der VORIGE Erzeugungsversuch zu diesem Konzept verworfen wurde — der Befund des
   * Kontrolleurs, siehe `buildRejectionHint`. `null` beim ersten Versuch.
   *
   * Bewusst ein eigenes Feld neben `lastErrorHint`, obwohl beide "Hinweis" heissen: der eine
   * nennt einen Fehler der lernenden PERSON, an dem die Aufgabe ansetzen soll, der andere einen
   * Mangel der EIGENEN letzten Ausgabe, den sie beheben muss. In ein gemeinsames Feld gelegt,
   * ginge beim Wiederholungsversuch jedes Mal der Fehlerbezug der Person verloren (I8).
   */
  rejectionHint: string | null
  formatBrief: string
}

export type GeneratorResult = {
  prompt: string
  expectedAnswer: string
  sourceGrounding: string
  options: string[]
  /**
   * Nur bei `multipleChoice` belegt: 0-basierter Index der richtigen Option in `options`. Die
   * massgebliche Angabe, welche Option richtig ist — `generateTask.ts` berechnet daraus
   * `expectedAnswer` neu, statt der freien Formulierung des Generators zu vertrauen (die
   * gelegentlich ein Verweis wie "die erste Option ist richtig" statt der Option selbst ist).
   * `null`, wenn das Feld fehlt oder ausserhalb von `options` liegt.
   */
  correctOptionIndex: number | null
  /** Nur bei `matching` belegt — siehe `GeneratedTask.matchTerms`. Sonst leer. */
  matchTerms: string[]
  /** Nur bei `matching` belegt — siehe `GeneratedTask.matchDescriptions`. Sonst leer. */
  matchDescriptions: string[]
}

function asStringArray(value: unknown, maxItems: number, maxLen: number): string[] {
  return Array.isArray(value)
    ? value.map((entry) => asString(entry, maxLen)).filter((entry) => entry.length > 0).slice(0, maxItems)
    : []
}

export function parseGeneratorResult(raw: unknown): GeneratorResult | null {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const prompt = asString(source.prompt, 2000)
  const expectedAnswer = asString(source.expectedAnswer, 2000)
  if (!prompt || !expectedAnswer) {
    return null
  }
  const options = asStringArray(source.options, 6, 300)
  return {
    prompt,
    expectedAnswer,
    sourceGrounding: asString(source.sourceGrounding, 800),
    options,
    correctOptionIndex: asOptionIndex(source.correctOptionIndex, options.length),
    matchTerms: asStringArray(source.matchTerms, 5, 200),
    matchDescriptions: asStringArray(source.matchDescriptions, 5, 400),
  }
}

// ---------------------------------------------------------------------------
// Generator — Erklaertexte (Kapitel 7.3)
// ---------------------------------------------------------------------------

export type ExplanationGeneratorRequest = {
  conceptName: string
  conceptDescription: string
  slot: 'intro' | 'feedback' | 'dontKnow'
  /** Umfangsanweisung aus `production/explanations.ts` — der Generator ufert sonst aus. */
  scope: string
  minSentences: number
  maxSentences: number
  sourceExcerpt: string
  /** Nur bei `feedback` und `dontKnow` belegt. */
  attempt?: { answer: string; credit: number; cause: string | null }
}

export type ExplanationGeneratorResult = {
  text: string
  solutionPath: string
  sourceGrounding: string
}

/**
 * Erklaertext des Generators lesen.
 *
 * Verworfen wird ein Text ohne Herkunftsmarkierung. Das ist strenger als bei Aufgaben, wo eine
 * fehlende Angabe nur den Quellenabgleich scheitern laesst — und der Grund steht in 7.3: „Ein
 * halluzinierter Erklaertext ist gefaehrlicher als eine halluzinierte Aufgabe, weil der Nutzer
 * ihn ungeprueft uebernimmt."
 */
export function parseExplanationGeneratorResult(raw: unknown): ExplanationGeneratorResult | null {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const text = asString(source.text, 4000)
  const sourceGrounding = asString(source.sourceGrounding, 800)
  if (!text || !sourceGrounding) {
    return null
  }
  return { text, solutionPath: asString(source.solutionPath, 4000), sourceGrounding }
}

// ---------------------------------------------------------------------------
// Kontrolleur
// ---------------------------------------------------------------------------

export type ControllerRequest =
  | {
      mode: 'source_check'
      taskPrompt: string
      expectedAnswer: string
      sourceExcerpt: string
      /** Antwortoptionen einer Auswahlaufgabe, falls vorhanden — siehe `counter_solve` unten. */
      options?: string[]
      /**
       * Welcher Massstab gilt (siehe Rollenauftrag, Modus `source_check`).
       *
       * `coverage` (Vorgabe): die Antwort muss sich aus dem Auszug BELEGEN lassen — der Normalfall
       * und die woertliche Lesart von I5.
       *
       * `consistency`: nur dort, wo der Kontrolleur zuvor selbst festgestellt hat, dass der Auszug
       * die Frage stellt, ohne sie zu beantworten (`posesQuestionOnly`). Ein Dossier ist dann
       * Themenquelle statt Wahrheitsquelle: geprueft wird auf fachliche Richtigkeit,
       * Widerspruchsfreiheit und Passung zur gestellten Frage. Die Aufgabe traegt danach
       * `answerProvenance` und wird dem Nutzer als nicht belegt gekennzeichnet.
       */
      standard?: 'coverage' | 'consistency'
    }
  /** Ohne Musterloesung — sonst bestaetigt der Kontrolleur sie bloss (Kapitel 7.2). */
  | {
      mode: 'counter_solve'
      taskPrompt: string
      /**
       * Die Antwortoptionen einer Auswahlaufgabe (`GeneratedTask.options`), falls vorhanden.
       *
       * Ohne sie kann der Kontrolleur eine Auswahlfrage nicht sinnvoll gegenloesen: `taskPrompt`
       * enthaelt nur den Fragestamm, die Optionen sind ein getrenntes Feld fuer die
       * Schaltflaechen der Oberflaeche. Fehlt dieses Feld hier, sieht der Kontrolleur eine Frage
       * ohne Antwortmoeglichkeiten und kann sie unmoeglich in der erwarteten Form beantworten —
       * das Gegenloesen scheitert dann unabhaengig davon, ob die Aufgabe richtig war.
       */
      options?: string[]
    }
  /**
   * Erklaertext gegen die Quelle pruefen (Kapitel 7.3, neu in 1.1).
   *
   * Eigener Modus statt `source_check` mit anderem Inhalt: gefragt ist hier nicht „laesst sich
   * das beantworten", sondern „steht jeder Satz so im Auszug". Ein Erklaertext kann vollstaendig
   * beantwortbar und trotzdem an zwei Stellen erfunden sein.
   */
  | {
      mode: 'explanation_check'
      explanationText: string
      sourceExcerpt: string
    }

export type SourceCheckResult = {
  sourceAligned: boolean
  issues: string[]
  /** Siehe `ControlVerdict.materialInsufficient` (`types.ts`) — nur bei `sourceAligned: false` gesetzt. */
  materialInsufficient: boolean
  /**
   * Der Auszug stellt die Frage, ohne sie zu beantworten (Dossier, Arbeitsheft).
   *
   * Abzugrenzen von `materialInsufficient`: dort fehlt das Thema, hier fehlt nur die Antwort. Das
   * Konzept ist legitim und pruefungsrelevant — `generateTask.ts` beschafft die Antwort dann per
   * Websuche oder, wenn das nicht gelingt, aus dem Fachwissen des Modells, und kennzeichnet sie.
   */
  posesQuestionOnly: boolean
}

/** Ergebnis des Erklaertext-Abgleichs (I5 fuer Erklaerungen). */
export type ExplanationCheckResult = {
  sourceAligned: boolean
  /** Einzeln benannte Behauptungen, die im Auszug nicht vorkommen. */
  unsupportedClaims: string[]
  issues: string[]
}
export type CounterSolveResult = {
  answer: string
  /**
   * Nur bei einer Auswahlfrage (`options` im Auftrag mitgegeben) belegt: 0-basierter Index der
   * vom Kontrolleur gewaehlten Option — strukturell statt `answer` als Positionsnummer-Text zu
   * parsen (siehe `resolveCounterSolveAnswer`). `null`, wenn nicht mitgegeben oder ungueltig.
   */
  selectedOptionIndex: number | null
  issues: string[]
}

function parseIssues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((issue) => asString(issue, 300)).filter((issue) => issue.length > 0).slice(0, 8)
}

export function parseSourceCheckResult(raw: unknown): SourceCheckResult {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    // Fehlt die Angabe, gilt die Aufgabe als NICHT verankert. Eine fehlende Freigabe ist keine
    // Freigabe — I5 laesst hier keinen wohlwollenden Standardwert zu.
    sourceAligned: source.sourceAligned === true,
    issues: parseIssues(source.issues),
    // Fehlt die Angabe, gilt konservativ false — ein Versuch mehr statt einer verpassten Chance.
    // Nur ein zusaetzlicher Modellaufruf, nie eine falsche Ablehnung: siehe `decideProduction`.
    materialInsufficient: source.materialInsufficient === true,
    // Ebenfalls konservativ: ohne ausdrueckliche Angabe bleibt es beim strengen Deckungsmassstab.
    posesQuestionOnly: source.posesQuestionOnly === true,
  }
}

/**
 * Erklaertext-Abgleich lesen.
 *
 * Dieselbe Strenge wie beim Aufgabenabgleich: eine fehlende Freigabe ist keine Freigabe. Zusaetzlich
 * gilt ein Text mit ungedeckten Behauptungen auch dann als nicht verankert, wenn das Modell
 * `sourceAligned: true` behauptet — die Aufzaehlung widerlegt die Zusammenfassung.
 */
export function parseExplanationCheckResult(raw: unknown): ExplanationCheckResult {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const unsupportedClaims = Array.isArray(source.unsupportedClaims)
    ? source.unsupportedClaims.map((claim) => asString(claim, 300)).filter((claim) => claim.length > 0).slice(0, 8)
    : []

  return {
    sourceAligned: source.sourceAligned === true && unsupportedClaims.length === 0,
    unsupportedClaims,
    issues: parseIssues(source.issues),
  }
}

/**
 * @param optionsCount Groesse von `options` im Auftrag, damit `selectedOptionIndex` nur im
 * gueltigen Bereich akzeptiert wird. 0 (Vorgabe) bei einem Auftrag ohne `options` — dort ist ein
 * Index ohnehin nicht auswertbar und bleibt immer `null`.
 */
export function parseCounterSolveResult(raw: unknown, optionsCount = 0): CounterSolveResult {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    answer: asString(source.answer, 1000),
    selectedOptionIndex: asOptionIndex(source.selectedOptionIndex, optionsCount),
    issues: parseIssues(source.issues),
  }
}

// ---------------------------------------------------------------------------
// Konsolidierer
// ---------------------------------------------------------------------------

export type ConsolidatorRequest = {
  observations: {
    id: string
    conceptId: string
    conceptName: string
    kind: ErrorCauseKind
    object: string
    rawDescription: string
    subject: string
    occurredAt: string
  }[]
  existingPatternNames: string[]
  concepts: { id: string; name: string }[]
}

export type ConsolidatorResult = {
  patterns: { name: string; kind: ErrorCauseKind; object: string; observationIds: string[] }[]
  proposals: {
    operation: 'merge_concepts' | 'split_concept'
    payload: Record<string, unknown>
    question: string
    rationale: string
    evidence: Record<string, unknown>
  }[]
}

const CAUSE_KINDS: readonly string[] = ['confused', 'omitted', 'misapplied', 'overlooked']

export function parseConsolidatorResult(raw: unknown): ConsolidatorResult {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const patterns: ConsolidatorResult['patterns'] = []
  for (const entry of Array.isArray(source.patterns) ? source.patterns : []) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const p = entry as Record<string, unknown>
    const name = asString(p.name, 120)
    const kind = asString(p.kind, 40)
    if (!name || !CAUSE_KINDS.includes(kind)) {
      continue
    }
    patterns.push({
      name,
      kind: kind as ErrorCauseKind,
      object: asString(p.object, 160),
      observationIds: Array.isArray(p.observationIds)
        ? p.observationIds.map((id) => asString(id, 64)).filter(Boolean)
        : [],
    })
  }

  const proposals: ConsolidatorResult['proposals'] = []
  for (const entry of Array.isArray(source.proposals) ? source.proposals : []) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const p = entry as Record<string, unknown>
    const operation = asString(p.operation, 40)
    if (operation !== 'merge_concepts' && operation !== 'split_concept') {
      continue
    }
    const question = asString(p.question, 300)
    // Eine Verschmelzung ohne Frage ist nach Invariante I6 nicht bestaetigungsfaehig und
    // damit nicht verwendbar.
    if (operation === 'merge_concepts' && question.length === 0) {
      continue
    }
    proposals.push({
      operation,
      payload: (p.payload && typeof p.payload === 'object' ? p.payload : {}) as Record<string, unknown>,
      question,
      rationale: asString(p.rationale, 600),
      evidence: (p.evidence && typeof p.evidence === 'object' ? p.evidence : {}) as Record<string, unknown>,
    })
  }

  return { patterns, proposals }
}

// ---------------------------------------------------------------------------
// Erklaerer
// ---------------------------------------------------------------------------

export type ExplainerRequest = {
  /** Der deterministisch erzeugte Satz. Das Modell formuliert ihn um, mehr nicht. */
  draft: string
  conceptName: string
}

export function parseExplainerResult(raw: unknown): string | null {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const sentence = asString(source.sentence, 300)
  return sentence.length > 0 ? sentence : null
}
