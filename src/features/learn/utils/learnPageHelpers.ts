import { DEFAULT_SYSTEM_PROMPTS } from '../../../config/systemPromptDefaults'
import type {
  ChapterBlueprint,
  ChapterSession,
  ChapterStep,
  ChapterStepWithoutId,
  EntryQuizResult,
  LearnFlashcardSet,
  LearnWorksheetItem,
  LearningPathSummary,
} from '../services/learn.persistence'
import {
  coerceQuizScalarToString,
  isMatchAnswerComplete,
  resolveMcqExpectedAnswer,
  type InteractiveQuizPayload,
  type InteractiveQuizQuestion,
} from '../../chat/utils/interactiveQuiz'

export function getDisplayPathTitle(title: string) {
  const trimmed = title.trim()
  return trimmed ? trimmed : 'Neuer Lernpfad'
}

export function sortLearningPathsByCreatedAt(paths: LearningPathSummary[]): LearningPathSummary[] {
  return [...paths].sort((a, b) => {
    if (a.isPending && !b.isPending) {
      return -1
    }
    if (!a.isPending && b.isPending) {
      return 1
    }
    return b.createdAt.localeCompare(a.createdAt)
  })
}

export const PENDING_LEARNING_PATH_ID_PREFIX = 'pending-'

export function isPendingLearningPathId(pathId: string): boolean {
  return pathId.startsWith(PENDING_LEARNING_PATH_ID_PREFIX)
}

export function createPendingLearningPathSummary(userId: string): LearningPathSummary {
  const now = new Date().toISOString()
  const sidebarListKey = `learn-path-slot-${crypto.randomUUID()}`
  return {
    id: `${PENDING_LEARNING_PATH_ID_PREFIX}${crypto.randomUUID()}`,
    userId,
    title: 'Neuer Lernpfad',
    createdAt: now,
    updatedAt: now,
    isPending: true,
    sidebarListKey,
  }
}

/** Unbearbeiteter Lernpfad (nur Setup-Schritt 1, kein Inhalt) — darf auto-entfernt werden. */
export type LearningPathEmptyCheckInput = {
  topic: string
  selectedTopic: string
  aiGuidance?: string
  proficiencyLevel?: '' | 'low' | 'medium' | 'high'
  topicSuggestions?: readonly string[]
  isSetupComplete: boolean
  setupStep: 1 | 2 | 3 | 4
  materials: readonly unknown[]
  tutorMessages: readonly unknown[]
  entryQuiz: unknown | null
  entryQuizResult: unknown | null
  chapterBlueprints: readonly unknown[]
  learningChapters: readonly string[]
  learnFlashcardSets?: readonly LearnFlashcardSet[]
  learnWorksheets: readonly unknown[]
}

export function isLearningPathEmpty(input: LearningPathEmptyCheckInput): boolean {
  if (input.isSetupComplete) {
    return false
  }
  if (input.setupStep !== 1) {
    return false
  }
  if (input.topic.trim() || input.selectedTopic.trim()) {
    return false
  }
  if ((input.aiGuidance ?? '').trim()) {
    return false
  }
  if (input.proficiencyLevel) {
    return false
  }
  if ((input.topicSuggestions ?? []).some((s) => s.trim())) {
    return false
  }
  if (input.materials.length > 0) {
    return false
  }
  if (input.tutorMessages.length > 0) {
    return false
  }
  if (input.entryQuiz) {
    return false
  }
  if (input.entryQuizResult) {
    return false
  }
  if (input.chapterBlueprints.length > 0) {
    return false
  }
  if (input.learningChapters.some((chapter) => chapter.trim())) {
    return false
  }
  if (input.learnWorksheets.length > 0) {
    return false
  }
  if ((input.learnFlashcardSets ?? []).some((set) => set.cards.length > 0)) {
    return false
  }
  return true
}

/** Max. Aufgaben pro KI-Lernblatt (Anzahl wählt die KI bis zu diesem Limit). */
export const LEARN_WORKSHEET_MIN_QUESTIONS = 6
export const LEARN_WORKSHEET_MAX_QUESTIONS = 8
export const LEARN_WORKSHEET_MAX_GENERATION_ATTEMPTS = 3
export const LEARN_WORKSHEET_MIN_MCQ = 2
export const LEARN_WORKSHEET_MIN_TEXT = 1
export const LEARN_WORKSHEET_MAX_PROMPT_CHARS = 280
/** Kürzerer Kontext als Flashcards — fokussiert auf Schwachstellen statt Volltext. */
export const LEARN_WORKSHEET_OUTLINE_MAX_CHARS = 8000

export const WORKSHEET_COMPACT_RULES = [
  'KOMPAKT-REGELN (verbindlich):',
  'Erzeuge 6–8 Aufgaben — jede Aufgabe genau EIN prüfbares Lernziel.',
  'prompt: maximal 2 kurze Sätze, höchstens 280 Zeichen — keine Aufzählungslisten mit vielen Begriffen in EINER Aufgabe.',
  'VERBOTEN: «Erkläre/Nenne folgende Begriffe: …» mit mehr als 3 Begriffen; nummerierte Mega-Listen; Glossar-Wiederholung des ganzen Kapitels.',
  'Fragetypen mischen: mindestens 2× mcq, 1× text (kurze Antwort, 1–3 Sätze), 1× match oder true_false.',
  'Freitext (text): prompt verlangt explizit kurze Antwort (1–3 Sätze), nicht Essay.',
  'Jede Aufgabe braucht expectedAnswer, hint (1 Satz ohne Lösung), evaluation ("exact" oder "contains").',
  'MCQ: 3–5 Optionen; true_false: expectedAnswer «Wahr» oder «Falsch»; match: gleich lange matchLeft/matchRight.',
  'SKILL-TAG (Pflicht je Aufgabe): Feld "skillTag" mit kurzem Konzept-Slug in Kleinbuchstaben mit Bindestrichen (z. B. "mwst-berechnung"). Verwende für dieselbe Teilkompetenz immer denselben skillTag wie in den Kapiteln/Lernkarten.',
].join('\n')

export const WORKSHEET_JSON_SCHEMA_EXAMPLE =
  '[{"id":"ws1","prompt":"Welche Aussage zur MWSt in der Schweiz trifft zu?","questionType":"mcq","options":["8.1% Normalsteuersatz","2.6% auf alle Leistungen","Keine MWSt auf Dienstleistungen","Nur Export MWSt-pflichtig"],"expectedAnswer":"8.1% Normalsteuersatz","acceptableAnswers":[],"evaluation":"exact","hint":"Denk an den üblichen Normalsteuersatz.","explanation":"...","skillTag":"mwst-saetze"},{"id":"ws2","prompt":"Ordne Begriff und Definition zu.","questionType":"match","matchLeft":["Steuerhoheit","Mehrwertsteuer"],"matchRight":["Hoheitliche Erhebung","Umsatzbesteuerung"],"expectedAnswer":"0,1","evaluation":"exact","hint":"...","skillTag":"steuer-grundbegriffe"}]'

const WORKSHEET_PRIORITY_SECTION_MARKERS = [
  'ANWEISUNG:',
  '### Dein Lernverlauf',
  '### Falsch beantwortet',
  '### Konkrete Fehlermuster',
  '### Adaptives Schwächen-Kapitel',
  '### Lernkarten mit Unsicherheit',
  '### Abgegebene Arbeitsblatt-Antworten',
  'PERSÖNLICHE UNTERLAGEN',
  'Dateiauszüge',
] as const

/** Outline für Lernblatt-Generierung: Schwachstellen/Material zuerst, Gesamtlänge begrenzen. */
export function trimOutlineForWorksheetGeneration(outline: string): string {
  const trimmed = outline.trim()
  if (!trimmed) {
    return ''
  }
  if (trimmed.length <= LEARN_WORKSHEET_OUTLINE_MAX_CHARS) {
    return trimmed
  }

  const sections: string[] = []
  let current = ''
  for (const line of trimmed.split('\n')) {
    if (line.startsWith('### ') || line.startsWith('ANWEISUNG:') || line.startsWith('---')) {
      if (current.trim()) {
        sections.push(current.trim())
      }
      current = line
    } else {
      current = current ? `${current}\n${line}` : line
    }
  }
  if (current.trim()) {
    sections.push(current.trim())
  }

  const scoreSection = (section: string): number => {
    for (let i = 0; i < WORKSHEET_PRIORITY_SECTION_MARKERS.length; i += 1) {
      if (section.startsWith(WORKSHEET_PRIORITY_SECTION_MARKERS[i]!)) {
        return WORKSHEET_PRIORITY_SECTION_MARKERS.length - i
      }
    }
    if (section.includes('Dateiauszüge') || section.includes('PERSÖNLICHE UNTERLAGEN')) {
      return WORKSHEET_PRIORITY_SECTION_MARKERS.length
    }
    return 0
  }

  const sorted = [...sections].sort((a, b) => scoreSection(b) - scoreSection(a))
  const picked: string[] = []
  let used = 0
  for (const section of sorted) {
    const nextLen = used + section.length + (picked.length > 0 ? 2 : 0)
    if (nextLen > LEARN_WORKSHEET_OUTLINE_MAX_CHARS) {
      const remaining = LEARN_WORKSHEET_OUTLINE_MAX_CHARS - used - (picked.length > 0 ? 2 : 0)
      if (remaining > 400) {
        picked.push(`${section.slice(0, remaining)}\n[…gekürzt]`)
      }
      break
    }
    picked.push(section)
    used = nextLen
  }

  const result = picked.join('\n\n').trim()
  return result || `${trimmed.slice(0, LEARN_WORKSHEET_OUTLINE_MAX_CHARS)}\n\n[…gekürzt]`
}

function worksheetLooksLikeLaundryList(prompt: string): boolean {
  const numbered = (prompt.match(/\d+[.)]\s/g) ?? []).length
  if (numbered >= 4) {
    return true
  }
  const lower = prompt.toLowerCase()
  if (/folgende|alle begriffe|nennen sie|erkläre alle|liste der/.test(lower)) {
    const separators = prompt.split(/[,;]/).length
    if (separators >= 5) {
      return true
    }
  }
  return false
}

export function validateGeneratedWorksheet(items: LearnWorksheetItem[]): { valid: boolean; reason: string } {
  if (items.length < LEARN_WORKSHEET_MIN_QUESTIONS) {
    return {
      valid: false,
      reason: `Das Lernblatt braucht mindestens ${LEARN_WORKSHEET_MIN_QUESTIONS} Aufgaben.`,
    }
  }
  if (items.length > LEARN_WORKSHEET_MAX_QUESTIONS) {
    return {
      valid: false,
      reason: `Das Lernblatt darf höchstens ${LEARN_WORKSHEET_MAX_QUESTIONS} Aufgaben haben.`,
    }
  }

  const typed = items.filter((item) => item.questionType)
  if (typed.length < items.length) {
    return {
      valid: false,
      reason: 'Jede Aufgabe braucht questionType (mcq, text, match oder true_false).',
    }
  }

  const mcqCount = items.filter((item) => item.questionType === 'mcq').length
  if (mcqCount < LEARN_WORKSHEET_MIN_MCQ) {
    return {
      valid: false,
      reason: `Das Lernblatt braucht mindestens ${LEARN_WORKSHEET_MIN_MCQ} Multiple-Choice-Aufgaben.`,
    }
  }

  const textCount = items.filter((item) => item.questionType === 'text').length
  if (textCount < LEARN_WORKSHEET_MIN_TEXT) {
    return {
      valid: false,
      reason: 'Das Lernblatt braucht mindestens eine kurze Freitext-Aufgabe (questionType "text").',
    }
  }

  const matchOrTfCount = items.filter(
    (item) => item.questionType === 'match' || item.questionType === 'true_false',
  ).length
  if (matchOrTfCount < 1) {
    return {
      valid: false,
      reason: 'Das Lernblatt braucht mindestens eine Zuordnungs- (match) oder Wahr/Falsch-Aufgabe.',
    }
  }

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const prompt = item.prompt.trim()
    if (!prompt) {
      return { valid: false, reason: `Aufgabe ${index + 1} braucht einen prompt.` }
    }
    if (prompt.length > LEARN_WORKSHEET_MAX_PROMPT_CHARS) {
      return {
        valid: false,
        reason: `Aufgabe ${index + 1} ist zu lang (${prompt.length} Zeichen, max ${LEARN_WORKSHEET_MAX_PROMPT_CHARS}).`,
      }
    }
    if (worksheetLooksLikeLaundryList(prompt)) {
      return {
        valid: false,
        reason: `Aufgabe ${index + 1} ist eine Sammel-/Listen-Aufgabe — pro Aufgabe nur ein Lernziel.`,
      }
    }
    if (!item.expectedAnswer?.trim()) {
      return { valid: false, reason: `Aufgabe ${index + 1} braucht expectedAnswer.` }
    }
    if (!item.hint?.trim()) {
      return { valid: false, reason: `Aufgabe ${index + 1} braucht hint.` }
    }

    if (item.questionType === 'match') {
      const left = item.matchLeft ?? []
      const right = item.matchRight ?? []
      if (left.length < 2 || left.length !== right.length) {
        return {
          valid: false,
          reason: `Zuordnungsaufgabe ${index + 1} braucht gleich lange matchLeft/matchRight (mindestens 2 Paare).`,
        }
      }
      continue
    }

    if (item.questionType === 'mcq') {
      const optionCount = item.options?.length ?? 0
      if (optionCount < 3 || optionCount > 5) {
        return {
          valid: false,
          reason: `MCQ Aufgabe ${index + 1} muss 3-5 Antwortoptionen haben.`,
        }
      }
    }
  }

  return { valid: true, reason: '' }
}

export function learnWorksheetItemFromQuestion(question: InteractiveQuizQuestion): LearnWorksheetItem {
  return {
    id: question.id,
    prompt: question.prompt,
    questionType: question.questionType,
    matchLeft: question.matchLeft,
    matchRight: question.matchRight,
    options: question.options,
    expectedAnswer: question.expectedAnswer,
    acceptableAnswers: question.acceptableAnswers,
    hint: question.hint,
    explanation: question.explanation,
    evaluation: question.evaluation,
  }
}

export function buildWorksheetGenerationUserPrompt(args: {
  outline: string
  validationHint?: string
}): string {
  const lines = [
    'Erstelle jetzt ein Lernblatt (Arbeitsblatt) als JSON-Array mit 6–8 Aufgaben.',
    'Antwortformat: NUR valides JSON-Array — kein Markdown, kein Fliesstext davor oder danach.',
    `Schema pro Aufgabe (Beispiel): ${WORKSHEET_JSON_SCHEMA_EXAMPLE}`,
    WORKSHEET_EXERCISE_FIDELITY_RULES,
    WORKSHEET_COMPACT_RULES,
    CHAPTER_LEARNING_FIDELITY_RULES,
    'Beziehe dich auf die Schwachstellen und Auszüge unten — wiederhole nicht breit den ganzen Stoff.',
    args.validationHint
      ? `Der vorige Versuch war ungültig: ${args.validationHint} Halte dich strikt an alle Regeln.`
      : 'Halte dich strikt an alle Regeln.',
    `Kontext:\n${args.outline}`,
  ]
  return lines.join('\n\n')
}

/** Kapitel-Index für gemischte Lernblätter nach Lernstand (nicht ein einzelnes Pfad-Kapitel). */
export const MIXED_LEARN_MATERIAL_CHAPTER_INDEX = -1

/** Ab dieser Anzahl abgeschlossener Basis-Kapitel: Lernblätter/Lernkarten nur noch nach Lernstand. */
export const MIXED_LEARN_MATERIAL_MIN_COMPLETED_CHAPTERS = 2

export function countCompletedBaseChapters(
  chapterBlueprints: ChapterBlueprint[],
  chapterSession: ChapterSession,
): number {
  return new Set(
    chapterSession.completedChapterIndexes.filter((index) => index >= 0 && index < chapterBlueprints.length),
  ).size
}

export function shouldUseMixedLearnMaterial(
  chapterBlueprints: ChapterBlueprint[],
  chapterSession: ChapterSession,
): boolean {
  return (
    countCompletedBaseChapters(chapterBlueprints, chapterSession) >= MIXED_LEARN_MATERIAL_MIN_COMPLETED_CHAPTERS
  )
}

export function resolveWorksheetProgressChapterKey(
  chapterBlueprints: ChapterBlueprint[],
  chapterSession: ChapterSession,
  chapterIndex: number,
): number {
  return shouldUseMixedLearnMaterial(chapterBlueprints, chapterSession)
    ? MIXED_LEARN_MATERIAL_CHAPTER_INDEX
    : chapterIndex
}

export function worksheetChapterDisplayLabel(chapterIndex: number, learningChapters: string[]): string {
  if (chapterIndex === MIXED_LEARN_MATERIAL_CHAPTER_INDEX) {
    return 'Lernstand · gemischt'
  }
  return learningChapters[chapterIndex]?.trim() || `Kapitel ${chapterIndex + 1}`
}

/** Fortschritt des Arbeitsblatts zu einem Kapitel (Kreis-Prüfungen). */
export function getWorksheetChapterProgress(items: LearnWorksheetItem[], chapterIndex: number) {
  const chapterItems = items.filter((w) => w.chapterIndex === chapterIndex)
  const evaluatedCount = chapterItems.filter((w) => w.evaluated === true).length
  return {
    total: chapterItems.length,
    evaluatedCount,
    isComplete: chapterItems.length > 0 && evaluatedCount === chapterItems.length,
  }
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
export const CHAPTER_GENERATION_MAX_ATTEMPTS = 3
export const CHAPTER_MIN_QUESTIONS = 4
export const CHAPTER_MIN_QUESTIONS_ADAPTIVE = 6
export const CHAPTER_MIN_MCQ = 2
export const CHAPTER_MIN_TEXT = 1
export const ADAPTIVE_CHAPTER_PLACEHOLDER_ID = 'adaptive-weakness-placeholder'
export const ADAPTIVE_CHAPTER_GENERATED_ID = 'adaptive-weakness-generated'

/** JSON-Schema-Beispiel für Kapitelgenerierung (on-demand + adaptiv). */
export const CHAPTER_JSON_SCHEMA_EXAMPLE =
  '{"id":"chapter-1","title":"...","description":"...","steps":[{"id":"c1-s1","type":"explanation","title":"...","content":"...","bullets":["..."]},{"id":"c1-q1","type":"question","questionType":"mcq","prompt":"...","options":["a","b","c"],"expectedAnswer":"...","acceptableAnswers":[],"evaluation":"exact","hint":"...","explanation":"...","skillTag":"mwst-berechnung"},{"id":"c1-q2","type":"question","questionType":"text","prompt":"...","expectedAnswer":"...","acceptableAnswers":[],"evaluation":"contains","hint":"...","explanation":"...","skillTag":"belege-buchen"},{"id":"c1-q3","type":"question","questionType":"true_false","prompt":"...","expectedAnswer":"Falsch","hint":"...","explanation":"...","skillTag":"kontenrahmen"},{"id":"c1-q4","type":"question","questionType":"match","prompt":"...","matchLeft":["x","y"],"matchRight":["1","2"],"expectedAnswer":"0,1","hint":"...","explanation":"...","skillTag":"konten-zuordnung"},{"id":"c1-recap","type":"recap","title":"...","content":"...","bullets":["..."]}]}'

/** Verbindliche Regel für das Konzept-Tag pro Frage (aggregierte Skill-Mastery über Kapitel hinweg). */
export const CHAPTER_SKILL_TAG_RULE = [
  'SKILL-TAG (Pflicht bei JEDEM question-Step): Feld "skillTag" mit einem kurzen, stabilen Konzept-Slug in Kleinbuchstaben mit Bindestrichen (z. B. "mwst-berechnung", "konten-zuordnung", "geschaeftsbrief-form").',
  'Der skillTag benennt die geprüfte Teilkompetenz, NICHT die Fragenummer und NICHT den Kapiteltitel.',
  'Verwende für gleiche Teilkompetenzen IMMER denselben skillTag — auch über mehrere Kapitel, Lernkarten und Arbeitsblätter hinweg —, damit der Lernfortschritt pro Kompetenz zusammengeführt werden kann.',
  'Maximal 5 verschiedene skillTags pro Kapitel; mehrere Fragen dürfen denselben skillTag teilen.',
].join('\n')

export function buildChapterMaterialSearchQuery(
  effectiveTopic: string,
  selectedTopic: string,
  chapterTopic: string,
): string {
  return [effectiveTopic, selectedTopic, chapterTopic, 'Übung Aufgabe Berechnung Teilaufgabe Beispiel']
    .filter(Boolean)
    .join(' ')
    .trim()
}

export function getChapterMaterialRagOptions(materialCount: number) {
  return materialCount > 0
    ? {
        maxChunks: materialCount > 2 ? 14 : 11,
        maxChars: materialCount > 2 ? 10_000 : 8200,
        denseChunks: true,
        emphasizePersonalSources: true,
      }
    : { maxChunks: 10, maxChars: 6500 }
}

export function buildEntryQuizInsightForChapter(
  entryQuiz: InteractiveQuizPayload | null,
  entryQuizResult: EntryQuizResult | null,
): string {
  if (!entryQuiz || !entryQuizResult) {
    return 'Einstiegstest: noch nicht ausgewertet — nutze Material und Thema als Grundlage.'
  }
  const lines = [`Einstiegstest-Ergebnis: ${entryQuizResult.score}/${entryQuizResult.total} richtig.`]
  const wrong = entryQuiz.questions.filter((q) => entryQuizResult.correctnessByQuestionId?.[q.id] === false)
  if (wrong.length > 0) {
    lines.push('Schwachstellen aus Einstiegstest (falsch beantwortet — im Kapitel gezielt üben):')
    wrong.slice(0, 8).forEach((q, index) => {
      lines.push(`${index + 1}. ${q.prompt}`)
    })
  } else {
    lines.push(
      'Alle Einstiegstest-Fragen richtig — vertiefe mit anspruchsvolleren Aufgaben aus den Materialauszügen.',
    )
  }
  return lines.join('\n')
}

export type BuildChapterGenerationPromptArgs = {
  pathTitle: string
  chapterTopic: string
  aiGuidance: string
  proficiencyLevel: '' | 'low' | 'medium' | 'high'
  materialContext: string
  entryQuizInsight: string
  validationHint: string
  attempt: number
  /** 1-basierte Kapitelnummer im Lernpfad (On-Demand-Generierung). */
  chapterNumber?: number
  totalChapters?: number
  /** Adaptives Abschlusskapitel */
  adaptive?: boolean
  weaknessSummary?: string
  /** Aktueller Lernstand (schwache Konzepte, Fehlermuster) — steuert die nächste Kapitelgenerierung adaptiv. */
  learnerStateSummary?: string
}

export function buildChapterGenerationUserPrompt(args: BuildChapterGenerationPromptArgs): string {
  const questionRange = args.adaptive ? '6-10' : '4-8'
  const lines = [
    `Lernpfad: ${args.pathTitle}`,
    `Thema: ${args.chapterTopic}`,
    args.chapterNumber
      ? `Dies ist Kapitel ${args.chapterNumber}${
          args.totalChapters && args.totalChapters > 0 ? ` von ${args.totalChapters}` : ''
        } im Lernpfad.`
      : '',
    args.adaptive
      ? 'Erstelle genau EIN Abschlusskapitel für Schwachstellen als JSON-Array mit genau einem Kapitelobjekt.'
      : 'Erstelle genau 1 Lernkapitel als JSON-Array mit genau einem Kapitelobjekt.',
    'Antwortformat: NUR valides JSON — kein Markdown, keine ##-Kapitel-Zusammenfassung, kein Fliesstext ausserhalb des JSON.',
    `Das Kapitel braucht: 1 Erklärung, dann ${questionRange} Fragen, danach 1 Recap.`,
    'Fragetypen mischen: mcq, text, match, true_false.',
    'In Erklärungs-Steps: je Step ein kurzes Mini-Beispiel im content (1-3 Sätze) oder in den bullets.',
    `Pflicht bei JEDEM question-Step: Feld "hint" mit 1-2 Sätzen Mini-Hilfe (ohne die Musterlösung zu verraten).`,
    `Schema pro Kapitel (Beispiel): ${CHAPTER_JSON_SCHEMA_EXAMPLE}`,
    CHAPTER_SKILL_TAG_RULE,
    WORKSHEET_EXERCISE_FIDELITY_RULES,
    CHAPTER_LEARNING_FIDELITY_RULES,
    args.aiGuidance.trim()
      ? `Zusatzhinweise des Lernenden: ${args.aiGuidance.trim()}`
      : 'Zusatzhinweise des Lernenden: keine',
    args.proficiencyLevel
      ? `Selbsteinschätzung Niveau: ${
          args.proficiencyLevel === 'low' ? 'schwach' : args.proficiencyLevel === 'medium' ? 'mittel' : 'gut'
        }`
      : 'Selbsteinschätzung Niveau: unbekannt',
    `Auswertungsgrundlage (Einstiegstest):\n${args.entryQuizInsight}`,
    args.learnerStateSummary?.trim()
      ? [
          'Aktueller Lernstand (aus bereits bearbeiteten Kapiteln) — passe dieses Kapitel gezielt darauf an:',
          'Greife schwache Konzepte erneut auf (andere Formulierung/Beispiel), vermeide reine Wiederholung bereits sicher beherrschter Punkte und verwende für aufgegriffene Konzepte denselben skillTag wie zuvor.',
          args.learnerStateSummary.trim(),
        ].join('\n')
      : '',
    args.adaptive && args.weaknessSummary
      ? `Schwachstellen aus bisherigem Lernverlauf:\n${args.weaknessSummary}`
      : '',
    args.materialContext
      ? `Materialauszüge (mind. die Hälfte der Fragen muss sich hierauf beziehen):\n${args.materialContext}`
      : 'Keine Materialauszüge vorhanden — nutze praxisnahe kaufmännische Beispiele.',
    args.attempt > 1
      ? 'WICHTIG: Der vorige Versuch war ungültig. Gib ausschließlich valides JSON-Array mit exakt einem Kapitelobjekt zurück.'
      : '',
    args.validationHint ? `Ungültigkeitsgrund im Vorversuch: ${args.validationHint}` : '',
  ]
  return lines.filter(Boolean).join('\n\n')
}

export function buildEntryQuizFallbackPayload(topic: string): InteractiveQuizPayload {
  const safeTopic = (topic || 'dem Thema').trim()
  return {
    title: `Einstiegstest: ${safeTopic}`,
    questions: [
      {
        id: 'fallback-q1',
        prompt: `Welche Aussage trifft für ein solides Grundverständnis bei ${safeTopic} am ehesten zu?`,
        questionType: 'mcq',
        options: [
          'Wichtige Begriffe korrekt zuordnen und anwenden',
          'Nur Definitionen auswendig kennen',
          'Rechen- und Praxisaufgaben vermeiden',
          'Nur bei einfachen Beispielen antworten',
        ],
        expectedAnswer: 'Wichtige Begriffe korrekt zuordnen und anwenden',
        acceptableAnswers: [],
        evaluation: 'exact',
        hint: 'Achte auf die Kombination aus Verständnis und Anwendung.',
        explanation: 'Grundlagen bedeuten in der Regel Begriffe korrekt verstehen und praktisch einsetzen.',
      },
      {
        id: 'fallback-q2',
        prompt: `Welche Vorgehensweise ist bei Aufgaben zu ${safeTopic} meist sinnvoll?`,
        questionType: 'mcq',
        options: ['Struktur prüfen, dann rechnen/zuordnen', 'Direkt raten', 'Nur Ergebnis notieren', 'Auf Kontext verzichten'],
        expectedAnswer: 'Struktur prüfen, dann rechnen/zuordnen',
        acceptableAnswers: [],
        evaluation: 'exact',
        hint: 'Erst Kontext, dann Lösungsschritte.',
        explanation: 'Ein sauberer Ablauf reduziert Fehler und zeigt echtes Verständnis.',
      },
      {
        id: 'fallback-q3',
        prompt: `Beschreibe in 1-2 Sätzen, wo du bei ${safeTopic} aktuell noch unsicher bist.`,
        questionType: 'text',
        expectedAnswer: 'eigene Unsicherheiten benennen',
        acceptableAnswers: ['unsicher', 'schwierigkeit', 'verstehen', 'anwenden', 'rechnung'],
        evaluation: 'contains',
        hint: 'Nenne konkret einen Bereich, nicht nur "alles".',
        explanation: 'Die Antwort hilft, den Lernpfad passend zu priorisieren.',
      },
      {
        id: 'fallback-q4',
        prompt: `Ordne die Lernschritte sinnvoll zu (${safeTopic}).`,
        questionType: 'match',
        matchLeft: ['Grundlagen klären', 'Anwendungsaufgabe lösen', 'Ergebnis prüfen'],
        matchRight: ['Begriffe/Regeln verstehen', 'Schritte durchführen', 'Plausibilität kontrollieren'],
        expectedAnswer: '0,1,2',
        acceptableAnswers: [],
        evaluation: 'exact',
        hint: 'Denk in der Reihenfolge: Verstehen -> Anwenden -> Kontrollieren.',
        explanation: 'Diese Reihenfolge ist ein typisches Lernmuster für stabile Ergebnisse.',
      },
      {
        id: 'fallback-q5',
        prompt: `Wahr oder Falsch: Bei ${safeTopic} ist es sinnvoll, die eigene Lösung abschließend kurz zu überprüfen.`,
        questionType: 'true_false',
        options: ['Wahr', 'Falsch'],
        expectedAnswer: 'Wahr',
        acceptableAnswers: ['true', 'wahr'],
        evaluation: 'exact',
        hint: 'Denke an typische Flüchtigkeitsfehler.',
        explanation: 'Eine kurze Kontrolle verbessert die Genauigkeit deutlich.',
      },
    ],
  }
}

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

export function validateGeneratedChapter(
  chapter: ChapterBlueprint,
  options?: { minQuestions?: number },
): { valid: boolean; reason: string } {
  const minQuestions = options?.minQuestions ?? CHAPTER_MIN_QUESTIONS
  const questions = chapter.steps.filter((step): step is Extract<ChapterStep, { type: 'question' }> => step.type === 'question')
  const explanations = chapter.steps.filter((step) => step.type === 'explanation')
  const recaps = chapter.steps.filter((step) => step.type === 'recap')

  if (!chapter.title.trim()) {
    return { valid: false, reason: 'Das Kapitel braucht einen title.' }
  }
  if (explanations.length < 1) {
    return { valid: false, reason: 'Das Kapitel braucht mindestens einen Erklärungs-Step (type "explanation").' }
  }
  if (recaps.length < 1) {
    return { valid: false, reason: 'Das Kapitel braucht mindestens einen Recap-Step (type "recap").' }
  }
  if (questions.length < minQuestions) {
    return {
      valid: false,
      reason: `Das Kapitel braucht mindestens ${minQuestions} Fragen (question-Steps), gefunden: ${questions.length}.`,
    }
  }

  const mcqCount = questions.filter((q) => q.questionType === 'mcq').length
  if (mcqCount < CHAPTER_MIN_MCQ) {
    return {
      valid: false,
      reason: `Das Kapitel braucht mindestens ${CHAPTER_MIN_MCQ} MCQ-Fragen, gefunden: ${mcqCount}.`,
    }
  }

  const textCount = questions.filter((q) => q.questionType === 'text').length
  if (textCount < CHAPTER_MIN_TEXT) {
    return {
      valid: false,
      reason: 'Das Kapitel braucht mindestens eine Freitext-Frage (questionType "text").',
    }
  }

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index]!
    if (!question.prompt.trim()) {
      return { valid: false, reason: `Frage ${index + 1}: prompt fehlt.` }
    }
    if (!question.hint?.trim()) {
      return { valid: false, reason: `Frage ${index + 1}: hint fehlt (1-2 Sätze Mini-Hilfe).` }
    }
    if (!question.expectedAnswer?.trim()) {
      return { valid: false, reason: `Frage ${index + 1}: expectedAnswer fehlt.` }
    }
    if (question.questionType === 'mcq') {
      const optionCount = question.options?.length ?? 0
      if (optionCount < 2) {
        return { valid: false, reason: `MCQ Frage ${index + 1}: mindestens 2 Optionen nötig.` }
      }
    }
    if (question.questionType === 'match') {
      const left = question.matchLeft ?? []
      const right = question.matchRight ?? []
      if (left.length < 2 || left.length !== right.length) {
        return {
          valid: false,
          reason: `Zuordnungsfrage ${index + 1}: matchLeft/matchRight müssen gleich lang sein (mindestens 2 Paare).`,
        }
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

export function worksheetQuestionKindLabel(item: LearnWorksheetItem): string {
  switch (item.questionType) {
    case 'mcq':
      return 'Multiple Choice'
    case 'true_false':
      return 'Wahr oder Falsch'
    case 'match':
      return 'Zuordnung'
    case 'text':
      return 'Kurzantwort'
    default:
      return 'Freitext'
  }
}

/** Lernblatt-Aufgabe für Auswertung (MCQ/Match lokal, Text per KI). */
export function worksheetItemToInteractiveQuestion(item: LearnWorksheetItem): InteractiveQuizQuestion {
  const expectedAnswer =
    item.expectedAnswer?.trim() ||
    'Die Antwort soll die Aufgabenstellung inhaltlich angemessen und fachlich plausibel bearbeiten.'

  if (item.questionType === 'match' && item.matchLeft && item.matchRight) {
    return {
      id: item.id,
      prompt: item.prompt,
      questionType: 'match',
      matchLeft: item.matchLeft,
      matchRight: item.matchRight,
      expectedAnswer,
      acceptableAnswers: item.acceptableAnswers ?? [],
      evaluation: 'exact',
      hint: item.hint,
      explanation: item.explanation,
    }
  }

  if (item.questionType === 'true_false') {
    return {
      id: item.id,
      prompt: item.prompt,
      questionType: 'true_false',
      options: item.options ?? ['Wahr', 'Falsch'],
      expectedAnswer,
      acceptableAnswers: item.acceptableAnswers ?? [],
      evaluation: 'exact',
      hint: item.hint,
      explanation: item.explanation,
    }
  }

  if (item.questionType === 'mcq') {
    const opts = item.options ?? []
    return {
      id: item.id,
      prompt: item.prompt,
      questionType: 'mcq',
      options: opts,
      expectedAnswer: opts.length > 0 ? resolveMcqExpectedAnswer(expectedAnswer, opts) : expectedAnswer,
      acceptableAnswers:
        opts.length > 0
          ? (item.acceptableAnswers ?? []).map((a) => resolveMcqExpectedAnswer(a, opts))
          : item.acceptableAnswers ?? [],
      evaluation: item.evaluation === 'contains' ? 'contains' : 'exact',
      hint: item.hint,
      explanation: item.explanation,
    }
  }

  return {
    id: item.id,
    prompt: item.prompt,
    questionType: item.questionType ?? 'text',
    expectedAnswer,
    acceptableAnswers: item.acceptableAnswers ?? [],
    evaluation: item.evaluation ?? 'contains',
    hint: item.hint,
    explanation: item.explanation,
  }
}

export function canSubmitWorksheetAnswer(item: LearnWorksheetItem, answer: string): boolean {
  if (item.questionType === 'match' && item.matchLeft && item.matchRight) {
    return isMatchAnswerComplete(worksheetItemToInteractiveQuestion(item), answer)
  }
  return answer.trim().length > 0
}

export const DEFAULT_CHAPTER_SESSION: ChapterSession = {
  chapterIndex: 0,
  stepIndex: 0,
  answersByStepId: {},
  feedbackByStepId: {},
  correctnessByStepId: {},
  evaluatedAnswersByStepId: {},
  completedChapterIndexes: [],
  skillMasteryBySkillId: {},
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
    let chapterList: unknown[] = []
    if (Array.isArray(parsed)) {
      chapterList = parsed
    } else if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      if (Array.isArray(obj.chapters)) {
        chapterList = obj.chapters
      } else if (obj.chapter && typeof obj.chapter === 'object') {
        chapterList = [obj.chapter]
      } else if (Array.isArray(obj.items)) {
        chapterList = obj.items
      } else if (typeof obj.title === 'string' && Array.isArray(obj.steps)) {
        chapterList = [obj]
      }
    }
    if (!Array.isArray(chapterList) || chapterList.length === 0) {
      return []
    }
    return chapterList
      .map((entry, chapterIndex) => {
        if (!entry || typeof entry !== 'object') {
          return null
        }
        const candidate = entry as Record<string, unknown>
        const title = typeof candidate.title === 'string' ? candidate.title.trim() : ''
        const stepsRaw = Array.isArray(candidate.steps) ? candidate.steps : []
        const legacyExplanation =
          candidate.explanation && typeof candidate.explanation === 'object'
            ? (candidate.explanation as Record<string, unknown>)
            : null
        const legacyQuestions = Array.isArray(candidate.questions) ? candidate.questions : []
        const legacyRecap =
          candidate.recap && typeof candidate.recap === 'object'
            ? (candidate.recap as Record<string, unknown>)
            : typeof candidate.recap === 'string'
              ? ({ content: candidate.recap } as Record<string, unknown>)
              : null
        if (
          !title ||
          (stepsRaw.length === 0 && !legacyExplanation && legacyQuestions.length === 0 && !legacyRecap)
        ) {
          return null
        }
        const synthesizedLegacySteps: unknown[] = []
        if (stepsRaw.length === 0) {
          if (legacyExplanation) {
            synthesizedLegacySteps.push({
              id: `c${chapterIndex + 1}-s1`,
              type: 'explanation',
              title: 'Einführung',
              content: typeof legacyExplanation.content === 'string' ? legacyExplanation.content : '',
              bullets: Array.isArray(legacyExplanation.bullets) ? legacyExplanation.bullets : [],
            })
          }
          for (let i = 0; i < legacyQuestions.length; i += 1) {
            const q = legacyQuestions[i]
            if (!q || typeof q !== 'object') {
              continue
            }
            const qr = q as Record<string, unknown>
            synthesizedLegacySteps.push({
              id:
                typeof qr.id === 'string' && qr.id.trim()
                  ? qr.id.trim()
                  : `c${chapterIndex + 1}-q${i + 1}`,
              type: 'question',
              questionType:
                qr.questionType === 'mcq' ||
                qr.questionType === 'match' ||
                qr.questionType === 'true_false' ||
                qr.questionType === 'text'
                  ? qr.questionType
                  : Array.isArray(qr.options) && qr.options.length >= 2
                    ? 'mcq'
                    : 'text',
              prompt: typeof qr.prompt === 'string' ? qr.prompt : '',
              options: Array.isArray(qr.options) ? qr.options : undefined,
              expectedAnswer: qr.expectedAnswer,
              acceptableAnswers: Array.isArray(qr.acceptableAnswers) ? qr.acceptableAnswers : [],
              evaluation: qr.evaluation === 'contains' ? 'contains' : 'exact',
              hint: typeof qr.hint === 'string' ? qr.hint : undefined,
              explanation: typeof qr.explanation === 'string' ? qr.explanation : undefined,
              matchLeft: Array.isArray(qr.matchLeft) ? qr.matchLeft : [],
              matchRight: Array.isArray(qr.matchRight) ? qr.matchRight : [],
            })
          }
          if (legacyRecap) {
            synthesizedLegacySteps.push({
              id: `c${chapterIndex + 1}-recap`,
              type: 'recap',
              title: 'Zusammenfassung',
              content: typeof legacyRecap.content === 'string' ? legacyRecap.content : '',
              bullets: Array.isArray(legacyRecap.bullets) ? legacyRecap.bullets : [],
            })
          }
        }
        const sourceSteps = stepsRaw.length > 0 ? stepsRaw : synthesizedLegacySteps
        const steps = sourceSteps
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
              const skillTag =
                typeof stepCandidate.skillTag === 'string' && stepCandidate.skillTag.trim()
                  ? stepCandidate.skillTag.trim().slice(0, 80)
                  : undefined
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
                  skillTag,
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
                  skillTag,
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
                  skillTag,
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
                skillTag,
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
          source: 'ai',
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

/**
 * Kompakter Lernstand-Block für die nächste Kapitelgenerierung (Punkt 3 / adaptiv):
 * schwache Konzepte (Skill-Mastery), konkrete Fehlermuster und falsch beantwortete Fragen.
 * Liefert '' wenn noch keine verwertbare Historie existiert (z. B. erstes Kapitel).
 */
export function buildLearnerStateInsight(
  blueprints: ChapterBlueprint[],
  session: ChapterSession,
): string {
  const sections: string[] = []

  const weakSkills = Object.values(session.skillMasteryBySkillId ?? {})
    .filter((entry) => entry.attempts > 0 && (entry.score ?? 0) < 0.6)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .slice(0, 8)
  if (weakSkills.length > 0) {
    const lines = weakSkills.map((entry, index) => {
      const label = entry.label?.trim() || entry.source || 'Konzept'
      const scorePct = Math.round((entry.score ?? 0) * 100)
      return `${index + 1}. ${label} — Mastery ${scorePct}% (${entry.correct}/${entry.attempts} richtig)`
    })
    sections.push(`Schwache Konzepte (Mastery < 60%):\n${lines.join('\n')}`)
  }

  const wrongPrompts = weakSkills
    .flatMap((entry) => entry.lastWrongPrompts ?? [])
    .filter((text) => text.trim().length > 0)
    .slice(0, 10)
  if (wrongPrompts.length > 0) {
    const lines = wrongPrompts.map((prompt, index) => `${index + 1}. ${prompt}`)
    sections.push(`Konkrete Fehlermuster (zuletzt falsch beantwortet):\n${lines.join('\n')}`)
  }

  const wrongQuestions = collectWeakQuestionSteps(blueprints, session)
    .slice(0, 10)
    .map((step, index) => `${index + 1}. ${step.prompt}`)
  if (wrongQuestions.length > 0) {
    sections.push(`Falsch beantwortete Kapitelfragen:\n${wrongQuestions.join('\n')}`)
  }

  const strongSkills = Object.values(session.skillMasteryBySkillId ?? {})
    .filter((entry) => entry.attempts >= 2 && (entry.score ?? 0) >= 0.85)
    .map((entry) => entry.label?.trim() || entry.source || 'Konzept')
    .slice(0, 6)
  if (strongSkills.length > 0) {
    sections.push(`Bereits sicher beherrscht (nicht breit wiederholen):\n${strongSkills.join(', ')}`)
  }

  return sections.join('\n\n').trim()
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
