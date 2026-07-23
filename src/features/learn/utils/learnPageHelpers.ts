import { DEFAULT_SYSTEM_PROMPTS } from '../../../config/systemPromptDefaults'
import type {
  ChapterBlueprint,
  ChapterSession,
  ChapterStep,
  ChapterStepWithoutId,
  LearnFlashcardSet,
  LearnWorksheetItem,
  LearningPathSummary,
  SkillMasteryBySkillId,
  SyllabusEntry,
  TopicSession,
} from '../services/learn.persistence'
import {
  coerceQuizScalarToString,
  isCategorizeAnswerComplete,
  isMatchAnswerComplete,
  resolveMcqExpectedAnswer,
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
  'Fragetypen mischen: mindestens 2× mcq, 1× text (kurze Antwort, 1–3 Sätze), 1× match, categorize oder true_false.',
  'Freitext (text): prompt verlangt explizit kurze Antwort (1–3 Sätze), nicht Essay.',
  'Jede Aufgabe braucht expectedAnswer, hint (1 Satz ohne Lösung), evaluation ("exact" oder "contains").',
  'MCQ: 3–5 Optionen; true_false: expectedAnswer «Wahr» oder «Falsch»; match: gleich lange matchLeft/matchRight.',
  'categorize (Begriffe in Kategorien einsortieren): Felder "categories" (2–4 Kategorien) und "items" (3–8 Begriffe); expectedAnswer = pro Begriff der Kategorie-Index in items-Reihenfolge, komma-getrennt (z. B. "0,1,0,1"); KEINE options. NUTZE categorize statt einer mcq mit kombinierten Paar-Optionen, wenn Begriffe Klassen zugeordnet werden (z. B. direkte vs. indirekte Steuer).',
  'SKILL-TAG (Pflicht je Aufgabe): Feld "skillTag" mit kurzem Konzept-Slug in Kleinbuchstaben mit Bindestrichen (z. B. "mwst-berechnung"). Verwende für dieselbe Teilkompetenz immer denselben skillTag wie in den Kapiteln/Lernkarten.',
].join('\n')

export const WORKSHEET_JSON_SCHEMA_EXAMPLE =
  '[{"id":"ws1","prompt":"Welche Aussage zur MWSt in der Schweiz trifft zu?","questionType":"mcq","options":["8.1% Normalsteuersatz","2.6% auf alle Leistungen","Keine MWSt auf Dienstleistungen","Nur Export MWSt-pflichtig"],"expectedAnswer":"8.1% Normalsteuersatz","acceptableAnswers":[],"evaluation":"exact","hint":"Denk an den üblichen Normalsteuersatz.","explanation":"...","skillTag":"mwst-saetze"},{"id":"ws2","prompt":"Ordne Begriff und Definition zu.","questionType":"match","matchLeft":["Steuerhoheit","Mehrwertsteuer"],"matchRight":["Hoheitliche Erhebung","Umsatzbesteuerung"],"expectedAnswer":"0,1","evaluation":"exact","hint":"...","skillTag":"steuer-grundbegriffe"},{"id":"ws3","prompt":"Sortiere die Steuern nach direkter und indirekter Steuer.","questionType":"categorize","categories":["Direkte Steuer","Indirekte Steuer"],"items":["Einkommenssteuer","Mehrwertsteuer","Vermögenssteuer","Tabaksteuer"],"expectedAnswer":"0,1,0,1","evaluation":"exact","hint":"Direkte Steuern werden auf Einkommen/Vermögen erhoben.","skillTag":"steuerarten"}]'

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

/**
 * Prüft eine categorize-Aufgabe: 2–4 Kategorien, ≥ 2 Begriffe, und expectedAnswer mit genau
 * einem gültigen Kategorie-Index pro Begriff. Liefert eine Fehlermeldung oder null (gültig).
 */
function validateCategorizeFields(
  categories: string[] | undefined,
  items: string[] | undefined,
  expectedAnswer: string | undefined,
  label: number | string,
): string | null {
  const cats = (categories ?? []).map((c) => c.trim()).filter(Boolean)
  const its = (items ?? []).map((i) => i.trim()).filter(Boolean)
  if (cats.length < 2 || cats.length > 4) {
    return `Kategorien-Aufgabe ${label} braucht 2–4 Kategorien (categories).`
  }
  if (its.length < 2) {
    return `Kategorien-Aufgabe ${label} braucht mindestens 2 Begriffe (items).`
  }
  const parts = (expectedAnswer ?? '').split(',').map((s) => s.trim())
  if (parts.length !== its.length) {
    return `Kategorien-Aufgabe ${label}: expectedAnswer braucht genau ${its.length} Kategorie-Indizes (einen pro Begriff).`
  }
  const allValid = parts.every((p) => {
    const num = Number.parseInt(p, 10)
    return !Number.isNaN(num) && num >= 0 && num < cats.length
  })
  if (!allValid) {
    return `Kategorien-Aufgabe ${label}: expectedAnswer enthält ungültige Kategorie-Indizes.`
  }
  return null
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
      reason: 'Jede Aufgabe braucht questionType (mcq, text, match, categorize oder true_false).',
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
    (item) =>
      item.questionType === 'match' ||
      item.questionType === 'true_false' ||
      item.questionType === 'categorize',
  ).length
  if (matchOrTfCount < 1) {
    return {
      valid: false,
      reason: 'Das Lernblatt braucht mindestens eine Zuordnungs- (match), Kategorien- (categorize) oder Wahr/Falsch-Aufgabe.',
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

    if (item.questionType === 'categorize') {
      const categorizeError = validateCategorizeFields(item.categories, item.items, item.expectedAnswer, index + 1)
      if (categorizeError) {
        return { valid: false, reason: categorizeError }
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
    categories: question.categories,
    items: question.items,
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

export function countMasteredTopics(topicSessions: TopicSession[]): number {
  return topicSessions.filter((session) => session.status === 'mastered').length
}

export function shouldUseMixedLearnMaterial(topicSessions: TopicSession[]): boolean {
  return countMasteredTopics(topicSessions) >= MIXED_LEARN_MATERIAL_MIN_COMPLETED_CHAPTERS
}

export function resolveWorksheetProgressChapterKey(topicSessions: TopicSession[], chapterIndex: number): number {
  return shouldUseMixedLearnMaterial(topicSessions) ? MIXED_LEARN_MATERIAL_CHAPTER_INDEX : chapterIndex
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
/**
 * Verhindert Meta-/Struktur-Fragen: Arbeitsanweisungen ("Aufträge") im Material werden in
 * eigenständige FACH-Fragen aufgelöst, statt die Dokumentstruktur selbst abzufragen.
 * Wird in Einstiegstest, Kapiteln und Arbeitsblättern mitgeschickt.
 */
export const SELF_CONTAINED_KNOWLEDGE_RULES = [
  'WISSEN STATT DOKUMENTSTRUKTUR: Prüfe IMMER das fachliche Wissen/Können, NICHT den Aufbau des Materials.',
  'Wenn die Auszüge Arbeitsanweisungen/Aufträge enthalten (z. B. "Auftrag 1a: Ermittle die drei wichtigsten Einnahmen des Bundes", "Fülle das Glossar aus", "Vereinbare einen Termin mit der ESTV"): Löse den fachlichen KERN heraus und frage diesen direkt ab (z. B. "Welche drei Einnahmequellen sind für den Schweizer Bund am wichtigsten?").',
  'VERBOTEN in prompt, options UND expectedAnswer: Verweise auf die Dokument-/Aufgabenstruktur — keine Wörter wie "Auftrag", "Auftrag 1a", "Aufgabe 2", "Dossier", "Blatt", "Arbeitsblatt", "Unterlagen", "laut Text", "im Dokument", "in deinem Dossier".',
  'VERBOTEN: Fragen nach dem ZIEL/ZWECK eines Auftrags oder danach, was eine Aufgabe verlangt (z. B. "Was ist das Ziel von Auftrag 1a?"). Frage stattdessen den Sachinhalt selbst ab.',
  'SELBST-TEST: Jede Frage muss für jemanden verständlich und beantwortbar sein, der das Material NIE gesehen hat. Wird die Frage ohne das Dossier sinnlos, formuliere sie in eine reine Wissens-/Anwendungsfrage um.',
].join('\n')

export const WORKSHEET_EXERCISE_FIDELITY_RULES = [
  'ÜBUNGS-TREUE (wenn die Dateiauszüge fachliche Übungen, Rechenaufgaben, konkrete Werte (z. B. MWSt-Satz, Beträge, Konten, Rabatte), Tabellen oder Fallbeispiele enthalten):',
  'Die Fragen und Aufgaben MÜSSEN sich auf genau diese Inhalte beziehen: dieselben oder leicht variierten Szenarien, dieselben Zahlen/Beträge wo möglich, gleiche Art von Teilaufgabe (z. B. MWSt berechnen statt "Was ist die Hauptaufgabe der Buchhaltung").',
  'VERBOTEN in diesem Fall: reine Definitions- oder "Was ist die Hauptfunktion von ..."-Fragen, wenn im Material bereits konkrete Übungen stehen — außer EINER optionalen sehr kurzen Grundlagenfrage.',
  'Priorität: fachliche Rechen-/Fallaufgaben spiegeln (z. B. "Zu einer Rechnung über CHF 1\'240.50 inkl. 8.1% MWSt: ..."), nicht das Thema nur allgemein abfragen — spiegle INHALTE, nicht die Aufgabennummerierung oder Struktur des Dokuments.',
  SELF_CONTAINED_KNOWLEDGE_RULES,
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

export const POST_ENTRY_PREP_STEPS = ['Einstiegstest wird analysiert', 'Lernplan wird erstellt'] as const
export const SYLLABUS_GENERATION_MAX_ATTEMPTS = 2
/** Client-seitiges Maximum für eine KI-Kapitelgenerierung (großes JSON, Sonnet — 90s war oft zu knapp). */
export const CHAPTER_GENERATION_TIMEOUT_MS = 180000
export const CHAPTER_GENERATION_MAX_ATTEMPTS = 3
export const CHAPTER_MIN_QUESTIONS = 6
export const CHAPTER_MIN_QUESTIONS_ADAPTIVE = 8
export const CHAPTER_MIN_MCQ = 2
export const CHAPTER_MIN_TEXT = 1
export const ADAPTIVE_CHAPTER_PLACEHOLDER_ID = 'adaptive-weakness-placeholder'
export const ADAPTIVE_CHAPTER_GENERATED_ID = 'adaptive-weakness-generated'

/** Schwelle, ab der ein Zwischenschritt als gemeistert gilt (Anteil „Gewusst" der Übungskarten). */
export const TOPIC_MASTERY_THRESHOLD = 0.75
/** Sicherheitslimit für die Anzahl generierter Zwischenschritte pro Thema. */
export const TOPIC_MAX_STEPS = 6
/** Mindest-/Maximalzahl Fragen im Einstiegscheck eines Themas (6–10). */
export const TOPIC_ENTRY_CHECK_MIN_QUESTIONS = 6
export const TOPIC_ENTRY_CHECK_MAX_QUESTIONS = 10
export const TOPIC_STEP_MIN_QUESTIONS = 3
export const TOPIC_DIAGNOSTIC_PLACEHOLDER_ID = 'topic-diagnostic-placeholder'
export const TOPIC_STEP_PLACEHOLDER_ID = 'topic-step-placeholder'

/** Topic-Mastery ist abgeleitet: Durchschnitt der Zwischenschritt-Scores (nur aus Übungskarten gespeist). */
export function topicMasteryScore(session: TopicSession): number {
  if (session.substeps.length === 0) {
    return 0
  }
  const sum = session.substeps.reduce(
    (acc, substep) => acc + (Number.isFinite(substep.masteryScore) ? substep.masteryScore : 0),
    0,
  )
  return sum / session.substeps.length
}

/** Gesamte gewertete Übungskarten-Versuche über alle Zwischenschritte (0 = noch keine Datengrundlage). */
export function topicMasteryAttempts(session: TopicSession): number {
  return session.substeps.reduce((acc, substep) => acc + (substep.masteryAttempts ?? 0), 0)
}

/** Ein Thema ist abgeschlossen, wenn es Zwischenschritte hat und alle durchlaufen (`completed`) sind. */
export function isTopicMastered(session: TopicSession): boolean {
  return session.substeps.length > 0 && session.substeps.every((substep) => substep.completed)
}

/** JSON-Schema-Beispiel für Kapitelgenerierung (on-demand + adaptiv). */
export const CHAPTER_JSON_SCHEMA_EXAMPLE =
  '{"id":"chapter-1","title":"...","description":"...","steps":[{"id":"c1-s1","type":"explanation","title":"...","content":"Kurzer Absatz Definition/Beispiel. Bei Rechenweg/Vergleich optional eine GFM-Tabelle:\\n\\n| Position | Betrag |\\n| --- | --- |\\n| Nettobetrag | CHF 1\'200.00 |\\n| + MWSt 8.1% | CHF 97.20 |\\n| = Bruttobetrag | CHF 1\'297.20 |","bullets":["..."],"keyPrinciple":"Ein prägnanter Satz: die zentrale Regel/Faustformel dieses Schritts."},{"id":"c1-q1","type":"question","questionType":"mcq","prompt":"...","options":["a","b","c"],"expectedAnswer":"...","acceptableAnswers":[],"evaluation":"exact","hint":"...","explanation":"...","skillTag":"mwst-berechnung"},{"id":"c1-q2","type":"question","questionType":"text","prompt":"...","expectedAnswer":"...","acceptableAnswers":[],"evaluation":"contains","hint":"...","explanation":"...","skillTag":"belege-buchen"},{"id":"c1-q3","type":"question","questionType":"true_false","prompt":"...","expectedAnswer":"Falsch","hint":"...","explanation":"...","skillTag":"kontenrahmen"},{"id":"c1-q4","type":"question","questionType":"match","prompt":"...","matchLeft":["x","y"],"matchRight":["1","2"],"expectedAnswer":"0,1","hint":"...","explanation":"...","skillTag":"konten-zuordnung"},{"id":"c1-q5","type":"question","questionType":"categorize","prompt":"Sortiere die Konten in Aktiv- und Passivkonto.","categories":["Aktivkonto","Passivkonto"],"items":["Kasse","Darlehen","Maschinen","Kreditoren"],"expectedAnswer":"0,1,0,1","hint":"Aktivkonten zeigen Vermögen.","explanation":"...","skillTag":"konten-art"},{"id":"c1-recap","type":"recap","title":"...","content":"...","bullets":["..."],"keyPrinciple":"..."}]}'

/** Regeln zu Kernprinzip-Box und Tabellen in Erklärungs-/Recap-Steps (visuelle Struktur, kein neuer Feldtyp). */
export const CHAPTER_CONTENT_STRUCTURE_RULES = [
  'KERNPRINZIP (Pflicht bei JEDEM explanation-Step, optional bei recap): Feld "keyPrinciple" mit genau 1 prägnanten Satz — die zentrale Regel/Faustformel/Definition dieses Schritts. NICHT die Kapitelüberschrift oder eine Floskel wiederholen, sondern den fachlichen Kern in einem Satz.',
  'TABELLEN im Feld "content" NUR wenn inhaltlich passend (Rechenweg/Aufstellung mit mehreren Positionen, z. B. MWSt-Berechnung, Skonto, Zinsrechnung; oder Gegenüberstellung/Kategorien, z. B. Kontenarten, Steuerarten): als GFM-Pipe-Tabelle schreiben, z. B. "| Position | Betrag |\\n| --- | --- |\\n| Nettobetrag | CHF 1\'200.00 |". Erzwinge KEINE Tabelle, wenn ein normaler Fließtext-Satz reicht.',
  'content bleibt ein normaler String — bei Bedarf mehrere kurze Absätze (Leerzeile trennt) und/oder genau eine Tabelle darin, kein separates JSON-Feld für die Tabelle.',
].join('\n')

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

export type BuildSyllabusGenerationPromptArgs = {
  pathTitle: string
  mainTopic: string
  selectedTopic: string
  aiGuidance: string
  proficiencyLevel: '' | 'low' | 'medium' | 'high'
  materialContext: string
  chapterCount: number
  validationHint: string
  attempt: number
}

export function buildSyllabusGenerationUserPrompt(args: BuildSyllabusGenerationPromptArgs): string {
  const lines = [
    `Lernpfad: ${args.pathTitle}`,
    `Hauptthema: ${args.mainTopic}`,
    args.selectedTopic.trim() ? `Gewählter Schwerpunkt: ${args.selectedTopic.trim()}` : '',
    `Erstelle genau ${args.chapterCount} geordnete Lernkapitel als JSON-Array.`,
    'Antwortformat: NUR valides JSON — kein Markdown, kein Fliesstext ausserhalb des JSON.',
    'Schema pro Eintrag: {"topic":"Kurztitel des Unterthemas (max. 8 Wörter)","learningGoals":["Kurzes Lernziel in Stichworten"]}',
    'Beispiel: [{"topic":"Grundlagen MWSt","learningGoals":["MWSt-Sätze sicher zuordnen","Nettobetrag berechnen"]}]',
    'Regeln:',
    '- Unterthemen bilden eine didaktische Progression (Grundlagen → Anwendung → Vertiefung).',
    '- Keine inhaltliche Überlappung zwischen Kapiteln.',
    '- topic = konkretes Unterthema, NICHT nur das Hauptthema wiederholen.',
    '- learningGoals = 1 bis maximal 3 messbare Lernziele in Stichworten (je max. 6 Wörter, KEINE ganzen Sätze).',
    args.aiGuidance.trim() ? `Zusatzhinweise des Lernenden: ${args.aiGuidance.trim()}` : '',
    args.proficiencyLevel
      ? `Selbsteinschätzung Niveau: ${
          args.proficiencyLevel === 'low' ? 'schwach' : args.proficiencyLevel === 'medium' ? 'mittel' : 'gut'
        }`
      : '',
    args.materialContext
      ? `Materialauszüge (Unterthemen an diesen Inhalten ausrichten):\n${args.materialContext}`
      : 'Keine Materialauszüge — nutze realistische KV-Unterthemen zum Hauptthema.',
    args.attempt > 1
      ? 'WICHTIG: Der vorige Versuch war ungültig. Gib ausschliesslich valides JSON-Array zurück.'
      : '',
    args.validationHint ? `Ungültigkeitsgrund im Vorversuch: ${args.validationHint}` : '',
  ]
  return lines.filter(Boolean).join('\n\n')
}

export function parseSyllabusFromText(raw: string): SyllabusEntry[] {
  const normalized = normalizeJsonArrayPayload(raw)
  if (!normalized) {
    return []
  }
  try {
    const parsed = JSON.parse(normalized) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    const entries: SyllabusEntry[] = []
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const rec = entry as Record<string, unknown>
      const topic = typeof rec.topic === 'string' ? rec.topic.trim() : ''
      // Neues Schema: learningGoals als Array von Stichworten (max. 3) — gespeichert wird
      // zeilenweise im bestehenden learningGoal-Feld (kein Datenmodell-Bruch). Alte Felder
      // (learningGoal/goal als Satz) bleiben als Fallback lesbar.
      const goalsFromArray = Array.isArray(rec.learningGoals)
        ? rec.learningGoals
            .filter((goal): goal is string => typeof goal === 'string')
            .map((goal) => goal.trim())
            .filter(Boolean)
            .slice(0, 3)
        : []
      const learningGoal =
        goalsFromArray.length > 0
          ? goalsFromArray.join('\n')
          : typeof rec.learningGoal === 'string'
            ? rec.learningGoal.trim()
            : typeof rec.goal === 'string'
              ? rec.goal.trim()
              : ''
      if (topic && learningGoal) {
        entries.push({ topic, learningGoal })
      }
    }
    return entries.slice(0, 6)
  } catch {
    return []
  }
}

/** Zerlegt das gespeicherte learningGoal-Feld in einzelne Stichwort-Lernziele (max. 3).
 *  Neues Format: zeilenweise; Altbestand (ein Satz bzw. •/;-getrennt) wird mit aufgetrennt. */
export function splitLearningGoals(learningGoal: string): string[] {
  return learningGoal
    .split(/\n|•|;/)
    .map((goal) => goal.trim().replace(/^[-–*]\s*/, ''))
    .filter(Boolean)
    .slice(0, 3)
}

export function validateGeneratedSyllabus(
  entries: SyllabusEntry[],
  expectedCount: number,
): { valid: true } | { valid: false; reason: string } {
  if (entries.length !== expectedCount) {
    return {
      valid: false,
      reason: `Erwartet ${expectedCount} Syllabus-Einträge, erhalten ${entries.length}.`,
    }
  }
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (!entry.topic.trim() || !entry.learningGoal.trim()) {
      return { valid: false, reason: `Eintrag ${index + 1} hat leeres topic oder learningGoal.` }
    }
  }
  return { valid: true }
}

export function buildFallbackSyllabus(mainTopic: string, chapterCount: number): SyllabusEntry[] {
  const safeTopic = (mainTopic || 'Grundlagen').trim()
  const templates = [
    {
      topic: `Grundlagen: ${safeTopic}`,
      learningGoal: `Die zentralen Begriffe zu ${safeTopic} erklären und zuordnen.`,
    },
    {
      topic: `${safeTopic} in der Praxis`,
      learningGoal: `Typische Aufgaben zu ${safeTopic} strukturiert lösen.`,
    },
    {
      topic: `${safeTopic} vertiefen`,
      learningGoal: `Anspruchsvollere Anwendungsfälle zu ${safeTopic} sicher bearbeiten.`,
    },
    {
      topic: `${safeTopic}: häufige Fehler`,
      learningGoal: `Typische Stolpersteine bei ${safeTopic} erkennen und vermeiden.`,
    },
  ]
  return templates.slice(0, Math.max(1, Math.min(6, chapterCount)))
}

export type BuildChapterGenerationPromptArgs = {
  pathTitle: string
  chapterTopic: string
  /** Verbindliches Lernziel aus dem Syllabus für dieses Kapitel. */
  learningGoal?: string
  aiGuidance: string
  proficiencyLevel: '' | 'low' | 'medium' | 'high'
  materialContext: string
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
  const questionRange = args.adaptive ? '8-12' : '6-10'
  const lines = [
    `Lernpfad: ${args.pathTitle}`,
    `Thema: ${args.chapterTopic}`,
    args.chapterNumber
      ? `Dies ist Kapitel ${args.chapterNumber}${
          args.totalChapters && args.totalChapters > 0 ? ` von ${args.totalChapters}` : ''
        } im Lernpfad.`
      : '',
    args.learningGoal?.trim()
      ? `Lernziel dieses Kapitels (verbindlich): ${args.learningGoal.trim()}`
      : '',
    'Generiere Inhalte ausschliesslich für dieses Unterthema — nicht das gesamte Hauptthema wiederholen.',
    args.adaptive
      ? 'Erstelle genau EIN Abschlusskapitel für Schwachstellen als JSON-Array mit genau einem Kapitelobjekt.'
      : 'Erstelle genau 1 Lernkapitel als JSON-Array mit genau einem Kapitelobjekt.',
    'Antwortformat: NUR valides JSON — kein Markdown, keine ##-Kapitel-Zusammenfassung, kein Fliesstext ausserhalb des JSON.',
    `Das Kapitel braucht: 1 Erklärung, dann ${questionRange} Fragen, danach 1 Recap.`,
    'Fragetypen mischen: mcq, text, match, true_false, categorize.',
    'categorize (Begriffe in Kategorien einsortieren): Felder "categories" (2–4) und "items" (3–8); expectedAnswer = Kategorie-Index pro Begriff in items-Reihenfolge, komma-getrennt (z. B. "0,1,0,1"); keine options. Nutze categorize statt mcq mit kombinierten Paar-Optionen, wenn Begriffe Klassen zugeordnet werden.',
    'In Erklärungs-Steps: je Step ein kurzes Mini-Beispiel im content (1-3 Sätze) oder in den bullets.',
    `Pflicht bei JEDEM question-Step: Feld "hint" mit 1-2 Sätzen Mini-Hilfe (ohne die Musterlösung zu verraten).`,
    `Schema pro Kapitel (Beispiel): ${CHAPTER_JSON_SCHEMA_EXAMPLE}`,
    CHAPTER_SKILL_TAG_RULE,
    CHAPTER_CONTENT_STRUCTURE_RULES,
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

/** Landkarte Phase 1: Args für den pro-Thema-Diagnosetest (nur Fragen, kein explanation/recap). */
export type BuildTopicDiagnosticPromptArgs = {
  pathTitle: string
  chapterTopic: string
  learningGoal?: string
  aiGuidance: string
  proficiencyLevel: '' | 'low' | 'medium' | 'high'
  materialContext: string
  validationHint: string
  attempt: number
}

/**
 * Landkarte Phase 1: Diagnosetest-Prompt für den Start eines Themas — schlanker als
 * {@link buildChapterGenerationUserPrompt}, verlangt AUSSCHLIESSLICH Fragen (kein explanation/recap-Step),
 * damit die anschliessende Mastery-Berechnung ein reines Vorwissens-Signal misst.
 */
export function buildTopicDiagnosticUserPrompt(args: BuildTopicDiagnosticPromptArgs): string {
  const lines = [
    `Lernpfad: ${args.pathTitle}`,
    `Thema: ${args.chapterTopic}`,
    args.learningGoal?.trim() ? `Lernziel dieses Themas (verbindlich): ${args.learningGoal.trim()}` : '',
    'Erstelle einen Einstiegscheck für dieses Thema als JSON-Objekt mit genau einem Kapitelobjekt.',
    `Antwortformat: NUR valides JSON — kein Markdown, kein Fliesstext ausserhalb des JSON. Das Objekt braucht AUSSCHLIESSLICH question-Steps (${TOPIC_ENTRY_CHECK_MIN_QUESTIONS}-${TOPIC_ENTRY_CHECK_MAX_QUESTIONS} Stück) — KEINEN explanation-Step, KEINEN recap-Step.`,
    'Ziel: das VORWISSEN zu diesem Thema testen, nicht unterrichten — noch keine Erklärungen liefern.',
    'Fragetypen mischen: mcq, text, true_false (bevorzugt), optional match/categorize.',
    `Pflicht bei JEDEM question-Step: Feld "hint" mit 1-2 Sätzen Mini-Hilfe (ohne die Musterlösung zu verraten).`,
    `Schema-Beispiel (nur die "steps"-Fragen daraus übernehmen, kein explanation/recap): ${CHAPTER_JSON_SCHEMA_EXAMPLE}`,
    CHAPTER_SKILL_TAG_RULE,
    CHAPTER_LEARNING_FIDELITY_RULES,
    args.aiGuidance.trim()
      ? `Zusatzhinweise des Lernenden: ${args.aiGuidance.trim()}`
      : 'Zusatzhinweise des Lernenden: keine',
    args.proficiencyLevel
      ? `Selbsteinschätzung Niveau: ${
          args.proficiencyLevel === 'low' ? 'schwach' : args.proficiencyLevel === 'medium' ? 'mittel' : 'gut'
        }`
      : 'Selbsteinschätzung Niveau: unbekannt',
    args.materialContext
      ? `Materialauszüge (Diagnosefragen an diesen Inhalten ausrichten):\n${args.materialContext}`
      : 'Keine Materialauszüge vorhanden — nutze praxisnahe kaufmännische Beispiele.',
    args.attempt > 1
      ? 'WICHTIG: Der vorige Versuch war ungültig. Gib ausschließlich valides JSON mit genau einem Kapitelobjekt zurück, NUR question-Steps.'
      : '',
    args.validationHint ? `Ungültigkeitsgrund im Vorversuch: ${args.validationHint}` : '',
  ]
  return lines.filter(Boolean).join('\n\n')
}


export function validateGeneratedChapter(
  chapter: ChapterBlueprint,
  options?: { minQuestions?: number; requireExplanation?: boolean; requireRecap?: boolean },
): { valid: boolean; reason: string } {
  const minQuestions = options?.minQuestions ?? CHAPTER_MIN_QUESTIONS
  const requireExplanation = options?.requireExplanation ?? true
  const requireRecap = options?.requireRecap ?? true
  const questions = chapter.steps.filter((step): step is Extract<ChapterStep, { type: 'question' }> => step.type === 'question')
  const explanations = chapter.steps.filter(
    (step): step is Extract<ChapterStep, { type: 'explanation' }> => step.type === 'explanation',
  )
  const recaps = chapter.steps.filter((step) => step.type === 'recap')

  if (!chapter.title.trim()) {
    return { valid: false, reason: 'Das Kapitel braucht einen title.' }
  }
  if (requireExplanation && explanations.length < 1) {
    return { valid: false, reason: 'Das Kapitel braucht mindestens einen Erklärungs-Step (type "explanation").' }
  }
  if (requireRecap && recaps.length < 1) {
    return { valid: false, reason: 'Das Kapitel braucht mindestens einen Recap-Step (type "recap").' }
  }
  for (let index = 0; index < explanations.length; index += 1) {
    if (!explanations[index]!.keyPrinciple?.trim()) {
      return {
        valid: false,
        reason: `Erklärungs-Step ${index + 1}: Feld "keyPrinciple" fehlt (1 prägnanter Satz Kernprinzip).`,
      }
    }
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
    if (question.questionType === 'categorize') {
      const categorizeError = validateCategorizeFields(
        question.categories,
        question.items,
        question.expectedAnswer,
        index + 1,
      )
      if (categorizeError) {
        return { valid: false, reason: categorizeError }
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
  if (step.questionType === 'categorize' && step.categories && step.items) {
    return {
      id: step.id,
      prompt: step.prompt,
      questionType: 'categorize',
      categories: step.categories,
      items: step.items,
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
    case 'categorize':
      return 'Kategorien'
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

  if (item.questionType === 'categorize' && item.categories && item.items) {
    return {
      id: item.id,
      prompt: item.prompt,
      questionType: 'categorize',
      categories: item.categories,
      items: item.items,
      expectedAnswer: item.expectedAnswer ?? '',
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
  if (item.questionType === 'categorize' && item.categories && item.items) {
    return isCategorizeAnswerComplete(worksheetItemToInteractiveQuestion(item), answer)
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

              const categories = Array.isArray(stepCandidate.categories)
                ? stepCandidate.categories
                    .filter((value): value is string => typeof value === 'string')
                    .map((value) => value.trim())
                    .filter(Boolean)
                : []
              const items = Array.isArray(stepCandidate.items)
                ? stepCandidate.items
                    .filter((value): value is string => typeof value === 'string')
                    .map((value) => value.trim())
                    .filter(Boolean)
                : []
              const wantsCategorize =
                stepCandidate.questionType === 'categorize' ||
                (categories.length >= 2 && items.length >= 2 && prompt.length > 0)

              if (wantsCategorize && categories.length >= 2 && items.length >= 2 && prompt) {
                const expectedParts = (
                  typeof stepCandidate.expectedAnswer === 'string' ? stepCandidate.expectedAnswer : ''
                )
                  .split(',')
                  .map((s) => s.trim())
                const expectedValid =
                  expectedParts.length === items.length &&
                  expectedParts.every((p) => {
                    const num = Number.parseInt(p, 10)
                    return !Number.isNaN(num) && num >= 0 && num < categories.length
                  })
                if (expectedValid) {
                  return {
                    id,
                    type: 'question' as const,
                    questionType: 'categorize' as const,
                    prompt,
                    categories,
                    items,
                    expectedAnswer: expectedParts.map((p) => String(Number.parseInt(p, 10))).join(','),
                    acceptableAnswers,
                    evaluation: 'exact',
                    hint,
                    explanation,
                    skillTag,
                  } satisfies ChapterStep
                }
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
            const keyPrinciple =
              typeof stepCandidate.keyPrinciple === 'string' && stepCandidate.keyPrinciple.trim()
                ? stepCandidate.keyPrinciple.trim()
                : undefined

            if (!stepTitle || !content) {
              return null
            }

            if (type === 'recap') {
              return { id, type: 'recap', title: stepTitle, content, bullets, keyPrinciple } satisfies ChapterStep
            }
            return {
              id,
              type: 'explanation',
              title: stepTitle,
              content,
              bullets,
              keyPrinciple,
            } satisfies ChapterStep
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
  skillMasteryBySkillId: SkillMasteryBySkillId,
): string {
  const sections: string[] = []

  const weakSkills = Object.values(skillMasteryBySkillId ?? {})
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

  const strongSkills = Object.values(skillMasteryBySkillId ?? {})
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

/** Landkarte Phase 1: {@link collectWeakQuestionSteps}, aber auf ein einzelnes Thema beschränkt (Diagnose + bisherige Zwischenschritte). */
/**
 * Landkarte: True, solange der zuletzt generierte Zwischenschritt noch nicht (vollständig) bearbeitet
 * ist — d. h. mindestens eine seiner Fragen hat noch kein Feedback. Solange das gilt, darf KEIN
 * weiterer Schritt generiert werden: ein Zwischenschritt nach dem anderen, kein Burst.
 */
export function hasUnansweredTopicStep(topicSession: TopicSession): boolean {
  const last = topicSession.substeps[topicSession.substeps.length - 1]
  if (!last) {
    return false
  }
  const questionSteps = last.blueprint.steps.filter(
    (step): step is Extract<ChapterStep, { type: 'question' }> => step.type === 'question',
  )
  if (questionSteps.length === 0) {
    return false
  }
  const feedbackByStepId = last.session.feedbackByStepId
  return questionSteps.some((step) => {
    const feedback = feedbackByStepId[step.id]
    return !(typeof feedback === 'string' && feedback.trim().length > 0)
  })
}

export function collectTopicWeakQuestionSteps(
  topicSession: TopicSession,
): Extract<ChapterStep, { type: 'question' }>[] {
  const results: Extract<ChapterStep, { type: 'question' }>[] = []
  const collect = (blueprint: ChapterBlueprint | null, session: ChapterSession | null) => {
    if (!blueprint || !session) {
      return
    }
    results.push(...collectWeakQuestionSteps([blueprint], session))
  }
  collect(topicSession.entryCheckBlueprint, topicSession.entryCheckSession)
  for (const substep of topicSession.substeps) {
    collect(substep.blueprint, substep.session)
  }
  return results
}

/** Landkarte Phase 1: Platzhalter-Blueprint, während der Diagnosetest für ein Thema generiert wird. */
export function buildTopicDiagnosticPlaceholder(): ChapterBlueprint {
  return {
    id: TOPIC_DIAGNOSTIC_PLACEHOLDER_ID,
    title: 'Diagnosetest wird vorbereitet',
    description: 'Straton erstellt gerade Fragen zum Einstieg in dieses Thema.',
    steps: [
      {
        id: 'topic-diagnostic-placeholder-q',
        type: 'question',
        questionType: 'mcq',
        prompt: 'Straton bereitet deinen Diagnosetest vor …',
        options: ['Bitte warten'],
        expectedAnswer: 'Bitte warten',
        acceptableAnswers: [],
        evaluation: 'exact',
        hint: 'Dieser Platzhalter wird automatisch ersetzt.',
      },
    ],
  }
}

/** Landkarte Phase 1: Platzhalter-Blueprint, während der nächste Zwischenschritt für ein Thema generiert wird. */
export function buildTopicStepPlaceholder(stepNumber: number): ChapterBlueprint {
  return {
    id: `${TOPIC_STEP_PLACEHOLDER_ID}-${stepNumber}`,
    title: 'Nächster Lernschritt wird vorbereitet',
    description: 'Straton erstellt gerade einen neuen Lernschritt basierend auf deinem Wissensstand.',
    steps: [
      {
        id: `topic-step-placeholder-intro-${stepNumber}`,
        type: 'explanation',
        title: 'Adaptive Auswertung läuft',
        content: `Straton erstellt Lernschritt ${stepNumber} auf Basis deiner bisherigen Antworten zu diesem Thema.`,
        bullets: ['Schwachstellen werden priorisiert', 'Fragen werden passend zum Wissensstand vorbereitet'],
      },
    ],
  }
}

/** Landkarte Phase 1: Fallback-Zwischenschritt, falls die KI-Generierung endgültig fehlschlägt — wiederholt vorhandene Schwachstellen-Fragen. */
export function buildTopicStepFallback(
  weakQuestions: Extract<ChapterStep, { type: 'question' }>[],
  stepNumber: number,
): ChapterBlueprint {
  const steps: ChapterStep[] = [
    {
      id: `topic-step-fallback-intro-${stepNumber}`,
      type: 'explanation',
      title: 'Gezielte Wiederholung',
      content: 'Dieser Lernschritt trainiert gezielt Fragen, die du bisher in diesem Thema falsch beantwortet hast.',
      bullets: ['Gezielte Wiederholung', 'Fokus auf schwierige Punkte'],
      keyPrinciple: 'Wiederholung mit direktem Feedback festigt genau die Punkte, die noch unsicher sind.',
    },
    ...(weakQuestions.length > 0
      ? weakQuestions.slice(0, 5).map((step, index) => ({
          ...step,
          id: `topic-step-fallback-q${stepNumber}-${index + 1}`,
        }))
      : []),
  ]
  return {
    id: `topic-step-fallback-${stepNumber}`,
    title: 'Wiederholung',
    description: 'Fallback-Lernschritt mit bisherigen Schwachstellen-Fragen',
    steps,
  }
}

// --- Neues Modell: Zwischenschritt-Outline (Teilthemen-Titel) nach dem Einstiegscheck ---

/** Zielanzahl Zwischenschritte pro Thema (aus dem Einstiegscheck abgeleitet). */
export const TOPIC_SUBSTEP_MIN = 3
export const TOPIC_SUBSTEP_MAX = 4

/** Fester Ablauf eines Zwischenschritts (für den Content-Prompt): 3 Blöcke à 2 Erklärungen + 1 Zwischenfrage.
 *  Übungskarten (Lernkarten-Set) und Abschluss-Arbeitsblatt kommen danach als eigene, aus dem Flow generierte
 *  Elemente — nicht Teil dieses Blueprints (siehe `learnFlashcardSets`/`learnWorksheets`). */
export const SUBSTEP_FLOW_RULES = [
  'FESTER AUFBAU (Reihenfolge exakt einhalten): Der Zwischenschritt besteht aus 3 identisch aufgebauten Blöcken.',
  'Jeder Block (3×): 2 explanation-Steps → 1 question-Step (questionType mcq ODER true_false).',
  'Ergebnis pro Zwischenschritt: genau 6 explanation-Steps und genau 3 question-Steps (jeweils mcq ODER true_false — KEINE Freitext-/text-Fragen) — in genau dieser Reihenfolge.',
  'explanation-Steps lehren das Teilthema Schritt für Schritt (Definition, Beispiel, Rechenweg); jede braucht ein Feld "keyPrinciple".',
  'question-Steps prüfen kurz das gerade Erklärte (schnelle Verständnisfrage); jede braucht ein Feld "hint".',
].join('\n')

const SUBSTEP_JSON_SCHEMA_EXAMPLE =
  '{"id":"substep-1","title":"...","steps":[{"id":"s1","type":"explanation","title":"...","content":"...","bullets":["..."],"keyPrinciple":"..."},{"id":"s2","type":"explanation","title":"...","content":"...","keyPrinciple":"..."},{"id":"s3","type":"question","questionType":"mcq","prompt":"...","options":["a","b","c"],"expectedAnswer":"a","hint":"...","explanation":"...","skillTag":"..."},"… Block 2: 2 explanation + 1 question(true_false); Block 3: 2 explanation + 1 question(mcq) …"]}'

export type BuildSubstepOutlinePromptArgs = {
  pathTitle: string
  topicTitle: string
  learningGoal?: string
  entryCheckSummary: string
  weaknessSummary: string
  materialContext: string
  attempt: number
  validationHint: string
}

/** Prompt: aus dem Einstiegscheck eine Liste von 3–6 Teilthemen-Titeln für die Zwischenschritte ableiten. */
export function buildSubstepOutlinePrompt(args: BuildSubstepOutlinePromptArgs): string {
  const lines = [
    `Lernpfad: ${args.pathTitle}`,
    `Thema: ${args.topicTitle}`,
    args.learningGoal?.trim() ? `Lernziel dieses Themas (verbindlich): ${args.learningGoal.trim()}` : '',
    `Der Lernende hat gerade den Einstiegscheck zu diesem Thema absolviert. Leite daraus ${TOPIC_SUBSTEP_MIN}-${TOPIC_SUBSTEP_MAX} Teilthemen ab, die er als Zwischenschritte durcharbeiten soll — priorisiere die Schwachstellen.`,
    'Antwortformat: NUR valides JSON-Array aus Strings (die Teilthemen-Titel), z. B. ["Grundlagen X","X berechnen","Typische Fehler bei X"]. Kein Markdown, kein Fliesstext.',
    'Jeder Titel ist kurz (2-6 Wörter), fachlich konkret und ohne Nummerierung.',
    `Auswertung des Einstiegschecks:\n${args.entryCheckSummary}`,
    args.weaknessSummary.trim() ? `Falsch beantwortete Fragen (priorisieren):\n${args.weaknessSummary}` : '',
    args.materialContext ? `Materialauszüge:\n${args.materialContext}` : '',
    args.attempt > 1 ? 'WICHTIG: Der vorige Versuch war ungültig. Gib ausschließlich ein JSON-String-Array zurück.' : '',
    args.validationHint ? `Ungültigkeitsgrund im Vorversuch: ${args.validationHint}` : '',
  ]
  return lines.filter(Boolean).join('\n\n')
}

/** Parst ein JSON-String-Array aus einer KI-Antwort zu Teilthemen-Titeln (defensiv, tolerant). */
export function parseSubstepTitlesFromText(text: string): string[] {
  const tryParse = (raw: string): string[] | null => {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const titles = parsed
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
        return titles.length > 0 ? titles : null
      }
    } catch {
      return null
    }
    return null
  }
  const direct = tryParse(text.trim())
  if (direct) {
    return direct.slice(0, TOPIC_SUBSTEP_MAX)
  }
  const match = text.match(/\[[\s\S]*\]/)
  if (match) {
    const fromMatch = tryParse(match[0])
    if (fromMatch) {
      return fromMatch.slice(0, TOPIC_SUBSTEP_MAX)
    }
  }
  return []
}

/** Fallback-Titel, falls die Outline-Generierung fehlschlägt. */
export function buildSubstepOutlineFallback(topicTitle: string): string[] {
  const base = topicTitle.trim() || 'dieses Thema'
  return [`Grundlagen: ${base}`, `${base} in der Praxis`, `${base}: typische Fehler`]
}

export type BuildSubstepContentPromptArgs = {
  pathTitle: string
  topicTitle: string
  substepTitle: string
  learningGoal?: string
  materialContext: string
  weaknessSummary: string
  attempt: number
  validationHint: string
}

/** Prompt für den Vollinhalt EINES Zwischenschritts im festen 3-Block-Aufbau + Übungskarten. */
export function buildSubstepContentPrompt(args: BuildSubstepContentPromptArgs): string {
  const lines = [
    `Lernpfad: ${args.pathTitle}`,
    `Thema: ${args.topicTitle}`,
    `Zwischenschritt (Teilthema): ${args.substepTitle}`,
    args.learningGoal?.trim() ? `Lernziel des Themas: ${args.learningGoal.trim()}` : '',
    'Erstelle den Inhalt für GENAU DIESES Teilthema als JSON-Objekt mit genau einem Kapitelobjekt (Feld "steps").',
    'Antwortformat: NUR valides JSON — kein Markdown, kein Fliesstext ausserhalb des JSON.',
    SUBSTEP_FLOW_RULES,
    `Schema-Beispiel: ${SUBSTEP_JSON_SCHEMA_EXAMPLE}`,
    CHAPTER_SKILL_TAG_RULE,
    CHAPTER_LEARNING_FIDELITY_RULES,
    args.weaknessSummary.trim() ? `Bekannte Schwachstellen (gezielt aufgreifen):\n${args.weaknessSummary}` : '',
    args.materialContext
      ? `Materialauszüge (mind. die Hälfte der Fragen muss sich hierauf beziehen):\n${args.materialContext}`
      : 'Keine Materialauszüge vorhanden — nutze praxisnahe kaufmännische Beispiele.',
    args.attempt > 1 ? 'WICHTIG: Der vorige Versuch hielt den festen Aufbau nicht ein. Halte dich exakt an 6 explanation + 3 question (mcq/true_false).' : '',
    args.validationHint ? `Ungültigkeitsgrund im Vorversuch: ${args.validationHint}` : '',
  ]
  return lines.filter(Boolean).join('\n\n')
}

/** Validiert den festen Zwischenschritt-Aufbau (tolerant zu Reihenfolge, streng zu Mindestmengen). */
export function validateGeneratedSubstep(chapter: ChapterBlueprint): { valid: boolean; reason: string } {
  if (!chapter.title.trim()) {
    return { valid: false, reason: 'Der Zwischenschritt braucht einen title.' }
  }
  const explanations = chapter.steps.filter((step) => step.type === 'explanation')
  const questions = chapter.steps.filter(
    (step): step is Extract<ChapterStep, { type: 'question' }> => step.type === 'question',
  )
  if (explanations.length < 6) {
    return { valid: false, reason: `Es braucht mindestens 6 Erklärungen (explanation), gefunden: ${explanations.length}.` }
  }
  const checkQuestions = questions.filter((q) => q.questionType === 'mcq' || q.questionType === 'true_false').length
  if (checkQuestions < 3) {
    return { valid: false, reason: `Es braucht mindestens 3 Zwischenfragen (mcq/true_false), gefunden: ${checkQuestions}.` }
  }
  return { valid: true, reason: '' }
}

/** Fallback-Vollinhalt eines Zwischenschritts (fester Aufbau) aus Schwachstellen, falls die KI endgültig scheitert. */
export function buildSubstepContentFallback(
  substepTitle: string,
  weakQuestions: Extract<ChapterStep, { type: 'question' }>[],
): ChapterBlueprint {
  const title = substepTitle.trim() || 'Teilthema'
  const steps: ChapterStepWithoutId[] = []
  for (let block = 0; block < 3; block += 1) {
    steps.push(
      {
        type: 'explanation',
        title: `${title} — Grundlage ${block + 1}`,
        content: `Kernidee zu „${title}" (Teil ${block + 1}). Diese Zusammenfassung ersetzt vorübergehend den KI-Inhalt.`,
        bullets: ['Wichtigster Punkt', 'Typische Anwendung'],
        keyPrinciple: `Behalte die zentrale Regel zu „${title}" im Kopf.`,
      },
      {
        type: 'explanation',
        title: `${title} — Vertiefung ${block + 1}`,
        content: `Ein kurzes Beispiel zu „${title}".`,
        keyPrinciple: `Wende die Regel zu „${title}" auf ein konkretes Beispiel an.`,
      },
    )
    const weak = weakQuestions[block]
    steps.push(
      weak && (weak.questionType === 'mcq' || weak.questionType === 'true_false')
        ? weak
        : {
            type: 'question',
            questionType: 'true_false',
            prompt: `Aussage zu „${title}": Diese Regel gilt immer ohne Ausnahme.`,
            options: ['Wahr', 'Falsch'],
            expectedAnswer: 'Falsch',
            hint: 'Achte auf absolute Formulierungen wie „immer".',
          },
    )
  }
  return {
    id: 'substep-content-fallback',
    title,
    description: 'Fallback-Inhalt im festen Aufbau (KI vorübergehend nicht verfügbar).',
    source: 'fallback',
    steps: steps.map((step, index) => ({ ...step, id: `fallback-s${index + 1}` }) as ChapterStep),
  }
}
