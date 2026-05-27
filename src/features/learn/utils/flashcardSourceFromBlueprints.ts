import type { ChapterBlueprint, ChapterSession, ChapterStep, LearnFlashcardSet, LearnWorksheetItem } from '../services/learn.persistence'
import { ADAPTIVE_CHAPTER_GENERATED_ID, collectWeakQuestionSteps } from './learnPageHelpers'

const MAX_OUTLINE_CHARS = 14_000

export type LearnMaterialPersonalizationMode = 'general' | 'personalized'

function stepSnippet(step: ChapterStep, maxLen: number): string {
  if (step.type === 'explanation') {
    const bullets =
      step.bullets && step.bullets.length > 0 ? ` Stichpunkte: ${step.bullets.slice(0, 6).join(' | ')}` : ''
    return `Erklärung «${step.title}»: ${step.content.slice(0, maxLen)}${bullets}`
  }
  if (step.type === 'question') {
    const hint = step.hint ? ` (Hinweis: ${step.hint.slice(0, 120)})` : ''
    return `Frage: ${step.prompt} → erwartet: ${step.expectedAnswer.slice(0, 280)}${hint}`
  }
  const bullets =
    step.bullets && step.bullets.length > 0 ? ` ${step.bullets.slice(0, 5).join(' | ')}` : ''
  return `Recap «${step.title}»: ${step.content.slice(0, maxLen)}${bullets}`
}

/**
 * Kompakter Text nur aus gespeicherten Kapitel-Blueprints (keine Roh-Materialien).
 * Begrenzt Länge, um API-Kosten zu senken.
 */
export function buildFlashcardSourceFromBlueprints(blueprints: ChapterBlueprint[]): string {
  if (!blueprints.length) {
    return ''
  }
  const lines: string[] = []
  for (const chapter of blueprints) {
    lines.push(`### ${chapter.title}`)
    if (chapter.description?.trim()) {
      lines.push(chapter.description.trim())
    }
    for (const step of chapter.steps) {
      lines.push(`- ${stepSnippet(step, 520)}`)
    }
    lines.push('')
  }
  const text = lines.join('\n').trim()
  if (text.length <= MAX_OUTLINE_CHARS) {
    return text
  }
  return `${text.slice(0, MAX_OUTLINE_CHARS)}\n\n[…gekürzt]`
}

/**
 * Umriss für Lernkarten/Arbeitsblatt: allgemein nur Basis-Kapitel;
 * personalisiert inkl. adaptivem Schwächen-Kapitel (falls vorhanden) und falsch beantworteter Fragen.
 */
export function buildLearnMaterialOutlineFromBlueprints(
  mode: LearnMaterialPersonalizationMode,
  chapterBlueprints: ChapterBlueprint[],
  effectiveChapterBlueprints: ChapterBlueprint[],
  chapterSession: ChapterSession,
  learnFlashcardSets?: LearnFlashcardSet[],
  learnWorksheets?: LearnWorksheetItem[],
): string {
  if (mode === 'general' || chapterBlueprints.length === 0) {
    return buildFlashcardSourceFromBlueprints(chapterBlueprints)
  }

  const sections: string[] = []
  const base = buildFlashcardSourceFromBlueprints(chapterBlueprints)
  if (base.trim()) {
    sections.push(base)
  }

  const tail =
    effectiveChapterBlueprints.length > chapterBlueprints.length
      ? effectiveChapterBlueprints[effectiveChapterBlueprints.length - 1]
      : null

  if (tail && tail.id === ADAPTIVE_CHAPTER_GENERATED_ID) {
    const tailOutline = buildFlashcardSourceFromBlueprints([tail])
    if (tailOutline.trim()) {
      sections.push(`### Adaptives Schwächen-Kapitel\n${tailOutline}`)
    }
  }

  const weak = collectWeakQuestionSteps(chapterBlueprints, chapterSession)
  if (weak.length > 0) {
    const lines = weak.slice(0, 12).map((s, i) => `- ${i + 1}. ${s.prompt}`)
    sections.push(`### Dein Lernverlauf — diese Themen bitte stärker einbeziehen\n${lines.join('\n')}`)
  }

  const weakSkillLogs = Object.values(chapterSession.skillMasteryBySkillId ?? {})
    .filter((entry) => (entry.score ?? 0) < 0.6)
    .flatMap((entry) => entry.lastWrongPrompts ?? [])
    .filter((text) => text.trim().length > 0)
    .slice(0, 12)
  if (weakSkillLogs.length > 0) {
    const lines = weakSkillLogs.map((prompt, i) => `- ${i + 1}. ${prompt}`)
    sections.push(`### Konkrete Fehlermuster aus deinem Verlauf\n${lines.join('\n')}`)
  }

  const weakFlashcards = (learnFlashcardSets ?? [])
    .flatMap((set) => set.cards)
    .filter((card) => card.selfRating === 'unknown')
    .slice(0, 12)
  if (weakFlashcards.length > 0) {
    const lines = weakFlashcards.map((card, i) => `- ${i + 1}. ${card.question}`)
    sections.push(`### Lernkarten mit Unsicherheit (nicht gewusst)\n${lines.join('\n')}`)
  }

  const submittedWorksheetAnswers = (learnWorksheets ?? [])
    .filter((item) => typeof item.submittedAt === 'string' && item.submittedAt.trim().length > 0)
    .filter((item) => typeof item.savedAnswer === 'string' && item.savedAnswer.trim().length > 0)
    .slice(0, 16)
  if (submittedWorksheetAnswers.length > 0) {
    const lines = submittedWorksheetAnswers.map((item, i) => {
      const answer = item.savedAnswer!.replace(/\s+/g, ' ').trim().slice(0, 260)
      return `- ${i + 1}. Aufgabe: ${item.prompt}\n  Antwort: ${answer}`
    })
    sections.push(`### Abgegebene Arbeitsblatt-Antworten (Lernstand)\n${lines.join('\n')}`)
  }

  if (sections.length === 0) {
    return ''
  }

  const combined = sections.join('\n\n').trim()
  if (combined.length <= MAX_OUTLINE_CHARS) {
    return combined
  }
  return `${combined.slice(0, MAX_OUTLINE_CHARS)}\n\n[…gekürzt]`
}

/**
 * Nur Lernstand/Schwachstellen — für gemischte Lernblätter und Lernkarten
 * (ab mehreren abgeschlossenen Kapiteln), ohne vollständigen Kapiteltext.
 */
export function buildMixedLearnProgressOutline(
  chapterBlueprints: ChapterBlueprint[],
  effectiveChapterBlueprints: ChapterBlueprint[],
  chapterSession: ChapterSession,
  learnFlashcardSets?: LearnFlashcardSet[],
  learnWorksheets?: LearnWorksheetItem[],
): string {
  const sections: string[] = [
    'ANWEISUNG: Erstelle Inhalte ausschließlich zu den unten genannten Schwachstellen und Lernlücken. Wiederhole nicht breit den gesamten Stoff aller Kapitel.',
  ]

  if (chapterBlueprints.length > 0) {
    const titles = chapterBlueprints.map((chapter, index) => `${index + 1}. ${chapter.title}`).join('\n')
    sections.push(`### Bereits bearbeitete Kapitel (nur Orientierung)\n${titles}`)
  }

  const tail =
    effectiveChapterBlueprints.length > chapterBlueprints.length
      ? effectiveChapterBlueprints[effectiveChapterBlueprints.length - 1]
      : null

  if (tail && tail.id === ADAPTIVE_CHAPTER_GENERATED_ID) {
    const tailOutline = buildFlashcardSourceFromBlueprints([tail])
    if (tailOutline.trim()) {
      sections.push(`### Adaptives Schwächen-Kapitel\n${tailOutline}`)
    }
  }

  const weak = collectWeakQuestionSteps(chapterBlueprints, chapterSession)
  if (weak.length > 0) {
    const lines = weak.slice(0, 12).map((s, i) => `- ${i + 1}. ${s.prompt}`)
    sections.push(`### Falsch beantwortet — bitte gezielt üben\n${lines.join('\n')}`)
  }

  const weakSkills = Object.values(chapterSession.skillMasteryBySkillId ?? {})
    .filter((entry) => (entry.score ?? 0) < 0.6)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
  if (weakSkills.length > 0) {
    const lines = weakSkills.slice(0, 8).map((entry, i) => {
      const label = entry.label?.trim() || entry.source || 'Skill'
      const scorePct = Math.round((entry.score ?? 0) * 100)
      return `- ${i + 1}. ${label} (Mastery ${scorePct}%)`
    })
    sections.push(`### Schwache Skills (Mastery)\n${lines.join('\n')}`)
  }

  const weakSkillLogs = weakSkills
    .flatMap((entry) => entry.lastWrongPrompts ?? [])
    .filter((text) => text.trim().length > 0)
    .slice(0, 12)
  if (weakSkillLogs.length > 0) {
    const lines = weakSkillLogs.map((prompt, i) => `- ${i + 1}. ${prompt}`)
    sections.push(`### Konkrete Fehlermuster\n${lines.join('\n')}`)
  }

  const weakFlashcards = (learnFlashcardSets ?? [])
    .flatMap((set) => set.cards)
    .filter((card) => card.selfRating === 'unknown')
    .slice(0, 12)
  if (weakFlashcards.length > 0) {
    const lines = weakFlashcards.map((card, i) => `- ${i + 1}. ${card.question}`)
    sections.push(`### Lernkarten mit Unsicherheit\n${lines.join('\n')}`)
  }

  const submittedWorksheetAnswers = (learnWorksheets ?? [])
    .filter((item) => typeof item.submittedAt === 'string' && item.submittedAt.trim().length > 0)
    .filter((item) => typeof item.savedAnswer === 'string' && item.savedAnswer.trim().length > 0)
    .slice(0, 16)
  if (submittedWorksheetAnswers.length > 0) {
    const lines = submittedWorksheetAnswers.map((item, i) => {
      const answer = item.savedAnswer!.replace(/\s+/g, ' ').trim().slice(0, 260)
      return `- ${i + 1}. Aufgabe: ${item.prompt}\n  Antwort: ${answer}`
    })
    sections.push(`### Abgegebene Arbeitsblatt-Antworten\n${lines.join('\n')}`)
  }

  if (sections.length <= 1) {
    return buildLearnMaterialOutlineFromBlueprints(
      'personalized',
      chapterBlueprints,
      effectiveChapterBlueprints,
      chapterSession,
      learnFlashcardSets,
      learnWorksheets,
    )
  }

  const combined = sections.join('\n\n').trim()
  if (combined.length <= MAX_OUTLINE_CHARS) {
    return combined
  }
  return `${combined.slice(0, MAX_OUTLINE_CHARS)}\n\n[…gekürzt]`
}
