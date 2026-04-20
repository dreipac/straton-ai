import { DEFAULT_SYSTEM_PROMPTS } from '../../../config/systemPromptDefaults'
import type {
  ChapterBlueprint,
  ChapterSession,
  ChapterStep,
  ChapterStepWithoutId,
} from '../services/learn.persistence'
import {
  coerceQuizScalarToString,
  resolveMcqExpectedAnswer,
  type InteractiveQuizPayload,
  type InteractiveQuizQuestion,
} from '../../chat/utils/interactiveQuiz'

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

/** Regeln für Einstiegstest / Kapitel: Fragen an echte Übungsinhalte koppeln, nicht an generische Theorie. */
export const WORKSHEET_EXERCISE_FIDELITY_RULES = [
  'ÜBUNGS-TREUE (wenn die Dateiauszüge Übungen, Aufgabenstellungen, Rechenaufgaben, konkrete Werte (z. B. MWSt-Satz, Beträge, Konten, Rabatte), Tabellen oder nummerierte Teilfragen enthalten):',
  'Die Fragen und Aufgaben MÜSSEN sich auf genau diese Inhalte beziehen: dieselben oder leicht variierten Szenarien, dieselben Zahlen/Beträge wo möglich, gleiche Art von Teilaufgabe (z. B. MWSt berechnen statt "Was ist die Hauptaufgabe der Buchhaltung").',
  'VERBOTEN in diesem Fall: reine Definitions- oder "Was ist die Hauptfunktion von ..."-Fragen, wenn im Material bereits konkrete Übungen stehen — außer EINER optionalen sehr kurzen Grundlagenfrage.',
  'Priorität: Aufgaben aus dem Blatt spiegeln (z. B. "Zu Übung 1 mit Rechnung 2024-0815 und Betrag CHF 1\'240.50: ..."), nicht das Thema nur allgemein abfragen.',
].join('\n')

/**
 * Zusatzregeln für JSON-Lernkapitel (Steps): Modelle neigen sonst zu Meta-Fragen nur zum Kapitelnamen.
 */
export const CHAPTER_LEARNING_FIDELITY_RULES = [
  'KAPITEL-INHALT (nicht nur Titel):',
  'Wenn «Materialauszüge» oder «PERSÖNLICHE UNTERLAGEN» im Prompt vorkommen: behandle sie als primäre Wahrheit — Begriffe, Zahlen, Tabellen und Aufgabenstellungen aus den Dateien vor generischen KV-Beispielen.',
  'Jedes Kapitel muss ein konkretes fachliches Teilthema vertiefen (z. B. MWSt berechnen, Konten zuordnen, Geschäftsbrief formuliert prüfen, konkrete Rechnungsposition) — der Titel ist nur die Überschrift, nicht der einzige Lerninhalt.',
  'VERBOTEN bei question-Steps (prompt): Fragen, die nur den Kapiteltitel, "dieses Kapitel" oder "das Thema von Kapitel X" abfragen ohne Fachinhalt (z. B. "Worüber handelt dieses Kapitel?", "Was ist das Hauptthema?", "Nenne den Namen des Kapitels").',
  'PFLICHT bei jeder Frage: Der prompt enthält prüfbare Details — Begriffe, Zahlen, Beträge, Tabellenwerte, Formeln, Zuordnungen oder kurze Szenarien aus dem kaufmännischen Fachgebiet (KV). Mindestens zwei konkrete Anker (z. B. konkreter Betrag, MWSt-Satz "8.1%", Kontonummer, Position in der Rechnung).',
  'Erklärungs-Steps: Felder "content" und "bullets" liefern echte Erklärung (Definition, Schrittfolge, Rechnung, Beispiel). VERBOTEN: nur Floskeln wie "In diesem Kapitel lernst du ..." ohne technische Substanz.',
  'Mindestens die Hälfte der Fragen pro Kapitel bezieht sich auf die Materialauszüge und/oder die Zeilen unter "Auswertungsgrundlage" (konkrete Testfragen, Schwachstellen), sobald diese mitgeliefert sind — unabhängig vom Fragetyp (mcq, text, match, true_false).',
  'Jede Frage soll so formuliert sein, dass sie auch ohne Kenntnis des Kapiteltitels verständlich und beantwortbar ist (inhaltlich, nicht metakognitiv).',
].join('\n')

/** Fallback; Laufzeit nutzt DB/Kontext bevorzugt. */
export const LEARN_TUTOR_SYSTEM_PROMPT = DEFAULT_SYSTEM_PROMPTS.learn_tutor

export const ENTRY_TEST_PREP_STEPS = [
  'Straton analysiert dein Thema',
  'Straton verarbeitet deine Inhalte',
  'Straton erstellt deinen Einstiegstest',
] as const

export const POST_ENTRY_PREP_STEPS = ['Einstiegstest wird analysiert', 'Kapitel werden generiert'] as const
export const ENTRY_QUIZ_MIN_QUESTIONS = 5
export const ENTRY_QUIZ_MIN_MCQ = 2
export const ENTRY_QUIZ_MAX_GENERATION_ATTEMPTS = 3
/** Client-seitiges Maximum für eine KI-Kapitelgenerierung (großes JSON, Sonnet — 90s war oft zu knapp). */
export const CHAPTER_GENERATION_TIMEOUT_MS = 180000
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

  const textCount = quiz.questions.filter((q) => q.questionType === 'text').length
  const matchOrTfCount = quiz.questions.filter(
    (q) => q.questionType === 'match' || q.questionType === 'true_false',
  ).length
  if (textCount < 1) {
    return {
      valid: false,
      reason: 'Der Einstiegstest braucht mindestens eine Freitext-Frage (questionType "text").',
    }
  }
  if (matchOrTfCount < 1) {
    return {
      valid: false,
      reason: 'Der Einstiegstest braucht mindestens eine Zuordnungs- (match) oder Wahr/Falsch-Frage (true_false).',
    }
  }

  const firstQuestion = quiz.questions[0]
  if (!firstQuestion || (firstQuestion.questionType !== 'mcq' && firstQuestion.questionType !== 'true_false')) {
    return {
      valid: false,
      reason: 'Die erste Frage muss Multiple-Choice (mcq) oder Wahr/Falsch (true_false) sein.',
    }
  }
  if (firstQuestion.questionType === 'mcq') {
    const n = firstQuestion.options?.length ?? 0
    if (n < 3 || n > 5) {
      return {
        valid: false,
        reason: 'Die erste Frage (MCQ) muss 3-5 Antwortoptionen haben.',
      }
    }
  }

  for (let index = 0; index < quiz.questions.length; index += 1) {
    const question = quiz.questions[index]
    if (question.questionType === 'match') {
      const left = question.matchLeft ?? []
      const right = question.matchRight ?? []
      if (left.length < 2 || left.length !== right.length) {
        return {
          valid: false,
          reason: `Zuordnungsfrage ${index + 1} braucht gleich lange matchLeft/matchRight (mindestens 2 Paare).`,
        }
      }
      continue
    }
    if (question.questionType === 'true_false') {
      continue
    }
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

/** Kapitelfrage für gemeinsame Auswertung mit {@link evaluateInteractiveAnswer}. */
export function chapterQuestionToInteractiveQuestion(
  step: Extract<ChapterStep, { type: 'question' }>,
): InteractiveQuizQuestion {
  if (step.questionType === 'match' && step.matchLeft && step.matchRight) {
    return {
      id: step.id,
      prompt: step.prompt,
      questionType: 'match',
      matchLeft: step.matchLeft,
      matchRight: step.matchRight,
      expectedAnswer: step.expectedAnswer,
      acceptableAnswers: step.acceptableAnswers ?? [],
      evaluation: 'exact',
      hint: step.hint,
      explanation: step.explanation,
    }
  }
  if (step.questionType === 'true_false') {
    return {
      id: step.id,
      prompt: step.prompt,
      questionType: 'true_false',
      options: step.options ?? ['Wahr', 'Falsch'],
      expectedAnswer: step.expectedAnswer,
      acceptableAnswers: step.acceptableAnswers ?? [],
      evaluation: 'exact',
      hint: step.hint,
      explanation: step.explanation,
    }
  }
  if (step.questionType === 'mcq') {
    const opts = step.options ?? []
    return {
      id: step.id,
      prompt: step.prompt,
      questionType: 'mcq',
      options: step.options,
      expectedAnswer: opts.length > 0 ? resolveMcqExpectedAnswer(step.expectedAnswer, opts) : step.expectedAnswer,
      acceptableAnswers:
        opts.length > 0 ? (step.acceptableAnswers ?? []).map((a) => resolveMcqExpectedAnswer(a, opts)) : step.acceptableAnswers ?? [],
      evaluation: step.evaluation === 'contains' ? 'contains' : 'exact',
      hint: step.hint,
      explanation: step.explanation,
    }
  }
  return {
    id: step.id,
    prompt: step.prompt,
    questionType: 'text',
    expectedAnswer: step.expectedAnswer,
    acceptableAnswers: step.acceptableAnswers ?? [],
    evaluation: step.evaluation === 'contains' ? 'contains' : 'exact',
    hint: step.hint,
    explanation: step.explanation,
  }
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

/**
 * Prepares model output for JSON.parse: strips ```json … ``` fences and isolates a top-level `[...]` array.
 */
export function normalizeJsonArrayPayload(raw: string): string {
  let s = raw.trim()
  if (!s) {
    return ''
  }
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenceMatch?.[1]) {
    s = fenceMatch[1].trim()
  }
  if (s.startsWith('[')) {
    return s
  }
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start !== -1 && end > start) {
    return s.slice(start, end + 1)
  }
  return s
}

/** True if the string looks like a JSON/markdown fragment mistakenly used as a title (e.g. legacy line-split bug). */
export function looksLikeJsonSyntaxGarbage(title: string): boolean {
  const t = title.trim()
  if (!t) {
    return true
  }
  if (/^```/.test(t)) {
    return true
  }
  if (/^[`[\]{}\s'",:]+$/.test(t)) {
    return true
  }
  if (/^["']?id["']?\s*:/i.test(t)) {
    return true
  }
  if (t === '[' || t === '{' || t === '}' || t === ']') {
    return true
  }
  return false
}

export function sanitizeChapterTitleForUi(title: string, index: number, topicFallback: string): string {
  const tf = topicFallback.trim()
  if (!looksLikeJsonSyntaxGarbage(title)) {
    return title.trim()
  }
  return tf ? `Kapitel ${index + 1}: ${tf}` : `Kapitel ${index + 1}`
}

export function sanitizeChapterTitlesForUi(titles: string[], topicFallback: string): string[] {
  return titles.map((title, index) => sanitizeChapterTitleForUi(title, index, topicFallback))
}

export function parseLearningChaptersFromText(raw: string): string[] {
  const normalized = normalizeJsonArrayPayload(raw)
  if (!normalized) {
    return []
  }

  try {
    const parsed = JSON.parse(normalized) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    const titles: string[] = []
    for (const entry of parsed) {
      if (typeof entry === 'string') {
        const t = entry.trim()
        if (t) {
          titles.push(t)
        }
      } else if (entry && typeof entry === 'object') {
        const rec = entry as Record<string, unknown>
        const title = typeof rec.title === 'string' ? rec.title.trim() : ''
        if (title) {
          titles.push(title)
        }
      }
    }
    return titles.slice(0, 6)
  } catch {
    return []
  }
}

export function parseChapterBlueprintsFromText(raw: string): ChapterBlueprint[] {
  const normalized = normalizeJsonArrayPayload(raw)
  if (!normalized) {
    return []
  }
  try {
    const parsed = JSON.parse(normalized) as unknown
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
              const prompt = typeof stepCandidate.prompt === 'string' ? stepCandidate.prompt.trim() : ''
              const hint = typeof stepCandidate.hint === 'string' ? stepCandidate.hint.trim() : undefined
              const explanation =
                typeof stepCandidate.explanation === 'string' ? stepCandidate.explanation.trim() : undefined
              const acceptableAnswers = Array.isArray(stepCandidate.acceptableAnswers)
                ? stepCandidate.acceptableAnswers
                    .map((value) => coerceQuizScalarToString(value))
                    .filter(Boolean)
                    .slice(0, 8)
                : []
              const evaluation = stepCandidate.evaluation === 'contains' ? 'contains' : 'exact'

              const matchLeft = Array.isArray(stepCandidate.matchLeft)
                ? stepCandidate.matchLeft
                    .filter((value): value is string => typeof value === 'string')
                    .map((value) => value.trim())
                    .filter(Boolean)
                : []
              const matchRight = Array.isArray(stepCandidate.matchRight)
                ? stepCandidate.matchRight
                    .filter((value): value is string => typeof value === 'string')
                    .map((value) => value.trim())
                    .filter(Boolean)
                : []
              const wantsMatch =
                stepCandidate.questionType === 'match' ||
                (matchLeft.length >= 2 && matchLeft.length === matchRight.length && prompt.length > 0)

              if (wantsMatch && matchLeft.length === matchRight.length && matchLeft.length >= 2 && prompt) {
                const n = matchLeft.length
                const canonicalExpected = Array.from({ length: n }, (_, i) => String(i)).join(',')
                const expectedAnswer =
                  typeof stepCandidate.expectedAnswer === 'string' && stepCandidate.expectedAnswer.trim()
                    ? stepCandidate.expectedAnswer.trim()
                    : canonicalExpected
                return {
                  id,
                  type: 'question' as const,
                  questionType: 'match' as const,
                  prompt,
                  matchLeft,
                  matchRight,
                  expectedAnswer,
                  acceptableAnswers,
                  evaluation: 'exact',
                  hint,
                  explanation,
                } satisfies ChapterStep
              }

              const qtf =
                stepCandidate.questionType === 'true_false' ||
                stepCandidate.questionType === 'boolean' ||
                stepCandidate.type === 'true_false'
              const expectedTfRaw = coerceQuizScalarToString(stepCandidate.expectedAnswer)
              if (qtf && prompt && expectedTfRaw) {
                const lower = expectedTfRaw.toLowerCase()
                const truthy = new Set(['wahr', 'true', 't', 'ja', 'yes', '1', 'richtig', 'korrekt'])
                const falsy = new Set(['falsch', 'false', 'f', 'nein', 'no', '0'])
                let norm: 'Wahr' | 'Falsch' | null = null
                if (truthy.has(lower)) {
                  norm = 'Wahr'
                } else if (falsy.has(lower)) {
                  norm = 'Falsch'
                }
                if (!norm) {
                  return null
                }
                return {
                  id,
                  type: 'question' as const,
                  questionType: 'true_false' as const,
                  prompt,
                  options: ['Wahr', 'Falsch'],
                  expectedAnswer: norm,
                  acceptableAnswers,
                  evaluation: 'exact',
                  hint,
                  explanation,
                } satisfies ChapterStep
              }

              const expectedAnswer = coerceQuizScalarToString(stepCandidate.expectedAnswer)
              if (!prompt || !expectedAnswer) {
                return null
              }

              const declaredMcq = stepCandidate.questionType === 'mcq'
              const options = Array.isArray(stepCandidate.options)
                ? stepCandidate.options
                    .filter((value): value is string => typeof value === 'string')
                    .map((value) => value.trim())
                    .filter(Boolean)
                    .slice(0, 6)
                : []
              if (declaredMcq || options.length >= 2) {
                if (options.length < 2) {
                  return null
                }
                return {
                  id,
                  type: 'question' as const,
                  questionType: 'mcq' as const,
                  prompt,
                  options,
                  expectedAnswer: resolveMcqExpectedAnswer(expectedAnswer, options),
                  acceptableAnswers: acceptableAnswers?.map((a) => resolveMcqExpectedAnswer(a, options)),
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

/** Platzhalter-Titel aus der Kapitelgenerierung — nicht in Fragen einbetten. */
export function isPlaceholderChapterTitle(title: string): boolean {
  const t = title.trim().toLowerCase()
  if (!t) {
    return true
  }
  return (
    t.includes('schwächere bereiche') ||
    t.includes('einstiegstest') ||
    t.includes('praxis-transfer') ||
    (t.includes('grundlagen') && t.includes('festigen')) ||
    t.includes('deinem thema')
  )
}

/**
 * Fach- und titelneutrale Schritte (Lernstrategie / Prüfungsvorgehen), damit keine Meta-Fragen
 * zum Kapitelnamen entstehen — dieselben Texte traten vorher in buildRichFallbackChapterSteps auf.
 */
function neutralPadStepTemplates(): ChapterStepWithoutId[] {
  return [
    {
      type: 'explanation',
      title: 'Kurz aktivieren',
      content:
        'Bevor du weitergehst: gutes Lernen hängt weniger vom Kapitelnamen ab als davon, ob du Begriffe aktiv abrufst und in kleinen Schritten übst.',
      bullets: ['Kurz in eigenen Worten erklären', 'Beispiel suchen', 'Fehler als Hinweis nutzen'],
    },
    {
      type: 'question',
      questionType: 'mcq',
      prompt:
        'Was ist eine bewährte Strategie, um neues Fachwissen dauerhaft zu sichern — unabhängig vom aktuellen Kapiteltitel?',
      options: [
        'Nur den Text einmal lesen und nie wiederholen.',
        'Aktiv abfragen, kurz erklären und in kleinen Schritten ueben.',
        'Alles am Vorabend auswendig lernen.',
        'Auf Wiederholung komplett verzichten.',
      ],
      expectedAnswer: 'Aktiv abfragen, kurz erklären und in kleinen Schritten ueben.',
      acceptableAnswers: ['aktiv abfragen', 'kleinen schritten'],
      evaluation: 'contains',
      hint: 'Denke an aktives Abrufen statt passiven Lesens.',
      explanation: 'Spaced repetition und aktives Erklären festigen Wissen nachweislich besser.',
    },
    {
      type: 'question',
      questionType: 'text',
      prompt:
        'Du steckst bei einer Aufgabe fest. Beschreibe in einem Satz einen sinnvollen nächsten Schritt (ohne den Kapiteltitel zu nennen).',
      expectedAnswer: 'Hinweis lesen, Problem in Teilschritte zerlegen, erneut versuchen.',
      acceptableAnswers: ['teilschritte', 'hinweis', 'zerlegen', 'erneut'],
      evaluation: 'contains',
      hint: 'Kleinere Schritte und Nutzung von Hilfen sind typisch sinnvoll.',
      explanation: 'Strukturiert vorgehen reduziert Blockaden.',
    },
    {
      type: 'recap',
      title: 'Mini-Check',
      content: 'Du hast kurze, inhaltsneutrale Übungen bearbeitet. Im eigentlichen Kapitel geht es um Fachinhalte aus deinen Unterlagen und dem Test.',
      bullets: ['Strategie geübt', 'Weiter mit fachlichen Schritten'],
    },
  ]
}

function assignStepIds(steps: ChapterStepWithoutId[], _chapterIndex: number, idPrefix: string): ChapterStep[] {
  return steps.map((step, i) => ({
    ...step,
    id: `${idPrefix}-${i}`,
  })) as ChapterStep[]
}

/** Voller Ersatz nur wenn wirklich keine Schritte vorhanden (z. B. leeres Parse-Ergebnis). */
export function buildRichFallbackChapterSteps(title: string, chapterIndex: number): ChapterStep[] {
  const label = isPlaceholderChapterTitle(title) ? 'diesem Lernabschnitt' : title.trim()
  const templates = neutralPadStepTemplates()
  const withIntro: ChapterStepWithoutId[] = [
    {
      type: 'explanation',
      title: `Kapitel ${chapterIndex + 1}`,
      content: isPlaceholderChapterTitle(title)
        ? 'Die automatische Kapitelerstellung hat hier wenig Inhalt geliefert. Die folgenden Schritte sind bewusst fachneutral (Lernstrategie), bis echte Inhalte nachgeneriert werden.'
        : `Dieser Block ergänzt "${label}" mit kurzen, allgemeinen Übungen. Fachliche Fragen kommen aus den vorherigen KI-Schritten oder deinen Unterlagen.`,
      bullets: ['Keine Meta-Fragen zum Kapitelnamen', 'Fokus auf Vorgehen und Verständnis'],
    },
    ...templates,
  ]
  return assignStepIds(withIntro, chapterIndex, `c${chapterIndex + 1}-fb`)
}

/**
 * Fehlende Schritte auffüllen, ohne bereits generierte KI-Schritte zu verwerfen.
 */
function buildPaddingSteps(chapterIndex: number, existingCount: number, needed: number): ChapterStep[] {
  const pool = neutralPadStepTemplates()
  const out: ChapterStep[] = []
  for (let i = 0; i < needed; i += 1) {
    const tmpl = pool[i % pool.length]!
    out.push({
      ...tmpl,
      id: `c${chapterIndex + 1}-pad-${existingCount + i}`,
    } as ChapterStep)
  }
  return out
}

export function ensureMinimumChapterDepth(blueprints: ChapterBlueprint[]): ChapterBlueprint[] {
  return blueprints.map((chapter, chapterIndex) => {
    if (chapter.steps.length >= 4) {
      return chapter
    }
    if (chapter.steps.length === 0) {
      return {
        ...chapter,
        steps: buildRichFallbackChapterSteps(chapter.title, chapterIndex),
      }
    }
    const needed = 4 - chapter.steps.length
    return {
      ...chapter,
      steps: [...chapter.steps, ...buildPaddingSteps(chapterIndex, chapter.steps.length, needed)],
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
        title: 'Adaptive Auswertung läuft',
        content:
          totalWrongQuestions > 0
            ? `Straton erstellt gerade ein Kapitel auf Basis von ${totalWrongQuestions} falsch beantworteten Frage(n).`
            : 'Straton erstellt gerade ein adaptives Abschlusskapitel für dich.',
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
