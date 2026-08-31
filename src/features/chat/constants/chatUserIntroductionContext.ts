import {
  introductionHasContent,
  normalizeIntroductionText,
  parseIntroductionMode,
  parseUserIntroductionAnswers,
  USER_INTRODUCTION_QUESTIONS,
  type IntroductionMode,
  type UserIntroductionAnswers,
} from '../../auth/constants/userIntroduction'

export type ChatUserIntroduction = {
  completed: boolean
  mode: IntroductionMode | null
  text: string
  answers: UserIntroductionAnswers
  updatedAt: string | null
}

export type ChatUserIntroductionProfileFields = {
  introduction_completed?: boolean | null
  introduction_mode?: string | null
  introduction_text?: string | null
  introduction_answers?: unknown
  introduction_updated_at?: string | null
}

export function resolveChatUserIntroduction(
  profile: ChatUserIntroductionProfileFields | null | undefined,
): ChatUserIntroduction | null {
  if (!profile) {
    return null
  }
  return {
    completed: profile.introduction_completed === true,
    mode: parseIntroductionMode(profile.introduction_mode),
    text: normalizeIntroductionText(profile.introduction_text),
    answers: parseUserIntroductionAnswers(profile.introduction_answers),
    updatedAt:
      typeof profile.introduction_updated_at === 'string' ? profile.introduction_updated_at : null,
  }
}

function formatAnswersForAi(answers: UserIntroductionAnswers): string[] {
  const lines: string[] = []
  for (const q of USER_INTRODUCTION_QUESTIONS) {
    const v = answers[q.id]?.trim()
    if (v) {
      lines.push(`- ${q.label} ${v}`)
    }
  }
  return lines
}

let cachedInstructionKey = ''
let cachedInstructionInstruction = ''

/**
 * Nutzer-Einführung für die KI (Hauptchat) — direkt nach Identität, vor Abo-Verbrauch/Datum.
 */
export function getChatUserIntroductionInstruction(
  intro: ChatUserIntroduction | null | undefined,
): string {
  if (!intro) {
    return ''
  }

  const hasContent = introductionHasContent(intro.text, intro.answers)
  const cacheKey = `${intro.completed}\0${intro.mode ?? ''}\0${intro.text}\0${JSON.stringify(intro.answers)}`
  if (cacheKey === cachedInstructionKey) {
    return cachedInstructionInstruction
  }

  if (!hasContent) {
    cachedInstructionKey = cacheKey
    cachedInstructionInstruction = [
      'Nutzer-Einführung (Straton-Einstellungen):',
      '- Noch keine Einführung hinterlegt.',
      '- Bei «wer bin ich», «was weisst du über mich»: Namen aus Konto nennen; zu Hobbys/Beruf/Alter ehrlich sagen, dass noch nichts hinterlegt ist (Einstellungen → Einführung).',
      '- Vor- und Nachname kommen aus dem Konto — nicht aus der Einführung erwarten.',
    ].join('\n')
    return cachedInstructionInstruction
  }

  const blocks: string[] = ['Nutzer-Einführung (verbindlich — Straton-Einstellungen, vom Nutzer hinterlegt):']
  if (intro.text) {
    blocks.push(`Freitext:\n${intro.text}`)
  }
  const answerLines = formatAnswersForAi(intro.answers)
  if (answerLines.length > 0) {
    blocks.push(['Fragebogen:', ...answerLines].join('\n'))
  }
  blocks.push(
    '- Bei «wer bin ich», «was weisst du über mich», «kennst du mich»: Namen aus Konto + diese Einführung kombinieren.',
    '- Vor- und Nachname nur aus dem Konto — nicht aus der Einführung.',
    '- Nichts erfinden, was weder in Einführung noch Konto steht.',
    '- Natürlich in Du-Form — nicht in jeder Antwort wiederholen.',
  )

  cachedInstructionKey = cacheKey
  cachedInstructionInstruction = blocks.join('\n\n')
  return cachedInstructionInstruction
}
