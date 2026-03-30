import type { ChapterBlueprint, ChapterStep } from '../services/learn.persistence'

const MAX_OUTLINE_CHARS = 14_000

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
