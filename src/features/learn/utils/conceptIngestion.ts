/**
 * Content-Ingestion — Schicht 1 (reine Logik).
 *
 * Verwandelt hochgeladenes Material in ein Konzept-Netz: Prompt-Builder fuer die KI, toleranter
 * JSON-Parser der Antwort und Validator. Reine Funktionen (keine I/O) — die Generierung selbst laeuft
 * ueber den bestehenden Learn-Completion-Pfad (`sendMessage` mit learn-Modus), die Persistenz ueber
 * `services/learnConceptGraph.persistence.ts`.
 */

import type { EdgeType } from '../engine/types'

export type IngestedSourceRef = {
  section?: string
  pageFrom?: number
  pageTo?: number
}

/**
 * Herkunft eines eingelesenen Konzepts (Invariante I4).
 *
 * Nur zwei Werte sind hier moeglich: was die Ingestion erzeugt, stammt entweder aus dem Material
 * oder ist eine Ergaenzung des Modells. `user` entsteht erst durch eine Handkorrektur.
 */
export type IngestedOrigin = 'material' | 'ai_supplement'

export type IngestedConcept = {
  slug: string
  name: string
  description: string
  difficulty: number
  sourceRef: IngestedSourceRef
  /** Invariante I4 — ohne Herkunft keine Pruefbarkeit. */
  origin: IngestedOrigin
  /**
   * Woertlicher Beleg aus dem Material. Pflicht bei `origin: 'material'`; der Parser stuft ein
   * Konzept ohne Beleg auf `ai_supplement` herunter, statt eine Quelle zu behaupten.
   */
  sourceQuote: string
}

export type IngestedEdge = {
  fromSlug: string
  toSlug: string
  type: EdgeType
}

export type IngestedGraph = {
  concepts: IngestedConcept[]
  edges: IngestedEdge[]
}

export const CONCEPT_INGESTION_MIN_CONCEPTS = 4
export const CONCEPT_INGESTION_MAX_CONCEPTS = 40
export const CONCEPT_INGESTION_MAX_ATTEMPTS = 2

const EDGE_TYPES: EdgeType[] = ['prerequisite', 'related', 'opposite']

/** Konzept-Slug normalisieren (z. B. "VLSM-Berechnung!" -> "vlsm-berechnung"). Stabiler Schluessel. */
export function normalizeConceptSlug(raw: string | undefined): string {
  if (!raw) {
    return ''
  }
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

function clampDifficulty(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) {
    return 3
  }
  return Math.max(1, Math.min(5, Math.round(n)))
}

function toInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) ? n : undefined
}

/** Prompt: Material -> Konzept-Netz als JSON (atomare Konzepte + typisierte Kanten + Schwierigkeit). */
export function buildConceptIngestionPrompt(args: {
  topicHint: string
  materialContext: string
  attempt: number
  validationHint: string
}): string {
  const lines = [
    `Thema (grob): ${args.topicHint || 'aus dem Material ableiten'}`,
    'Aufgabe: Zerlege den folgenden Lernstoff in ein KONZEPT-NETZ aus atomaren Wissenseinheiten.',
    'Nicht die Kapitelstruktur des Dokuments abbilden, sondern die tatsaechlichen Konzepte darin.',
    'Antwortformat: NUR valides JSON, kein Markdown, kein Fliesstext davor/danach. Schema:',
    '{"concepts":[{"slug":"kurz-mit-bindestrichen","name":"Lesbarer Name","description":"1-2 Saetze",' +
      '"difficulty":1..5,"origin":"material|ai_supplement","quote":"woertliche Stelle aus dem Material",' +
      '"source":{"section":"optionaler Abschnitt","pageFrom":int?,"pageTo":int?}}],' +
      '"edges":[{"from":"slug-a","to":"slug-b","type":"prerequisite|related|opposite"}]}',
    'Regeln:',
    `- So viele Konzepte, wie dieser Abschnitt tatsaechlich hergibt (0 bis ${CONCEPT_INGESTION_MAX_CONCEPTS}); jedes atomar ` +
      '(eine pruefbare Wissenseinheit, kein ganzes Kapitel). Es gibt KEINE Mindestzahl: ein Titelblatt, ein ' +
      'Inhaltsverzeichnis oder eine Seite ohne Substanz liefert null Konzepte. Erfinde niemals Konzepte, ' +
      'nur um auf eine Anzahl zu kommen — die uebrigen Abschnitte tragen ihre eigenen bei.',
    '- Aber nicht staerker zerlegen als noetig: mehrere Teilschritte, die praktisch immer zusammen ' +
      'vorkommen und einzeln kaum sinnvoll benennbar waeren, gehoeren zu EINEM Konzept mit einem Namen, ' +
      'der die ganze Faehigkeit trifft — nicht in mehrere Konzepte, die nie einzeln geprueft wuerden.',
    '- slug: kurz, kleingeschrieben, nur Buchstaben/Zahlen/Bindestriche, eindeutig.',
    '- difficulty: 1 (trivial) .. 5 (sehr komplex), nach Abstraktionsgrad + Anzahl Voraussetzungen.',
    '- origin: "material", wenn das Konzept im Materialauszug steht; "ai_supplement", wenn du es ergaenzt, ' +
      'weil das Material es stillschweigend voraussetzt.',
    '- quote: bei "material" die woertliche Stelle aus dem Auszug, die das Konzept belegt (max. ein Satz). ' +
      'Bei "ai_supplement" leer lassen.',
    '- Erfinde NIE einen Beleg. Ein Konzept ohne woertliche Stelle ist "ai_supplement" — das ist kein ' +
      'Makel, sondern die richtige Angabe.',
    '- Eine FRAGE im Material ist ein gueltiges Konzept. Arbeitshefte und Dossiers stellen Fragen, ohne sie ' +
      'zu beantworten — genau das ist der Lernstoff. Benenne das Konzept nach dem THEMA der Frage, nie als ' +
      'Frage: "Steuerpflicht von Minderjaehrigen", nicht "Sind Minderjaehrige steuerpflichtig?". Als quote ' +
      'gilt dann die Frage selbst.',
    '- name: der Begriff, den das Material selbst verwendet — keine Verallgemeinerung, kein Oberbegriff, keine ' +
      'Umformulierung. Steht dort "Steuereinnahmen", heisst das Konzept "Steuereinnahmen" und nicht ' +
      '"Staatseinnahmen". Ein Konzept, dessen Name im eigenen Beleg nicht vorkommt, laesst sich spaeter nicht ' +
      'wiederfinden.',
    '- Die Konzepte muessen sich gegenseitig ausschliessen. Ein Oberbegriff und etwas, das darunter faellt, ' +
      'gehoeren nie beide in die Liste ("Bundesfinanzen" neben "Einnahmequellen des Bundes" neben "Steuern und ' +
      'Abgaben" ist dreimal dasselbe Thema in unterschiedlicher Weite). Entscheide dich fuer die Ebene, auf der ' +
      'sich einzeln pruefen laesst.',
    '- edges.type: "prerequisite" (from ist Voraussetzung fuer to), "related" (verwandt), "opposite" (oft verwechselt).',
    '- from/to MUESSEN existierende slugs sein; keine Selbstkanten (from == to).',
    '- Voraussetzungs-Kanten so setzen, dass eine sinnvolle Lernreihenfolge entsteht (kein Zyklus).',
    args.attempt > 1
      ? 'WICHTIG: Der vorige Versuch war ungueltig. Gib ausschliesslich valides JSON exakt nach Schema zurueck.'
      : '',
    args.validationHint ? `Ungueltigkeitsgrund im Vorversuch: ${args.validationHint}` : '',
    'Materialauszuege:',
    args.materialContext || '(kein auswertbarer Text)',
  ]
  return lines.filter(Boolean).join('\n\n')
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim()
  const tryParse = (text: string): unknown | undefined => {
    try {
      return JSON.parse(text)
    } catch {
      return undefined
    }
  }
  const direct = tryParse(trimmed)
  if (direct !== undefined) {
    return direct
  }
  // Erstes {...}-Objekt aus umgebendem Text/Markdown herausschneiden.
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return tryParse(trimmed.slice(start, end + 1))
  }
  return undefined
}

/**
 * Tolerante Umwandlung der KI-Antwort in ein bereinigtes Konzept-Netz: Slugs normalisiert + dedupliziert,
 * Schwierigkeit geclamped, Kanten auf existierende Slugs gefiltert, Selbst-/Doppelkanten entfernt.
 */
export function parseConceptGraphFromText(raw: string): IngestedGraph {
  const parsed = extractJsonObject(raw)
  if (!parsed || typeof parsed !== 'object') {
    return { concepts: [], edges: [] }
  }
  const obj = parsed as Record<string, unknown>
  const rawConcepts = Array.isArray(obj.concepts) ? obj.concepts : []
  const rawEdges = Array.isArray(obj.edges) ? obj.edges : []

  const concepts: IngestedConcept[] = []
  const seenSlugs = new Set<string>()
  for (const entry of rawConcepts) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const e = entry as Record<string, unknown>
    const slug = normalizeConceptSlug(typeof e.slug === 'string' ? e.slug : typeof e.name === 'string' ? e.name : '')
    if (!slug || seenSlugs.has(slug)) {
      continue
    }
    const name = typeof e.name === 'string' && e.name.trim() ? e.name.trim().slice(0, 160) : slug
    const description = typeof e.description === 'string' ? e.description.trim().slice(0, 600) : ''
    const source = (e.source && typeof e.source === 'object' ? e.source : {}) as Record<string, unknown>
    const sourceRef: IngestedSourceRef = {}
    if (typeof source.section === 'string' && source.section.trim()) {
      sourceRef.section = source.section.trim().slice(0, 160)
    }
    const pageFrom = toInt(source.pageFrom)
    const pageTo = toInt(source.pageTo)
    if (pageFrom !== undefined) {
      sourceRef.pageFrom = pageFrom
    }
    if (pageTo !== undefined) {
      sourceRef.pageTo = pageTo
    }
    /*
     * Herkunft (Invariante I4). Die Beweislast liegt bei 'material': ohne woertlichen Beleg wird
     * heruntergestuft statt behauptet. Ein zu vorsichtiges 'ai_supplement' kostet den Nutzer
     * nichts — eine erfundene Quellenangabe kostet ihn das Vertrauen in genau die Unterscheidung,
     * fuer die I4 existiert.
     */
    const sourceQuote = typeof e.quote === 'string' ? e.quote.trim().slice(0, 400) : ''
    const claimedOrigin = typeof e.origin === 'string' ? e.origin.trim().toLowerCase() : ''
    const origin: IngestedOrigin = claimedOrigin === 'material' && sourceQuote.length > 0 ? 'material' : 'ai_supplement'

    seenSlugs.add(slug)
    concepts.push({
      slug,
      name,
      description,
      difficulty: clampDifficulty(e.difficulty),
      sourceRef,
      origin,
      sourceQuote: origin === 'material' ? sourceQuote : '',
    })
  }

  const edges: IngestedEdge[] = []
  const seenEdges = new Set<string>()
  for (const entry of rawEdges) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const e = entry as Record<string, unknown>
    const fromSlug = normalizeConceptSlug(typeof e.from === 'string' ? e.from : '')
    const toSlug = normalizeConceptSlug(typeof e.to === 'string' ? e.to : '')
    const type = typeof e.type === 'string' ? (e.type.trim().toLowerCase() as EdgeType) : ('related' as EdgeType)
    if (!fromSlug || !toSlug || fromSlug === toSlug) {
      continue
    }
    if (!seenSlugs.has(fromSlug) || !seenSlugs.has(toSlug)) {
      continue
    }
    if (!EDGE_TYPES.includes(type)) {
      continue
    }
    const key = `${fromSlug}|${toSlug}|${type}`
    if (seenEdges.has(key)) {
      continue
    }
    seenEdges.add(key)
    edges.push({ fromSlug, toSlug, type })
  }

  return { concepts, edges }
}

/** Zwei Quellen-Referenzen zusammenfuehren (weiteste Seitenspanne, erster nicht-leerer Abschnitt). */
function mergeSourceRef(a: IngestedSourceRef, b: IngestedSourceRef): IngestedSourceRef {
  const merged: IngestedSourceRef = {}
  const section = a.section?.trim() || b.section?.trim()
  if (section) {
    merged.section = section
  }
  const froms = [a.pageFrom, b.pageFrom].filter((n): n is number => typeof n === 'number')
  const tos = [a.pageTo, b.pageTo].filter((n): n is number => typeof n === 'number')
  if (froms.length > 0) {
    merged.pageFrom = Math.min(...froms)
  }
  if (tos.length > 0) {
    merged.pageTo = Math.max(...tos)
  }
  return merged
}

/**
 * Mehrere Teil-Konzeptnetze (aus der abschnittsweisen Map-Reduce-Ingestion) zu EINEM Netz zusammenfuehren.
 *  - Konzepte werden per Slug dedupliziert: laengere Beschreibung gewinnt, hoechste Schwierigkeit gewinnt,
 *    Quellen-Referenzen werden vereinigt; die Reihenfolge (≈ Dokumentreihenfolge) bleibt erhalten.
 *  - Bei Ueberschreiten von CONCEPT_INGESTION_MAX_CONCEPTS werden die zuletzt gesehenen Konzepte verworfen.
 *  - Kanten werden vereinigt, auf ueberlebende Slugs gefiltert, Selbst-/Doppelkanten entfernt.
 */
export function mergeConceptGraphs(graphs: IngestedGraph[]): IngestedGraph {
  const bySlug = new Map<string, IngestedConcept>()
  const order: string[] = []

  for (const graph of graphs) {
    for (const concept of graph.concepts) {
      const existing = bySlug.get(concept.slug)
      if (!existing) {
        bySlug.set(concept.slug, { ...concept })
        order.push(concept.slug)
        continue
      }
      existing.name = existing.name.length >= concept.name.length ? existing.name : concept.name
      existing.description =
        existing.description.length >= concept.description.length ? existing.description : concept.description
      existing.difficulty = Math.max(existing.difficulty, concept.difficulty)
      existing.sourceRef = mergeSourceRef(existing.sourceRef, concept.sourceRef)
      /*
       * Herkunft (I4): ein Beleg gewinnt gegen keinen Beleg. Findet ein Abschnitt das Konzept
       * woertlich im Material, ist es belegt — auch wenn ein anderer Abschnitt es nur ergaenzt
       * hat. Umgekehrt wird ein vorhandener Beleg nie durch dessen Fehlen ersetzt.
       */
      if (existing.origin !== 'material' && concept.origin === 'material') {
        existing.origin = 'material'
        existing.sourceQuote = concept.sourceQuote
      }
    }
  }

  const keptSlugs = order.slice(0, CONCEPT_INGESTION_MAX_CONCEPTS)
  const keptSet = new Set(keptSlugs)
  const concepts = keptSlugs.map((slug) => bySlug.get(slug)!).filter(Boolean)

  const edges: IngestedEdge[] = []
  const seenEdges = new Set<string>()
  for (const graph of graphs) {
    for (const edge of graph.edges) {
      if (!keptSet.has(edge.fromSlug) || !keptSet.has(edge.toSlug) || edge.fromSlug === edge.toSlug) {
        continue
      }
      const key = `${edge.fromSlug}|${edge.toSlug}|${edge.type}`
      if (seenEdges.has(key)) {
        continue
      }
      seenEdges.add(key)
      edges.push({ fromSlug: edge.fromSlug, toSlug: edge.toSlug, type: edge.type })
    }
  }

  return { concepts, edges }
}

/** Struktur-Validierung des geparsten Netzes (Mindestmenge, Kanten-Integritaet). */
export function validateConceptGraph(graph: IngestedGraph): { valid: boolean; reason: string } {
  if (graph.concepts.length < CONCEPT_INGESTION_MIN_CONCEPTS) {
    return {
      valid: false,
      reason: `Es braucht mindestens ${CONCEPT_INGESTION_MIN_CONCEPTS} Konzepte, gefunden: ${graph.concepts.length}.`,
    }
  }
  const slugs = new Set(graph.concepts.map((c) => c.slug))
  for (const edge of graph.edges) {
    if (!slugs.has(edge.fromSlug) || !slugs.has(edge.toSlug)) {
      return { valid: false, reason: `Kante verweist auf unbekanntes Konzept: ${edge.fromSlug} -> ${edge.toSlug}.` }
    }
  }
  return { valid: true, reason: '' }
}
