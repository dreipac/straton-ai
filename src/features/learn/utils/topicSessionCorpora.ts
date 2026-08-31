import type { ChapterBlueprint, ChapterSession, SyllabusEntry, TopicSession } from '../services/learn.persistence'

/**
 * Ein Thema der Landkarte zerlegt in seine "Kapitel-förmigen" Einheiten (Diagnosetest + die fortlaufende
 * Zwischenschritt-Serie) — exakt dieselbe Form wie das alte `{ chapterBlueprints, chapterSession }`-Paar,
 * nur einmal pro Corpus statt einmal global. Damit lassen sich bestehende, blueprint-/session-basierte
 * Auswertungen (Fehler-Logbuch, Flashcard-Outline, Lernstand-Insight) unverändert wiederverwenden — nur je
 * Corpus statt einmal aufgerufen und die Ergebnisse gemergt.
 */
export type TopicCorpus = {
  topicIndex: number
  kind: 'diagnostic' | 'step'
  contextLabel: string
  blueprints: ChapterBlueprint[]
  session: ChapterSession
}

export function buildTopicCorpora(topicSessions: TopicSession[], syllabus: SyllabusEntry[]): TopicCorpus[] {
  const corpora: TopicCorpus[] = []
  topicSessions.forEach((topic, topicIndex) => {
    const label = syllabus[topicIndex]?.topic?.trim() || `Thema ${topicIndex + 1}`
    if (topic.entryCheckBlueprint && topic.entryCheckSession) {
      corpora.push({
        topicIndex,
        kind: 'diagnostic',
        contextLabel: `${label} — Einstiegscheck`,
        blueprints: [topic.entryCheckBlueprint],
        session: topic.entryCheckSession,
      })
    }
    topic.substeps.forEach((substep, substepIndex) => {
      corpora.push({
        topicIndex,
        kind: 'step',
        contextLabel: substep.blueprint.title.trim() || `${label} — Teil ${substepIndex + 1}`,
        blueprints: [substep.blueprint],
        session: substep.session,
      })
    })
  })
  return corpora
}
