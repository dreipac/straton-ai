import { DEFAULT_SYSTEM_PROMPTS } from '../../../config/systemPromptDefaults'
import type {
  ChapterBlueprint,
  ChapterSession,
  ChapterStep,
  ChapterStepWithoutId,
} from '../services/learn.persistence'
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

/** Regeln fuer Einstiegstest / Kapitel: Fragen an echte Übungsinhalte koppeln, nicht an generische Theorie. */
export const WORKSHEET_EXERCISE_FIDELITY_RULES = [
  'UEBUNGS-TREUE (wenn die Dateiauszuege Übungen, Aufgabenstellungen, Rechenaufgaben, konkrete Werte (z. B. IP/CIDR), Tabellen oder nummerierte Teilfragen enthalten):',
  'Die Fragen und Aufgaben MUESSEN sich auf genau diese Inhalte beziehen: dieselben oder leicht variierten Szenarien, dieselben Zahlen/Netze wo moeglich, gleiche Art von Teilaufgabe (z. B. Subnetzmaske berechnen statt "Hauptfunktion von Subnetting").',
  'VERBOTEN in diesem Fall: reine Definitions- oder "Was ist die Hauptfunktion von ..."-Fragen, wenn im Material bereits konkrete Übungen stehen — ausser EINER optionalen sehr kurzen Grundlagenfrage.',
  'Prioritaet: Aufgaben aus dem Blatt spiegeln (z. B. "Zu Übung 1 mit Netz 192.168.31.0/24: ..."), nicht das Thema nur allgemein abfragen.',
].join('\n')

/**
 * Zusatzregeln fuer JSON-Lernkapitel (Steps): Modelle neigen sonst zu Meta-Fragen nur zum Kapitelnamen.
 */
export const CHAPTER_LEARNING_FIDELITY_RULES = [
  'KAPITEL-INHALT (nicht nur Titel):',
  'Jedes Kapitel muss ein konkretes fachliches Teilthema vertiefen (z. B. Broadcast ermitteln, Praefixlaenge, konkrete Rechnung) — der Titel ist nur die Ueberschrift, nicht der einzige Lerninhalt.',
  'VERBOTEN bei question-Steps (prompt): Fragen, die nur den Kapiteltitel, "dieses Kapitel" oder "das Thema von Kapitel X" abfragen ohne Fachinhalt (z. B. "Worueber handelt dieses Kapitel?", "Was ist das Hauptthema?", "Nenne den Namen des Kapitels").',
  'PFLICHT bei jeder Frage: Der prompt enthaelt pruefbare Details — Begriffe, Zahlen, IP/CIDR, Tabellenwerte, Formeln, Zuordnungen oder kurze Szenarien aus dem Fachgebiet. Mindestens zwei konkrete Anker (z. B. konkrete Adresse, "/24", "Subnetzmaske 255.255.255.0").',
  'Erklaerungs-Steps: Felder "content" und "bullets" liefern echte Erklaerung (Definition, Schrittfolge, Rechnung, Beispiel). VERBOTEN: nur Floskeln wie "In diesem Kapitel lernst du ..." ohne technische Substanz.',
  'Mindestens die Haelfte der Fragen pro Kapitel bezieht sich auf die Materialauszuege und/oder die Zeilen unter "Auswertungsgrundlage" (konkrete Testfragen, Schwachstellen), sobald diese mitgeliefert sind.',
  'Jede Frage soll so formuliert sein, dass sie auch ohne Kenntnis des Kapiteltitels verstaendlich und beantwortbar ist (inhaltlich, nicht metakognitiv).',
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

  const firstQuestion = quiz.questions[0]
  if (!firstQuestion || firstQuestion.questionType !== 'mcq') {
    return {
      valid: false,
      reason: 'Die erste Frage muss eine Multiple-Choice-Frage sein.',
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

/** Platzhalter-Titel aus der Kapitelgenerierung — nicht in Fragen einbetten. */
export function isPlaceholderChapterTitle(title: string): boolean {
  const t = title.trim().toLowerCase()
  if (!t) {
    return true
  }
  return (
    t.includes('schwaechere bereiche') ||
    t.includes('einstiegstest') ||
    t.includes('praxis-transfer') ||
    (t.includes('grundlagen') && t.includes('festigen')) ||
    t.includes('deinem thema')
  )
}

/**
 * Fach- und titelneutrale Schritte (Lernstrategie / Pruefungsvorgehen), damit keine Meta-Fragen
 * zum Kapitelnamen entstehen — dieselben Texte traten vorher in buildRichFallbackChapterSteps auf.
 */
function neutralPadStepTemplates(): ChapterStepWithoutId[] {
  return [
    {
      type: 'explanation',
      title: 'Kurz aktivieren',
      content:
        'Bevor du weitergehst: gutes Lernen haengt weniger vom Kapitelnamen ab als davon, ob du Begriffe aktiv abrufst und in kleinen Schritten uebst.',
      bullets: ['Kurz in eigenen Worten erklaeren', 'Beispiel suchen', 'Fehler als Hinweis nutzen'],
    },
    {
      type: 'question',
      questionType: 'mcq',
      prompt:
        'Was ist eine bewaehrte Strategie, um neues Fachwissen dauerhaft zu sichern — unabhaengig vom aktuellen Kapiteltitel?',
      options: [
        'Nur den Text einmal lesen und nie wiederholen.',
        'Aktiv abfragen, kurz erklaeren und in kleinen Schritten ueben.',
        'Alles am Vorabend auswendig lernen.',
        'Auf Wiederholung komplett verzichten.',
      ],
      expectedAnswer: 'Aktiv abfragen, kurz erklaeren und in kleinen Schritten ueben.',
      acceptableAnswers: ['aktiv abfragen', 'kleinen schritten'],
      evaluation: 'contains',
      hint: 'Denke an aktives Abrufen statt passiven Lesens.',
      explanation: 'Spaced repetition und aktives Erklaeren festigen Wissen nachweislich besser.',
    },
    {
      type: 'question',
      questionType: 'text',
      prompt:
        'Du steckst bei einer Aufgabe fest. Beschreibe in einem Satz einen sinnvollen naechsten Schritt (ohne den Kapiteltitel zu nennen).',
      expectedAnswer: 'Hinweis lesen, Problem in Teilschritte zerlegen, erneut versuchen.',
      acceptableAnswers: ['teilschritte', 'hinweis', 'zerlegen', 'erneut'],
      evaluation: 'contains',
      hint: 'Kleinere Schritte und Nutzung von Hilfen sind typisch sinnvoll.',
      explanation: 'Strukturiert vorgehen reduziert Blockaden.',
    },
    {
      type: 'recap',
      title: 'Mini-Check',
      content: 'Du hast kurze, inhaltsneutrale Uebungen bearbeitet. Im eigentlichen Kapitel geht es um Fachinhalte aus deinen Unterlagen und dem Test.',
      bullets: ['Strategie geuebt', 'Weiter mit fachlichen Schritten'],
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
        : `Dieser Block ergaenzt "${label}" mit kurzen, allgemeinen Uebungen. Fachliche Fragen kommen aus den vorherigen KI-Schritten oder deinen Unterlagen.`,
      bullets: ['Keine Meta-Fragen zum Kapitelnamen', 'Fokus auf Vorgehen und Verstaendnis'],
    },
    ...templates,
  ]
  return assignStepIds(withIntro, chapterIndex, `c${chapterIndex + 1}-fb`)
}

/**
 * Fehlende Schritte auffuellen, ohne bereits generierte KI-Schritte zu verwerfen.
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
