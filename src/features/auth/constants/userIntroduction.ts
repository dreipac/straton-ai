export type IntroductionMode = 'text' | 'questionnaire'

export type UserIntroductionAnswers = {
  age?: string
  role?: string
  hobbies?: string
  goals?: string
  other?: string
}

export const USER_INTRODUCTION_TEXT_MAX = 4000

/** Kurzbeschreibung unter dem Titel (Modal + Einstellungen). */
export const USER_INTRODUCTION_SUBTITLE =
  'Kurzprofil für den Chat, jederzeit unter Einstellungen anpassbar.'

export const USER_INTRODUCTION_QUESTIONS: {
  id: keyof UserIntroductionAnswers
  label: string
  placeholder: string
}[] = [
  { id: 'age', label: 'Wann ist dein Geburtsdatum?', placeholder: 'z. B. 15.03.2007' },
  { id: 'role', label: 'Was machst du?', placeholder: 'Schule, Beruf, Studium …' },
  { id: 'hobbies', label: 'Hobbys & Interessen', placeholder: 'z. B. Fussball, Programmieren' },
  { id: 'goals', label: 'Wofür nutzt du Straton?', placeholder: 'Prüfungen, Alltag, Projekte …' },
  { id: 'other', label: 'Sonstiges (optional)', placeholder: 'Alles, was die KI wissen soll' },
]

function trimField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function parseUserIntroductionAnswers(raw: unknown): UserIntroductionAnswers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const o = raw as Record<string, unknown>
  const answers: UserIntroductionAnswers = {}
  for (const q of USER_INTRODUCTION_QUESTIONS) {
    const v = trimField(o[q.id])
    if (v) {
      answers[q.id] = v.slice(0, 500)
    }
  }
  return answers
}

export function normalizeIntroductionText(raw: string | null | undefined): string {
  return typeof raw === 'string' ? raw.trim().slice(0, USER_INTRODUCTION_TEXT_MAX) : ''
}

export function introductionHasContent(
  text: string | null | undefined,
  answers: UserIntroductionAnswers | null | undefined,
): boolean {
  if (normalizeIntroductionText(text).length > 0) {
    return true
  }
  const a = answers ?? {}
  return USER_INTRODUCTION_QUESTIONS.some((q) => Boolean(trimField(a[q.id])))
}

export function parseIntroductionMode(raw: unknown): IntroductionMode | null {
  return raw === 'text' || raw === 'questionnaire' ? raw : null
}
