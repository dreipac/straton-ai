/**
 * Curriculum-Generator — Schicht 2 (reine Logik).
 *
 * Verwandelt das Konzept-Netz in eine lernbare Struktur: Themen (Cluster von Konzepten) mit Schritten.
 * Clustering ist KI-gestuetzt (semantische Naehe), die REIHENFOLGE dagegen deterministisch topologisch
 * (respektiert Voraussetzungen). Reine Funktionen: Prompt-Builder, toleranter Parser (garantiert volle
 * Konzept-Abdeckung), Validator, topologische Ordnung.
 */

import { normalizeConceptSlug } from './conceptIngestion'

export type CurriculumStep = {
  title: string
  conceptSlugs: string[]
}

export type CurriculumTopic = {
  title: string
  learningGoal: string
  conceptSlugs: string[]
  steps: CurriculumStep[]
}

export type Curriculum = {
  topics: CurriculumTopic[]
}

export const CURRICULUM_MAX_ATTEMPTS = 2
/** Zielgroesse eines Themas im deterministischen Fallback (Chunking). */
export const FALLBACK_TOPIC_SIZE = 6

/**
 * Deterministisches Curriculum ohne KI: Konzepte in Reihenfolge zu Themen von ~FALLBACK_TOPIC_SIZE
 * chunken, je Konzept ein Schritt. Dient Platzhalter-Modus UND KI-Fehlerfall (garantiert gueltig).
 */
export function buildFallbackCurriculum(concepts: { slug: string; name: string }[]): Curriculum {
  if (concepts.length === 0) {
    return { topics: [] }
  }
  const topics: CurriculumTopic[] = []
  for (let i = 0; i < concepts.length; i += FALLBACK_TOPIC_SIZE) {
    const chunk = concepts.slice(i, i + FALLBACK_TOPIC_SIZE)
    const partNumber = Math.floor(i / FALLBACK_TOPIC_SIZE) + 1
    topics.push({
      title: concepts.length <= FALLBACK_TOPIC_SIZE ? 'Grundlagen' : `Teil ${partNumber}`,
      learningGoal: '',
      conceptSlugs: chunk.map((c) => c.slug),
      steps: chunk.map((c) => ({ title: c.name, conceptSlugs: [c.slug] })),
    })
  }
  return { topics }
}

/** Prompt: Konzept-Netz -> geclusterte Themen mit Schritten (JSON). */
export function buildCurriculumPrompt(args: {
  concepts: { slug: string; name: string; difficulty: number }[]
  edges: { fromSlug: string; toSlug: string; type: string }[]
  proficiencyLevel: '' | 'low' | 'medium' | 'high'
  aiGuidance: string
  attempt: number
  validationHint: string
}): string {
  const conceptLines = args.concepts.map((c) => `- ${c.slug} — ${c.name} (Schwierigkeit ${c.difficulty})`).join('\n')
  const edgeLines = args.edges.map((e) => `- ${e.fromSlug} -> ${e.toSlug} [${e.type}]`).join('\n')
  const level =
    args.proficiencyLevel === 'low'
      ? 'schwach'
      : args.proficiencyLevel === 'medium'
        ? 'mittel'
        : args.proficiencyLevel === 'high'
          ? 'gut'
          : 'unbekannt'
  const lines = [
    'Aufgabe: Gruppiere das folgende KONZEPT-NETZ in ein lernbares Curriculum aus Themen mit Schritten.',
    'Antwortformat: NUR valides JSON, kein Markdown/Fliesstext. Schema:',
    '{"topics":[{"title":"Themen-Titel","learningGoal":"1 Satz Lernziel",' +
      '"conceptSlugs":["slug-a","slug-b"],"steps":[{"title":"Schritt-Titel","conceptSlugs":["slug-a"]}]}]}',
    'Regeln:',
    '- Gruppiere nach inhaltlicher Naehe UND gemeinsamen Abhaengigkeiten (typisch 3-10 Konzepte pro Thema).',
    '- JEDES Konzept gehoert zu GENAU EINEM Thema. Kein Konzept doppelt, keines vergessen.',
    '- Schritte innerhalb eines Themas decken dessen Konzepte ab; jeder Schritt fokussiert 1-3 Konzepte.',
    '- conceptSlugs MUESSEN exakt die vorgegebenen slugs sein (unten). Keine neuen slugs erfinden.',
    '- Reihenfolge egal — sie wird spaeter topologisch (nach Voraussetzungen) sortiert.',
    `Selbsteinschaetzung des Lernenden: ${level}.`,
    args.aiGuidance.trim() ? `Zusatzhinweise: ${args.aiGuidance.trim()}` : '',
    args.attempt > 1 ? 'WICHTIG: Der vorige Versuch war ungueltig. Halte dich exakt an das Schema und alle Regeln.' : '',
    args.validationHint ? `Ungueltigkeitsgrund im Vorversuch: ${args.validationHint}` : '',
    `Konzepte (${args.concepts.length}):\n${conceptLines}`,
    args.edges.length > 0 ? `Beziehungen:\n${edgeLines}` : 'Beziehungen: keine',
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
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return tryParse(trimmed.slice(start, end + 1))
  }
  return undefined
}

function normalizeSlugList(value: unknown, known: Set<string>, alreadyUsed: Set<string>): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const out: string[] = []
  for (const raw of value) {
    if (typeof raw !== 'string') {
      continue
    }
    const slug = normalizeConceptSlug(raw)
    if (slug && known.has(slug) && !alreadyUsed.has(slug) && !out.includes(slug)) {
      out.push(slug)
    }
  }
  return out
}

/**
 * Tolerante Umwandlung der KI-Antwort in ein bereinigtes Curriculum. Jedes Konzept landet in genau einem
 * Thema (erste Nennung gewinnt); NICHT zugeordnete Konzepte werden garantiert einem Auffang-Thema
 * zugeschlagen, damit die Abdeckung vollstaendig ist. Schritt-Konzepte werden auf die Themen-Konzepte
 * beschraenkt; ein Thema ohne gueltige Schritte erhaelt einen Default-Schritt ueber alle seine Konzepte.
 */
export function parseCurriculumFromText(raw: string, knownSlugs: string[]): Curriculum {
  const known = new Set(knownSlugs.map((s) => normalizeConceptSlug(s)).filter(Boolean))
  const parsed = extractJsonObject(raw)
  const assigned = new Set<string>()
  const topics: CurriculumTopic[] = []

  if (parsed && typeof parsed === 'object') {
    const rawTopics = Array.isArray((parsed as Record<string, unknown>).topics)
      ? ((parsed as Record<string, unknown>).topics as unknown[])
      : []
    for (const entry of rawTopics) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const t = entry as Record<string, unknown>
      const conceptSlugs = normalizeSlugList(t.conceptSlugs, known, assigned)
      if (conceptSlugs.length === 0) {
        continue
      }
      conceptSlugs.forEach((s) => assigned.add(s))
      const topicSet = new Set(conceptSlugs)
      const title = typeof t.title === 'string' && t.title.trim() ? t.title.trim().slice(0, 160) : 'Thema'
      const learningGoal = typeof t.learningGoal === 'string' ? t.learningGoal.trim().slice(0, 320) : ''

      const rawSteps = Array.isArray(t.steps) ? t.steps : []
      const usedInSteps = new Set<string>()
      const steps: CurriculumStep[] = []
      for (const stepEntry of rawSteps) {
        if (!stepEntry || typeof stepEntry !== 'object') {
          continue
        }
        const s = stepEntry as Record<string, unknown>
        const stepConcepts = normalizeSlugList(s.conceptSlugs, topicSet, usedInSteps)
        if (stepConcepts.length === 0) {
          continue
        }
        stepConcepts.forEach((c) => usedInSteps.add(c))
        steps.push({
          title: typeof s.title === 'string' && s.title.trim() ? s.title.trim().slice(0, 160) : 'Schritt',
          conceptSlugs: stepConcepts,
        })
      }
      // Nicht in Schritten abgedeckte Themen-Konzepte in einen Abschluss-Schritt buendeln.
      const leftoverInTopic = conceptSlugs.filter((c) => !usedInSteps.has(c))
      if (leftoverInTopic.length > 0) {
        steps.push({ title: steps.length === 0 ? title : 'Weitere Konzepte', conceptSlugs: leftoverInTopic })
      }
      topics.push({ title, learningGoal, conceptSlugs, steps })
    }
  }

  // Auffang: nicht zugeordnete Konzepte garantiert unterbringen (Abdeckung).
  const leftover = [...known].filter((s) => !assigned.has(s))
  if (leftover.length > 0) {
    if (topics.length > 0) {
      const last = topics[topics.length - 1]
      last.conceptSlugs.push(...leftover)
      last.steps.push({ title: 'Weitere Konzepte', conceptSlugs: leftover })
    } else {
      topics.push({
        title: 'Grundlagen',
        learningGoal: '',
        conceptSlugs: leftover,
        steps: [{ title: 'Grundlagen', conceptSlugs: leftover }],
      })
    }
  }

  return { topics }
}

/** Struktur-Validierung: mindestens ein Thema, jedes Thema mit Konzepten + Schritten, volle Abdeckung. */
export function validateCurriculum(curriculum: Curriculum, knownSlugs: string[]): { valid: boolean; reason: string } {
  if (curriculum.topics.length === 0) {
    return { valid: false, reason: 'Es braucht mindestens ein Thema.' }
  }
  const covered = new Set<string>()
  for (const topic of curriculum.topics) {
    if (topic.conceptSlugs.length === 0) {
      return { valid: false, reason: `Thema "${topic.title}" hat keine Konzepte.` }
    }
    if (topic.steps.length === 0) {
      return { valid: false, reason: `Thema "${topic.title}" hat keine Schritte.` }
    }
    topic.conceptSlugs.forEach((s) => covered.add(s))
  }
  const known = new Set(knownSlugs.map((s) => normalizeConceptSlug(s)).filter(Boolean))
  for (const slug of known) {
    if (!covered.has(slug)) {
      return { valid: false, reason: `Konzept "${slug}" ist keinem Thema zugeordnet.` }
    }
  }
  return { valid: true, reason: '' }
}

/**
 * Topologische Ordnung: Themen nach dem fruehesten (rangniedrigsten) ihrer Konzepte sortieren, Schritte
 * innerhalb eines Themas ebenso, Konzepte innerhalb nach Rang. `orderedSlugs` = topologische Konzept-
 * reihenfolge (aus conceptGraph.topologicalOrder). Deterministisch, tie-break nach Titel.
 */
export function orderCurriculum(curriculum: Curriculum, orderedSlugs: string[]): Curriculum {
  const rank = new Map<string, number>()
  orderedSlugs.forEach((slug, index) => rank.set(normalizeConceptSlug(slug), index))
  const rankOf = (slug: string): number => rank.get(slug) ?? Number.MAX_SAFE_INTEGER
  const minRank = (slugs: string[]): number => (slugs.length === 0 ? Number.MAX_SAFE_INTEGER : Math.min(...slugs.map(rankOf)))
  const bySlugRank = (a: string, b: string): number => rankOf(a) - rankOf(b)

  const topics = curriculum.topics
    .map((topic) => ({
      ...topic,
      conceptSlugs: [...topic.conceptSlugs].sort(bySlugRank),
      steps: [...topic.steps]
        .map((step) => ({ ...step, conceptSlugs: [...step.conceptSlugs].sort(bySlugRank) }))
        .sort((a, b) => minRank(a.conceptSlugs) - minRank(b.conceptSlugs) || (a.title < b.title ? -1 : 1)),
    }))
    .sort((a, b) => minRank(a.conceptSlugs) - minRank(b.conceptSlugs) || (a.title < b.title ? -1 : 1))

  return { topics }
}
