import type { ChapterBlueprint, ChapterSession, ChapterStep } from '../services/learn.persistence'
import type { InteractiveQuizPayload } from '../../chat/utils/interactiveQuiz'

export function getDisplayPathTitle(title: string) {
  const trimmed = title.trim()
  return trimmed ? trimmed : 'Neuer Lernpfad'
}

type MaterialTypeVariant = 'pdf' | 'image' | 'doc' | 'sheet' | 'archive' | 'code' | 'other'

function getMaterialFileExtension(filename: string): string {
  const base = filename.trim()
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) {
    return ''
  }
  return base.slice(dot + 1).toLowerCase()
}

const MATERIAL_EXT_LABEL: Record<string, string> = {
  jpeg: 'JPEG',
  jpg: 'JPG',
  png: 'PNG',
  gif: 'GIF',
  webp: 'WEBP',
  svg: 'SVG',
  bmp: 'BMP',
  ico: 'ICO',
  avif: 'AVIF',
  pdf: 'PDF',
  txt: 'TXT',
  md: 'MD',
  doc: 'DOC',
  docx: 'DOCX',
  xls: 'XLS',
  xlsx: 'XLSX',
  csv: 'CSV',
  ppt: 'PPT',
  pptx: 'PPTX',
  odt: 'ODT',
  ods: 'ODS',
  rtf: 'RTF',
  zip: 'ZIP',
  rar: 'RAR',
  '7z': '7Z',
  tar: 'TAR',
  gz: 'GZ',
  json: 'JSON',
  xml: 'XML',
  html: 'HTML',
  css: 'CSS',
  js: 'JS',
  ts: 'TS',
  tsx: 'TSX',
  jsx: 'JSX',
  py: 'PY',
}

export function getMaterialTypeBadge(filename: string): { label: string; variant: MaterialTypeVariant } {
  const ext = getMaterialFileExtension(filename)
  if (!ext) {
    return { label: 'FILE', variant: 'other' }
  }
  const label = MATERIAL_EXT_LABEL[ext] ?? ext.toUpperCase().slice(0, 10)
  if (ext === 'pdf') {
    return { label, variant: 'pdf' }
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'].includes(ext)) {
    return { label, variant: 'image' }
  }
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) {
    return { label, variant: 'doc' }
  }
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) {
    return { label, variant: 'sheet' }
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return { label, variant: 'archive' }
  }
  if (['json', 'xml', 'html', 'css', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'c', 'h', 'cs'].includes(ext)) {
    return { label, variant: 'code' }
  }
  return { label, variant: 'other' }
}

export const LEARN_TUTOR_SYSTEM_PROMPT = [
  'Du bist ein KI-Lerntutor fuer Informatik EFZ in der Schweiz.',
  'Erklaere fachlich korrekt, aber einfach, klar und strukturiert.',
  'Passe den Schwierigkeitsgrad an das Niveau des Nutzers an.',
  'Nutze zuerst die hochgeladenen Unterlagen und Notizen als primaere Quelle.',
  'Wenn etwas unklar ist, erklaere mit konkreten Beispielen aus der IT-Praxis.',
  'Arbeite kapitelbasiert und baue auf dem gewaehlten Schwerpunkt auf.',
  'Nach jeder Erklaerung stelle genau eine kurze Verstaendnisfrage.',
].join('\n')

export const ENTRY_TEST_PREP_STEPS = [
  'Straton analysiert dein Thema',
  'Straton verarbeitet deine Inhalte',
  'Straton erstellt deinen Einstiegstest',
] as const

export const POST_ENTRY_PREP_STEPS = ['Einstiegstest wird analysiert', 'Kapitel werden generiert'] as const
export const ENTRY_QUIZ_MIN_QUESTIONS = 5
export const ENTRY_QUIZ_MIN_MCQ = 2
export const ENTRY_QUIZ_MAX_GENERATION_ATTEMPTS = 3
export const CHAPTER_GENERATION_TIMEOUT_MS = 90000
export const CHAPTER_GENERATION_MAX_ATTEMPTS = 2
export const ADAPTIVE_CHAPTER_PLACEHOLDER_ID = 'adaptive-weakness-placeholder'
export const ADAPTIVE_CHAPTER_GENERATED_ID = 'adaptive-weakness-generated'

export function validateGeneratedEntryQuiz(quiz: InteractiveQuizPayload): { valid: boolean; reason: string } {
  if (!Array.isArray(quiz.questions) || quiz.questions.length < ENTRY_QUIZ_MIN_QUESTIONS) {
    return {
      valid: false,
      reason: `Der Einstiegstest braucht mindestens ${ENTRY_QUIZ_MIN_QUESTIONS} Fragen.`,
    }
  }

  const mcqQuestions = quiz.questions.filter((question) => question.questionType === 'mcq')
  if (mcqQuestions.length < ENTRY_QUIZ_MIN_MCQ) {
    return {
      valid: false,
      reason: `Der Einstiegstest braucht mindestens ${ENTRY_QUIZ_MIN_MCQ} Multiple-Choice-Fragen.`,
    }
  }

  const firstQuestion = quiz.questions[0]
  if (!firstQuestion || firstQuestion.questionType !== 'mcq') {
    return {
      valid: false,
      reason: 'Die erste Frage muss eine Multiple-Choice-Frage sein.',
    }
  }

  for (let index = 0; index < quiz.questions.length; index += 1) {
    const question = quiz.questions[index]
    if (question.questionType !== 'mcq') {
      continue
    }
    const optionCount = question.options?.length ?? 0
    if (optionCount < 3 || optionCount > 5) {
      return {
        valid: false,
        reason: `MCQ Frage ${index + 1} muss 3-5 Antwortoptionen haben.`,
      }
    }
  }

  return { valid: true, reason: '' }
}

export const DEFAULT_CHAPTER_SESSION: ChapterSession = {
  chapterIndex: 0,
  stepIndex: 0,
  answersByStepId: {},
  feedbackByStepId: {},
  correctnessByStepId: {},
  evaluatedAnswersByStepId: {},
  completedChapterIndexes: [],
}

export function parseLearningChaptersFromText(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) {
    return []
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (Array.isArray(parsed)) {
      return parsed
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 6)
    }
  } catch {
    // fallback to line-based parsing below
  }

  return trimmed
    .split('\n')
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+[\.\)]\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 6)
}

export function parseChapterBlueprintsFromText(raw: string): ChapterBlueprint[] {
  const trimmed = raw.trim()
  if (!trimmed) {
    return []
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map((entry, chapterIndex) => {
        if (!entry || typeof entry !== 'object') {
          return null
        }
        const candidate = entry as Record<string, unknown>
        const title = typeof candidate.title === 'string' ? candidate.title.trim() : ''
        const stepsRaw = Array.isArray(candidate.steps) ? candidate.steps : []
        if (!title || stepsRaw.length === 0) {
          return null
        }
        const steps = stepsRaw
          .map((step, stepIndex) => {
            if (!step || typeof step !== 'object') {
              return null
            }
            const stepCandidate = step as Record<string, unknown>
            const type = stepCandidate.type === 'question' || stepCandidate.type === 'recap' ? stepCandidate.type : 'explanation'
            const id =
              typeof stepCandidate.id === 'string' && stepCandidate.id.trim()
                ? stepCandidate.id.trim()
                : `c${chapterIndex + 1}-s${stepIndex + 1}`
            if (type === 'question') {
              const questionType = stepCandidate.questionType === 'text' ? 'text' : 'mcq'
              const prompt = typeof stepCandidate.prompt === 'string' ? stepCandidate.prompt.trim() : ''
              const hint = typeof stepCandidate.hint === 'string' ? stepCandidate.hint.trim() : undefined
              const explanation =
                typeof stepCandidate.explanation === 'string' ? stepCandidate.explanation.trim() : undefined
              const expectedAnswer =
                typeof stepCandidate.expectedAnswer === 'string' ? stepCandidate.expectedAnswer.trim() : ''
              const acceptableAnswers = Array.isArray(stepCandidate.acceptableAnswers)
                ? stepCandidate.acceptableAnswers
                    .filter((value): value is string => typeof value === 'string')
                    .map((value) => value.trim())
                    .filter(Boolean)
                    .slice(0, 8)
                : []
              const evaluation = stepCandidate.evaluation === 'contains' ? 'contains' : 'exact'

              if (!prompt || !expectedAnswer) {
                return null
              }

              if (questionType === 'mcq') {
                const options = Array.isArray(stepCandidate.options)
                  ? stepCandidate.options
                      .filter((value): value is string => typeof value === 'string')
                      .map((value) => value.trim())
                      .filter(Boolean)
                      .slice(0, 6)
                  : []
                if (options.length < 2) {
                  return null
                }
                return {
                  id,
                  type: 'question' as const,
                  questionType: 'mcq' as const,
                  prompt,
                  options,
                  expectedAnswer,
                  acceptableAnswers,
                  evaluation,
                  hint,
                  explanation,
                } satisfies ChapterStep
              }

              return {
                id,
                type: 'question' as const,
                questionType: 'text' as const,
                prompt,
                expectedAnswer,
                acceptableAnswers,
                evaluation,
                hint,
                explanation,
              } satisfies ChapterStep
            }

            const stepTitle = typeof stepCandidate.title === 'string' ? stepCandidate.title.trim() : ''
            const content = typeof stepCandidate.content === 'string' ? stepCandidate.content.trim() : ''
            const bullets = Array.isArray(stepCandidate.bullets)
              ? stepCandidate.bullets
                  .filter((value): value is string => typeof value === 'string')
                  .map((value) => value.trim())
                  .filter(Boolean)
                  .slice(0, 6)
              : []

            if (!stepTitle || !content) {
              return null
            }

            if (type === 'recap') {
              return { id, type: 'recap', title: stepTitle, content, bullets } satisfies ChapterStep
            }
            return { id, type: 'explanation', title: stepTitle, content, bullets } satisfies ChapterStep
          })
          .filter(Boolean) as ChapterStep[]

        if (steps.length === 0) {
          return null
        }

        const chapterId =
          typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `chapter-${chapterIndex + 1}`
        const description = typeof candidate.description === 'string' ? candidate.description.trim() : ''

        return {
          id: chapterId,
          title,
          description,
          steps,
        } satisfies ChapterBlueprint
      })
      .filter(Boolean)
      .slice(0, 8) as ChapterBlueprint[]
  } catch {
    return []
  }
}

export function buildRichFallbackChapterSteps(title: string, chapterIndex: number): ChapterStep[] {
  return [
    {
      id: `c${chapterIndex + 1}-intro`,
      type: 'explanation',
      title: `Kapitel ${chapterIndex + 1}: ${title}`,
      content: `Dieses Kapitel vertieft das Thema "${title}" praxisnah und strukturiert.`,
      bullets: ['Kernbegriffe verstehen', 'Praxisbezug herstellen', 'Wissen sichern'],
    },
    {
      id: `c${chapterIndex + 1}-q1`,
      type: 'question',
      questionType: 'mcq',
      prompt: `Welche Aussage trifft im Kontext von "${title}" am ehesten zu?`,
      options: [
        'Es geht primaer um oberflaechliche Theorie ohne Anwendung.',
        'Es verbindet Grundlagen mit praktischer Umsetzung.',
        'Es ist nur fuer Experten relevant.',
        'Es hat keinen Bezug zum Lernziel.',
      ],
      expectedAnswer: 'Es verbindet Grundlagen mit praktischer Umsetzung.',
      acceptableAnswers: ['grundlagen mit praktischer umsetzung'],
      evaluation: 'contains',
      hint: 'Achte auf den Zusammenhang zwischen Theorie und Praxis.',
      explanation: 'Das Kapitel verknuepft Grundlagen mit konkreten Anwendungen.',
    },
    {
      id: `c${chapterIndex + 1}-q2`,
      type: 'question',
      questionType: 'text',
      prompt: `Nenne in 1-2 Saetzen, warum "${title}" fuer dein Lernziel wichtig ist.`,
      expectedAnswer: `${title} ist wichtig, weil es zentrale Konzepte erklaert und auf praktische Aufgaben vorbereitet.`,
      acceptableAnswers: ['zentrale konzepte', 'praktische aufgaben', 'lernziel'],
      evaluation: 'contains',
      hint: 'Verbinde Relevanz und Anwendung.',
      explanation: 'Eine gute Antwort nennt Nutzen fuer Verstaendnis und Praxis.',
    },
    {
      id: `c${chapterIndex + 1}-recap`,
      type: 'recap',
      title: 'Kapitel-Zusammenfassung',
      content: `Du hast die wichtigsten Punkte zu "${title}" bearbeitet und gefestigt.`,
      bullets: ['Kernaussagen wiederholt', 'Transfer vorbereitet', 'Naechster Schritt klar'],
    },
  ]
}

export function ensureMinimumChapterDepth(blueprints: ChapterBlueprint[]): ChapterBlueprint[] {
  return blueprints.map((chapter, chapterIndex) => {
    if (chapter.steps.length >= 4) {
      return chapter
    }

    const fallback = buildRichFallbackChapterSteps(chapter.title, chapterIndex)
    return {
      ...chapter,
      steps: fallback,
    }
  })
}

export function collectWeakQuestionSteps(
  blueprints: ChapterBlueprint[],
  session: ChapterSession,
): Extract<ChapterStep, { type: 'question' }>[] {
  const collected: Extract<ChapterStep, { type: 'question' }>[] = []
  for (const chapter of blueprints) {
    for (const step of chapter.steps) {
      if (step.type !== 'question') {
        continue
      }
      const correctness = session.correctnessByStepId[step.id]
      if (correctness === false) {
        collected.push(step)
      }
    }
  }
  return collected
}

export function buildAdaptiveChapterPlaceholder(totalWrongQuestions: number): ChapterBlueprint {
  return {
    id: ADAPTIVE_CHAPTER_PLACEHOLDER_ID,
    title: 'Schwachstellen-Fokus',
    description: 'Adaptives Abschlusskapitel basierend auf deinen bisherigen Antworten',
    steps: [
      {
        id: 'adaptive-placeholder-intro',
        type: 'explanation',
        title: 'Adaptive Auswertung laeuft',
        content:
          totalWrongQuestions > 0
            ? `Straton erstellt gerade ein Kapitel auf Basis von ${totalWrongQuestions} falsch beantworteten Frage(n).`
            : 'Straton erstellt gerade ein adaptives Abschlusskapitel fuer dich.',
        bullets: ['Schwachstellen werden priorisiert', 'Praxisnahe Fragen werden vorbereitet'],
      },
      {
        id: 'adaptive-placeholder-recap',
        type: 'recap',
        title: 'Fast bereit',
        content: 'In wenigen Momenten kannst du mit dem adaptiven Abschlusskapitel starten.',
        bullets: ['Kapitel wird automatisch freigeschaltet', 'Die Fragen werden dann dynamisch generiert'],
      },
    ],
  }
}

export function buildAdaptiveChallengeFallback(
  weakQuestions: Extract<ChapterStep, { type: 'question' }>[],
): ChapterBlueprint {
  const challengeSteps: ChapterStep[] = [
    {
      id: 'adaptive-intro',
      type: 'explanation',
      title: 'Gezielte Wiederholung',
      content:
        'Dieses adaptive Kapitel basiert auf deinen bisherigen Antworten und trainiert deine erkannten Schwachstellen.',
      bullets: ['Gezielte Wiederholung', 'Fokus auf schwierige Punkte', 'Direktes Feedback pro Frage'],
    },
    ...weakQuestions.slice(0, 10).map((step, index) => ({
      ...step,
      id: `adaptive-q${index + 1}`,
    })),
    {
      id: 'adaptive-recap',
      type: 'recap',
      title: 'Abschluss',
      content: 'Stark. Du hast gezielt an deinen schwierigsten Punkten gearbeitet.',
      bullets: ['Fehlerbereiche stabilisiert', 'Lernfortschritt gesichert'],
    },
  ]

  return {
    id: ADAPTIVE_CHAPTER_GENERATED_ID,
    title: 'Schwachstellen-Fokus',
    description: 'Adaptives Abschlusskapitel mit KI-generierten Fragen',
    steps: challengeSteps,
  }
}
