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

export type IngestedConcept = {
  slug: string
  name: string
  description: string
  difficulty: number
  sourceRef: IngestedSourceRef
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
      '"difficulty":1..5,"source":{"section":"optionaler Abschnitt","pageFrom":int?,"pageTo":int?}}],' +
      '"edges":[{"from":"slug-a","to":"slug-b","type":"prerequisite|related|opposite"}]}',
    'Regeln:',
    `- ${CONCEPT_INGESTION_MIN_CONCEPTS}-${CONCEPT_INGESTION_MAX_CONCEPTS} Konzepte; jedes atomar (eine pruefbare Wissenseinheit, kein ganzes Kapitel).`,
    '- slug: kurz, kleingeschrieben, nur Buchstaben/Zahlen/Bindestriche, eindeutig.',
    '- difficulty: 1 (trivial) .. 5 (sehr komplex), nach Abstraktionsgrad + Anzahl Voraussetzungen.',
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
    seenSlugs.add(slug)
    concepts.push({ slug, name, description, difficulty: clampDifficulty(e.difficulty), sourceRef })
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
