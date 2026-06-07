import { normalizeDocumentIntentUserText } from '../constants/documentAttachmentIntent'

export type DirectAnswerMcqOption = { letter: string; text: string }

export type DirectAnswerMcqPreviewData = {
  prompt: string
  options: DirectAnswerMcqOption[]
  correctLetter: string | null
  /** Erklärung ohne die Antwort-Zeile (optional). */
  rationale: string
}

const OPTION_LINE_RE = /^(?:[-*•–]\s+|[A-Da-d][.)]\s+|\d+[.)]\s+)(.+)$/
const IPV4_CIDR_RE = /^\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?$/
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/
const BARE_OPTION_MAX_LEN = 100

/** Option ohne Bullet/A)/1. — z. B. IP-Zeilen unter der Frage. */
export function looksLikeBareMcOptionLine(line: string): boolean {
  const t = line.trim()
  if (!t || t.length > BARE_OPTION_MAX_LEN) {
    return false
  }
  if (OPTION_LINE_RE.test(t)) {
    return false
  }
  if (IPV4_CIDR_RE.test(t) || IPV4_RE.test(t)) {
    return true
  }
  if (/^[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{0,4}){2,7}$/i.test(t)) {
    return true
  }
  if (/^[A-Za-z0-9][A-Za-z0-9._\-\/:+%]{0,72}$/.test(t) && !/[?!]/.test(t)) {
    return true
  }
  const words = t.split(/\s+/).filter(Boolean)
  return words.length >= 1 && words.length <= 5 && t.length <= 72
}

export function countMcOptionLines(text: string): number {
  let marked = 0
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) {
      continue
    }
    if (/^[-*•–]\s+\S/.test(t) || /^[A-Da-d][.)]\s+\S/.test(t) || /^[1-9][.)]\s+\S/.test(t)) {
      marked += 1
    }
  }
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  let trailingBare = 0
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (looksLikeBareMcOptionLine(lines[i])) {
      trailingBare += 1
    } else {
      break
    }
  }
  if (marked >= 2) {
    return marked
  }
  return trailingBare >= 2 ? trailingBare : 0
}

function tryParseBareMcOptions(lines: string[]): {
  prompt: string
  options: DirectAnswerMcqOption[]
} | null {
  let trailingStart = lines.length
  let bareCount = 0
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (looksLikeBareMcOptionLine(lines[i])) {
      bareCount += 1
      trailingStart = i
    } else {
      break
    }
  }
  if (bareCount < 2) {
    return null
  }
  const prompt = lines.slice(0, trailingStart).join(' ').trim()
  if (!prompt) {
    return null
  }
  return {
    prompt,
    options: lines.slice(trailingStart).map((text, index) => ({
      letter: String.fromCharCode(65 + index),
      text,
    })),
  }
}

const ANSWER_LETTER_RE =
  /\*\*(?:Antwort|Answer)\s*:\s*([A-Da-d])\*\*|\b(?:Antwort|Answer)\s*:\s*\*?\*?([A-Da-d])\*?\*?(?:\s|—|-|–|$)/i

const ANSWER_TEXT_LINE_RE =
  /(?:\*\*)?(?:Antwort|Answer|Richtige\s+Antwort)(?:\*\*)?\s*:\s*(.+?)(?:\s*[-–—]\s*|$)/i

function stripAttachmentBlocks(text: string): string {
  return normalizeDocumentIntentUserText(text)
}

function parseOptionLine(line: string): { text: string; explicitLetter?: string } | null {
  const t = line.trim()
  if (!t) {
    return null
  }
  const letterMatch = t.match(/^([A-Da-d])[.)]\s+(.+)$/s)
  if (letterMatch) {
    return { explicitLetter: letterMatch[1].toUpperCase(), text: letterMatch[2].trim() }
  }
  const bulletMatch = t.match(OPTION_LINE_RE)
  if (bulletMatch) {
    return { text: bulletMatch[1].trim() }
  }
  return null
}

/** MC-Frage aus Nutzer-Nachricht (Bullet- oder A)–Optionen). */
export function parseMcqQuestionFromUserMessage(userContent: string): {
  prompt: string
  options: DirectAnswerMcqOption[]
} | null {
  const normalized = stripAttachmentBlocks(userContent).replace(/\r\n/g, '\n')
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 3) {
    return null
  }

  const optionRows: Array<{ text: string; explicitLetter?: string }> = []
  let firstOptionIndex = -1
  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseOptionLine(lines[i])
    if (parsed) {
      if (firstOptionIndex === -1) {
        firstOptionIndex = i
      }
      optionRows.push(parsed)
    }
  }
  if (optionRows.length < 2) {
    return tryParseBareMcOptions(lines)
  }

  const prompt = lines.slice(0, firstOptionIndex).join(' ').trim()
  if (!prompt) {
    return null
  }

  const options: DirectAnswerMcqOption[] = optionRows.map((row, index) => ({
    letter: row.explicitLetter ?? String.fromCharCode(65 + index),
    text: row.text,
  }))

  return { prompt, options }
}

/** Richtige Option aus Assistenten-Antwort. */
export function parseDirectAnswerLetter(
  assistantContent: string,
  options?: DirectAnswerMcqOption[],
): string | null {
  const text = assistantContent.replace(/\r\n/g, '\n')
  const letterMatch = text.match(ANSWER_LETTER_RE)
  const letter = (letterMatch?.[1] ?? letterMatch?.[2])?.toUpperCase()
  if (letter && /^[A-D]$/.test(letter)) {
    return letter
  }

  for (const line of text.split('\n')) {
    if (!/\|/.test(line) || !/✓|✔/.test(line)) {
      continue
    }
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean)
    if (cells.length < 2) {
      continue
    }
    const last = cells[cells.length - 1]
    if (/✓|✔/.test(last)) {
      const first = cells[0].replace(/\*\*/g, '').trim()
      const opt = first.match(/^([A-D])$/i)
      if (opt) {
        return opt[1].toUpperCase()
      }
    }
  }

  if (options?.length) {
    const fromAnswerLine = extractAnswerTextFromAssistant(text)
    if (fromAnswerLine) {
      const byText = matchOptionLetterByText(fromAnswerLine, options)
      if (byText) {
        return byText
      }
    }
    return inferLetterFromAssistantContent(text, options)
  }
  return null
}

function normalizeMcMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\*\*/g, '')
    .replace(/[«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractAnswerTextFromAssistant(assistantContent: string): string | null {
  const head = assistantContent.replace(/\r\n/g, '\n').slice(0, 1200)
  const lineMatch = head.match(
    /^\s*(?:\*\*)?(?:Antwort|Answer|Richtige\s+Antwort)(?:\*\*)?\s*:\s*(.+?)\s*$/im,
  )
  if (lineMatch?.[1]) {
    return lineMatch[1].replace(/\*\*/g, '').trim()
  }
  const inlineMatch = head.match(ANSWER_TEXT_LINE_RE)
  if (inlineMatch?.[1]) {
    return inlineMatch[1].replace(/\*\*/g, '').trim()
  }
  return null
}

function matchOptionLetterByText(
  answerText: string,
  options: DirectAnswerMcqOption[],
): string | null {
  const norm = normalizeMcMatchText(answerText)
  if (!norm) {
    return null
  }
  const letterOnly = norm.match(/^([a-d])$/)
  if (letterOnly) {
    return letterOnly[1].toUpperCase()
  }
  for (const opt of options) {
    if (normalizeMcMatchText(opt.text) === norm) {
      return opt.letter
    }
  }
  const sorted = [...options].sort((a, b) => b.text.length - a.text.length)
  for (const opt of sorted) {
    const optNorm = normalizeMcMatchText(opt.text)
    if (optNorm.length < 3) {
      continue
    }
    if (norm.includes(optNorm) || optNorm.includes(norm)) {
      return opt.letter
    }
  }
  return null
}

function inferLetterFromAssistantContent(
  assistantContent: string,
  options: DirectAnswerMcqOption[],
): string | null {
  for (const opt of options) {
    const escaped = opt.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const rowRe = new RegExp(
      `${escaped}[^\\n|]{0,60}(?:privat|richtig|korrekt|correct|✓|✔|true|ja)\\b`,
      'i',
    )
    if (rowRe.test(assistantContent)) {
      return opt.letter
    }
    const pipeRow = assistantContent
      .split('\n')
      .find((line) => line.includes('|') && line.includes(opt.text))
    if (
      pipeRow &&
      /privat|richtig|korrekt|correct|✓|✔/i.test(pipeRow) &&
      !/öffentlich|public|falsch|incorrect/i.test(pipeRow)
    ) {
      return opt.letter
    }
  }
  return null
}

function stripDirectAnswerLinesFromRationale(assistantContent: string): string {
  const lines = assistantContent.replace(/\r\n/g, '\n').split('\n')
  const kept: string[] = []
  let skippingVerbesserungen = false
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      if (kept.length > 0 && kept[kept.length - 1] !== '') {
        kept.push('')
      }
      continue
    }
    if (/^#{1,3}\s+/.test(line) && /verbesserung/i.test(line)) {
      skippingVerbesserungen = true
      continue
    }
    if (skippingVerbesserungen) {
      continue
    }
    if (ANSWER_LETTER_RE.test(line)) {
      continue
    }
    if (/^(?:\*\*)?(?:Antwort|Answer|Richtige\s+Antwort)(?:\*\*)?\s*:/i.test(line)) {
      continue
    }
    if (/^\|/.test(line) && /\|/.test(line.slice(1))) {
      continue
    }
    kept.push(raw)
  }
  return kept.join('\n').trim()
}

/** MC-Frage aus vorheriger User-Nachricht (Folgenachricht «nur Antwort»). */
export function resolveMcqUserContentFromThread(
  messages: ReadonlyArray<{ role: string; content: string }>,
  assistantMessageIndex: number,
): string | null {
  for (let i = assistantMessageIndex - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (m.role !== 'user') {
      continue
    }
    const routingContent = stripAttachmentBlocks(m.content)
    if (routingContent && parseMcqQuestionFromUserMessage(routingContent)) {
      return routingContent
    }
  }
  return null
}

export function buildDirectAnswerMcqPreview(
  userContent: string,
  assistantContent: string,
  threadMessages?: ReadonlyArray<{ role: string; content: string }>,
  assistantMessageIndex?: number,
): DirectAnswerMcqPreviewData | null {
  let question = parseMcqQuestionFromUserMessage(userContent)
  if (!question && threadMessages && typeof assistantMessageIndex === 'number') {
    const fromThread = resolveMcqUserContentFromThread(threadMessages, assistantMessageIndex)
    if (fromThread) {
      question = parseMcqQuestionFromUserMessage(fromThread)
    }
  }
  if (!question) {
    return null
  }
  const correctLetter = parseDirectAnswerLetter(assistantContent, question.options)
  const rationale = stripDirectAnswerLinesFromRationale(assistantContent)
  return {
    prompt: question.prompt,
    options: question.options,
    correctLetter,
    rationale,
  }
}
