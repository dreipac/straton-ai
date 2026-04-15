import type { ChapterBlueprint, ChapterSession, ChapterStep } from '../services/learn.persistence'
import {
  ADAPTIVE_CHAPTER_GENERATED_ID,
  collectWeakQuestionSteps,
} from './learnPageHelpers'

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

  if (sections.length === 0) {
    return ''
  }

  const combined = sections.join('\n\n').trim()
  if (combined.length <= MAX_OUTLINE_CHARS) {
    return combined
  }
  return `${combined.slice(0, MAX_OUTLINE_CHARS)}\n\n[…gekürzt]`
}
