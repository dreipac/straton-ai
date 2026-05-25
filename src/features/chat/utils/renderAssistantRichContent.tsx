import { useEffect, useId, useState, type ReactNode } from 'react'
import {
  renderAssistantInline,
  stripGeneratedImageModelFooter,
  type AssistantInlineImageOptions,
} from './markdownInline'

type Block =
  | { type: 'hr' }
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  /** Markdown-Zeilen mit > — Bibel/Quran nur bei erkennbarer Stellenangabe; sonst normales Zitat */
  | { type: 'blockquote'; lines: string[]; quoteKind: 'bible' | 'quran' | 'plain' }
  /** Markdown-Codeblock mit ``` */
  | { type: 'code'; language: string; code: string }
  /** E-Mail-/Briefentwurf: ```email oder erkannter Fließtext mit Betreff: */
  | { type: 'emailDraft'; body: string }
  /** GFM-Pipe-Tabelle: erste Zeile = Kopfzeile, weitere = Daten */
  | { type: 'table'; rows: string[][] }
  /** Multiple-Choice (Frage + A–D), getrennt von Standard-Listen */
  | { type: 'mcq'; title?: string; questionNumber: number; prompt: string; options: McqOption[] }

type McqOption = { letter: string; text: string }

function stripBoldMarkers(line: string): string {
  return line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim()
}

/** Erste Zeile wirkt wie eine deutschsprachige Bibelstellenangabe (Buch + Kap.,Vers o. Ä.). */
function looksLikeGermanBibleVerseHeading(line: string): boolean {
  const t = stripBoldMarkers(line)
  if (!t) {
    return false
  }
  if (/^(sure|sura)\s*\d+/i.test(t)) {
    return false
  }

  const hasChapterVerse =
    /\b\d{1,3}\s*[,.]\s*\d{1,3}\b/.test(t) ||
    /\b\d{1,3}\s*:\s*\d{1,3}\b/.test(t) ||
    /^Psalm(?:en)?\s+\d{1,3}(?:\s*[,.]\s*\d{1,3})?$/i.test(t)

  const bookAtStart =
    /^(?:[12]\s*)?(?:Mose|Exodus|Levitikus|Numeri|Deuteronomium|5\.\s*Mose|Josua|Richter|Ruth|(?:1|2)\s*Samuel|(?:1|2)\s*Könige|(?:1|2)\s*Chronik|Esra|Nehemia|Esther|Hiob|Psalm|Psalmen|Sprüche|Prediger|Hohelied|Jesaja|Jeremia|Klagelieder|Hesekiel|Daniel|Hosea|Joel|Amos|Obadja|Jona|Micha|Nahum|Habakuk|Sephaja|Haggai|Sacharja|Maleachi|Johannes|Matthäus|Markus|Lukas|Apostelgeschichte|Apg\.|Römer|Röm\.|Galater|Epheser|Philipper|Kolosser|(?:1|2)\.\s*Korinther|(?:1|2)\.\s*Thessalonicher|(?:1|2)\.\s*Timotheus|Titus|Philemon|Hebräer|Jakobus|(?:1|2)\.\s*Petrus|(?:1|3)\.\s*Johannes|(?:2|3)\.\s*Johannes|Judas|Offenbarung|Offb\.)\b/i.test(
      t,
    )

  return Boolean(bookAtStart && hasChapterVerse)
}

function isQuranReferenceLine(line: string): boolean {
  const t = stripBoldMarkers(line).trim()
  if (!t) {
    return false
  }
  return /^(sure|sura)\s*\d+(?:\s*[,.:]\s*\d+)?$/i.test(t)
}

function classifyScriptureBlockquote(lines: string[], _contextBefore: string): 'bible' | 'quran' | 'plain' {
  const firstLine = lines.map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  const head = stripBoldMarkers(firstLine)

  // Sure-/Sura-Zeile ist eindeutig — keine «Bibel»-Box
  if (isQuranReferenceLine(head)) {
    return 'quran'
  }

  if (looksLikeGermanBibleVerseHeading(firstLine)) {
    return 'bible'
  }

  return 'plain'
}

function parsePipeTableRow(line: string): string[] | null {
  const t = line.trim()
  if (!t.startsWith('|')) {
    return null
  }
  const parts = t.split('|')
  if (parts.length < 3) {
    return null
  }
  const cells = parts.slice(1, -1).map((c) => c.trim())
  return cells.length ? cells : null
}

function isTableSeparatorLine(line: string): boolean {
  const t = line.trim()
  if (!t.startsWith('|') || !t.includes('-')) {
    return false
  }
  const parts = t.split('|')
  if (parts.length < 3) {
    return false
  }
  const cells = parts
    .slice(1, -1)
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
  if (cells.length === 0) {
    return false
  }
  return cells.every((c) => /^:?-{3,}:?$/.test(c))
}

function normalizeTableRow(cells: string[], colCount: number): string[] {
  const out = cells.slice(0, colCount)
  while (out.length < colCount) {
    out.push('')
  }
  return out
}

function tryParseMarkdownTable(
  lines: string[],
  start: number,
): { rows: string[][]; end: number } | null {
  if (start + 1 >= lines.length) {
    return null
  }
  const headerLine = lines[start].trimEnd()
  const sepLine = lines[start + 1].trimEnd()
  const header = parsePipeTableRow(headerLine)
  if (!header || header.length === 0) {
    return null
  }
  if (!isTableSeparatorLine(sepLine)) {
    return null
  }

  const colCount = header.length
  const rows: string[][] = [normalizeTableRow(header, colCount)]
  let i = start + 2
  while (i < lines.length) {
    const raw = lines[i].trimEnd()
    if (raw.trim() === '') {
      break
    }
    const row = parsePipeTableRow(raw)
    if (!row) {
      break
    }
    rows.push(normalizeTableRow(row, colCount))
    i++
  }

  return { rows, end: i }
}

function parseBlocks(raw: string): Block[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  const para: string[] = []
  let listItems: string[] | null = null
  let orderedItems: string[] | null = null
  let quoteLines: string[] | null = null
  /** Kontext vor dem ersten `>` — zur Klassifikation Bibel / Quran / normales Zitat */
  let quoteParseContext = ''
  let codeLines: string[] | null = null
  let codeLanguage = ''

  function recentContextText(currentLine: string): string {
    const fromPara = para.slice(-2).join(' ')
    const fromList = [...(listItems ?? []), ...(orderedItems ?? [])].slice(-2).join(' ')
    const fromBlocks = blocks
      .slice(-3)
      .map((b) => {
        switch (b.type) {
          case 'h1':
          case 'h2':
          case 'h3':
          case 'p':
            return b.text
          case 'ul':
          case 'ol':
            return b.items.slice(-2).join(' ')
          default:
            return ''
        }
      })
      .join(' ')
    return [fromPara, fromList, fromBlocks, currentLine].filter(Boolean).join(' ')
  }

  function flushPara() {
    if (para.length) {
      blocks.push({ type: 'p', text: para.join('\n') })
      para.length = 0
    }
  }

  function flushList() {
    if (listItems && listItems.length) {
      blocks.push({ type: 'ul', items: [...listItems] })
      listItems = null
    }
    if (orderedItems && orderedItems.length) {
      blocks.push({ type: 'ol', items: [...orderedItems] })
      orderedItems = null
    }
  }

  function flushQuote() {
    if (quoteLines && quoteLines.length) {
      const kind = classifyScriptureBlockquote(quoteLines, quoteParseContext)
      blocks.push({ type: 'blockquote', lines: [...quoteLines], quoteKind: kind })
      quoteLines = null
      quoteParseContext = ''
    }
  }

  function flushCode() {
    if (codeLines) {
      const raw = codeLines.join('\n')
      const lang = codeLanguage.trim().toLowerCase()
      if (lang === 'email' || lang === 'mail' || lang === 'e-mail') {
        blocks.push({ type: 'emailDraft', body: raw })
      } else {
        blocks.push({ type: 'code', language: codeLanguage, code: raw })
      }
      codeLines = null
      codeLanguage = ''
    }
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    const t = line.trimEnd()
    const trimmed = t.trim()

    if (codeLines) {
      if (trimmed.startsWith('```')) {
        flushCode()
      } else {
        codeLines.push(line)
      }
      continue
    }

    if (trimmed.startsWith('```')) {
      flushQuote()
      flushList()
      flushPara()
      codeLines = []
      codeLanguage = trimmed.replace(/^```/, '').trim().toLowerCase()
      continue
    }

    const tableTry = tryParseMarkdownTable(lines, lineIndex)
    if (tableTry) {
      flushQuote()
      flushList()
      flushPara()
      blocks.push({ type: 'table', rows: tableTry.rows })
      lineIndex = tableTry.end - 1
      continue
    }

    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushQuote()
      flushList()
      flushPara()
      blocks.push({ type: 'hr' })
      continue
    }

    const bq = trimmed.match(/^>\s*(.*)$/)
    if (bq) {
      if (!quoteLines) {
        const paraTail = para.length > 0 ? para[para.length - 1].trim() : ''
        const ctxCombined = `${recentContextText(trimmed)} ${paraTail}`.trim()
        let carriedHeading: string | null = null
        if (paraTail && isQuranReferenceLine(paraTail)) {
          para.pop()
          carriedHeading = paraTail
        }

        flushList()
        flushPara()

        quoteLines = []
        quoteParseContext = ctxCombined
        if (carriedHeading) {
          quoteLines.push(`**${carriedHeading}**`)
        }
      }
      quoteLines.push(bq[1])
      continue
    }

    if (trimmed === '') {
      flushQuote()
      flushList()
      flushPara()
      continue
    }

    if (trimmed.startsWith('###')) {
      const m = trimmed.match(/^###\s+(.*)$/)
      if (m) {
        flushQuote()
        flushList()
        flushPara()
        blocks.push({ type: 'h3', text: m[1] })
        continue
      }
    }

    if (trimmed.startsWith('##') && !trimmed.startsWith('###')) {
      const m = trimmed.match(/^##\s+(.*)$/)
      if (m) {
        flushQuote()
        flushList()
        flushPara()
        blocks.push({ type: 'h2', text: m[1] })
        continue
      }
    }

    if (trimmed.startsWith('#') && !trimmed.startsWith('##')) {
      const m = trimmed.match(/^#\s+(.*)$/)
      if (m) {
        flushQuote()
        flushList()
        flushPara()
        blocks.push({ type: 'h1', text: m[1] })
        continue
      }
    }

    const ul = trimmed.match(/^[-*]\s+(.*)$/)
    if (ul) {
      flushQuote()
      flushPara()
      if (orderedItems?.length) {
        flushList()
      }
      if (!listItems) {
        listItems = []
      }
      listItems.push(ul[1])
      continue
    }

    const ol = trimmed.match(/^\d+\.\s+(.*)$/)
    if (ol) {
      flushQuote()
      flushPara()
      if (listItems?.length) {
        flushList()
      }
      if (!orderedItems) {
        orderedItems = []
      }
      orderedItems.push(ol[1])
      continue
    }

    flushQuote()
    flushList()
    para.push(t)
  }

  flushQuote()
  flushCode()
  flushList()
  flushPara()
  return transformBlocksWithMcq(promotePlainParagraphEmailDrafts(blocks))
}

function isFragenHeading(text: string): boolean {
  const t = stripBoldMarkers(text).trim().replace(/:$/, '').trim()
  return /^fragen$/i.test(t)
}

function parseMcqOptionLine(raw: string): McqOption | null {
  const t = stripBoldMarkers(raw.trim())
  const m = t.match(/^([A-Da-d])\)\s+(.+)$/s)
  if (!m) {
    return null
  }
  return { letter: m[1].toUpperCase(), text: m[2].trim() }
}

function isMcqOptionsList(items: string[]): boolean {
  if (items.length < 2) {
    return false
  }
  const parsed = items.map(parseMcqOptionLine).filter((x): x is McqOption => x !== null)
  return parsed.length >= 2 && parsed.length >= Math.ceil(items.length * 0.75)
}

function parseMcqOptions(items: string[]): McqOption[] {
  return items.map(parseMcqOptionLine).filter((x): x is McqOption => x !== null)
}

function tryParseSingleMcqBlock(
  blocks: Block[],
  index: number,
): { block: Extract<Block, { type: 'mcq' }>; end: number } | null {
  const ol = blocks[index]
  const ul = blocks[index + 1]

  if (ol?.type === 'ol' && ol.items.length === 1 && ul?.type === 'ul' && isMcqOptionsList(ul.items)) {
    const options = parseMcqOptions(ul.items)
    if (options.length < 2) {
      return null
    }
    const prompt = ol.items[0]?.trim() ?? ''
    if (!prompt) {
      return null
    }
    return {
      block: { type: 'mcq', questionNumber: 1, prompt, options },
      end: index + 2,
    }
  }

  const p = blocks[index]
  if (p?.type === 'p' && ul?.type === 'ul' && isMcqOptionsList(ul.items)) {
    const plain = stripBoldMarkers(p.text.trim())
    const qm = plain.match(/^(\d{1,2})[.)]\s+(.+)$/s)
    if (qm) {
      const options = parseMcqOptions(ul.items)
      if (options.length < 2) {
        return null
      }
      return {
        block: {
          type: 'mcq',
          questionNumber: Math.max(1, Number.parseInt(qm[1], 10) || 1),
          prompt: qm[2].trim(),
          options,
        },
        end: index + 2,
      }
    }
  }

  return null
}

function transformBlocksWithMcq(blocks: Block[]): Block[] {
  const out: Block[] = []
  let i = 0
  let questionCounter = 0

  while (i < blocks.length) {
    let title: string | undefined
    let scan = i
    const head = blocks[scan]
    if (
      head &&
      (head.type === 'p' || head.type === 'h2' || head.type === 'h3') &&
      isFragenHeading(head.type === 'p' ? head.text : head.text)
    ) {
      title = 'Fragen'
      scan++
    }

    const mcqBatch: Extract<Block, { type: 'mcq' }>[] = []
    let cursor = scan
    while (cursor < blocks.length) {
      const parsed = tryParseSingleMcqBlock(blocks, cursor)
      if (!parsed) {
        break
      }
      questionCounter += 1
      mcqBatch.push({
        ...parsed.block,
        questionNumber: parsed.block.questionNumber > 1 ? parsed.block.questionNumber : questionCounter,
      })
      cursor = parsed.end
    }

    if (mcqBatch.length > 0) {
      mcqBatch.forEach((mcq, idx) => {
        out.push({
          ...mcq,
          title: idx === 0 ? title : undefined,
        })
      })
      i = cursor
      continue
    }

    out.push(blocks[i])
    i++
  }

  return out
}

function splitBetreffFromEmailBody(body: string): { subject?: string; rest: string } {
  const trimmed = body.trim()
  const nlPos = trimmed.search(/\r?\n/)
  if (nlPos === -1) {
    return { rest: trimmed }
  }
  const firstLine = stripBoldMarkers(trimmed.slice(0, nlPos)).trim()
  const m = /^betreff\s*:\s*(.+)$/i.exec(firstLine)
  if (!m) {
    return { rest: trimmed }
  }
  const rest = trimmed.slice(nlPos + 1).replace(/^\r?\n+/, '').trimStart()
  return { subject: m[1].trim(), rest }
}

/** Fließtext mit «Betreff:» und typischer Mail (Fallback, wenn das Modell keinen ```email-Block nutzt). */
function promotePlainParagraphEmailDrafts(blocks: Block[]): Block[] {
  return blocks.map((b) => {
    if (b.type !== 'p') {
      return b
    }
    const t = b.text.trim()
    if (t.length < 28) {
      return b
    }
    const firstLine = stripBoldMarkers(t.split(/\r?\n/, 1)[0] ?? '').trim()
    if (!/^betreff\s*:/i.test(firstLine)) {
      return b
    }
    if (!/\r?\n/.test(t)) {
      return b
    }
    if (
      !/\b(hallo|sehr geehrte|guten tag|liebe |mit freundlichen grüßen|freundliche grüße|viele grüße|\bvg\b)/i.test(
        t,
      )
    ) {
      return b
    }
    return { type: 'emailDraft', body: t }
  })
}

function buildEmailDraftClipboardText(subject: string, letter: string): string {
  const s = subject.trim()
  const l = letter.trim()
  if (s && l) {
    return `Betreff: ${s}\n\n${l}`
  }
  if (s) {
    return `Betreff: ${s}`
  }
  return l
}

function EmailDraftBlock({ body }: { body: string }) {
  const betreffFieldId = useId()
  const letterFieldId = useId()
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const { subject: parsedSubject, rest: parsedRest } = splitBetreffFromEmailBody(body)
  const initialLetter = (parsedSubject ? parsedRest : body).trim()

  const [editedSubject, setEditedSubject] = useState(() => parsedSubject ?? '')
  const [editedLetter, setEditedLetter] = useState(() => initialLetter)

  useEffect(() => {
    const { subject: s, rest: r } = splitBetreffFromEmailBody(body)
    setEditedSubject(s ?? '')
    setEditedLetter((s ? r : body).trim())
  }, [body])

  useEffect(() => {
    if (copyState === 'idle') {
      return
    }
    const timer = window.setTimeout(() => setCopyState('idle'), 1400)
    return () => window.clearTimeout(timer)
  }, [copyState])

  function openInSystemMailApp() {
    // Kein URLSearchParams.toString(): das wandelt Leerzeichen in "+" um;
    // Outlook (und andere Clients) zeigen "+" in mailto oft wörtlich statt als Leerzeichen.
    const parts: string[] = []
    const subj = editedSubject.trim()
    const bod = editedLetter.trim()
    if (subj) {
      parts.push(`subject=${encodeURIComponent(subj)}`)
    }
    if (bod) {
      parts.push(`body=${encodeURIComponent(bod)}`)
    }
    const q = parts.join('&')
    window.location.assign(q ? `mailto:?${q}` : 'mailto:')
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildEmailDraftClipboardText(editedSubject, editedLetter))
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  const copyLabel = copyState === 'copied' ? 'Kopiert' : copyState === 'failed' ? 'Fehler' : 'Kopieren'

  return (
    <div className="chat-email-draft">
      <div className="chat-email-draft-head">
        <span className="chat-email-draft-badge">E-Mail</span>
        <div className="chat-email-draft-actions">
          <button
            type="button"
            className="chat-email-draft-mailto"
            onClick={openInSystemMailApp}
            title="Öffnet dein Mailprogramm mit diesem Text und Betreff — dort kannst du weiterbearbeiten, als Entwurf speichern oder senden."
          >
            E-Mail senden
          </button>
          <button
            type="button"
            className="chat-email-draft-copy"
            onClick={() => void handleCopy()}
            title="Aktuellen Text (Betreff + Nachricht) kopieren"
          >
            {copyLabel}
          </button>
        </div>
      </div>
      <div className="chat-email-draft-subject-row chat-email-draft-subject-edit">
        <label className="chat-email-draft-subject-k" htmlFor={betreffFieldId}>
          Betreff
        </label>
        <input
          id={betreffFieldId}
          type="text"
          className="chat-email-draft-subject-input"
          value={editedSubject}
          onChange={(e) => setEditedSubject(e.target.value)}
          placeholder="z. B. Krankmeldung"
          autoComplete="off"
        />
      </div>
      <div className="chat-email-draft-letter">
        <label className="chat-email-draft-letter-label" htmlFor={letterFieldId}>
          Nachricht
        </label>
        <textarea
          id={letterFieldId}
          className="chat-email-draft-textarea"
          value={editedLetter}
          onChange={(e) => setEditedLetter(e.target.value)}
          spellCheck={true}
          rows={12}
        />
      </div>
    </div>
  )
}

function McqBlock({
  title,
  questionNumber,
  prompt,
  options,
  imageOptions,
}: {
  title?: string
  questionNumber: number
  prompt: string
  options: McqOption[]
  imageOptions?: AssistantInlineImageOptions
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  function toggleOption(letter: string) {
    setChecked((prev) => ({ ...prev, [letter]: !prev[letter] }))
  }

  return (
    <section className="chat-mcq-block" aria-label={title ?? 'Multiple Choice'}>
      {title ? <p className="chat-mcq-heading">{title}</p> : null}
      <div className="chat-mcq-question">
        <span className="chat-mcq-number" aria-hidden="true">
          {questionNumber}
        </span>
        <p className="chat-mcq-prompt">{renderAssistantInline(prompt, imageOptions)}</p>
      </div>
      <ul className="chat-mcq-options" role="group" aria-label="Antwortmöglichkeiten">
        {options.map((option) => {
          const isChecked = Boolean(checked[option.letter])
          return (
            <li key={option.letter} className="chat-mcq-option-item">
              <button
                type="button"
                className={`chat-mcq-option${isChecked ? ' is-checked' : ''}`}
                aria-pressed={isChecked}
                onClick={() => toggleOption(option.letter)}
              >
                <span className="chat-mcq-checkbox" aria-hidden="true" />
                <span className="chat-mcq-option-letter">{option.letter}</span>
                <span className="chat-mcq-option-text">{renderAssistantInline(option.text, imageOptions)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (copyState === 'idle') {
      return
    }
    const timer = window.setTimeout(() => setCopyState('idle'), 1400)
    return () => window.clearTimeout(timer)
  }, [copyState])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  const buttonLabel = copyState === 'copied' ? 'Kopiert' : copyState === 'failed' ? 'Fehler' : 'Copy'

  return (
    <div className="chat-md-code-wrap">
      <div className="chat-md-code-head">
        <span className="chat-md-code-lang">{language || 'text'}</span>
        <button type="button" className="chat-md-code-copy" onClick={() => void handleCopy()}>
          {buttonLabel}
        </button>
      </div>
      <pre className="chat-md-code-pre">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function renderBlock(block: Block, i: number, imageOptions?: AssistantInlineImageOptions): ReactNode {
  const key = `blk-${i}`
  switch (block.type) {
    case 'hr':
      return <hr key={key} className="chat-md-hr" />
    case 'h1':
      return (
        <h2 key={key} className="chat-md-h chat-md-h1">
          {renderAssistantInline(block.text, imageOptions)}
        </h2>
      )
    case 'h2':
      return (
        <h3 key={key} className="chat-md-h chat-md-h2">
          {renderAssistantInline(block.text, imageOptions)}
        </h3>
      )
    case 'h3':
      return (
        <h4 key={key} className="chat-md-h chat-md-h3">
          {renderAssistantInline(block.text, imageOptions)}
        </h4>
      )
    case 'p':
      return (
        <p key={key} className="chat-md-p">
          {renderAssistantInline(block.text, imageOptions)}
        </p>
      )
    case 'ul':
      return (
        <ul key={key} className="chat-md-ul">
          {block.items.map((item, j) => (
            <li key={`${key}-li-${j}`} className="chat-md-li">
              {renderAssistantInline(item, imageOptions)}
            </li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol key={key} className="chat-md-ol">
          {block.items.map((item, j) => (
            <li key={`${key}-li-${j}`} className="chat-md-li">
              {renderAssistantInline(item, imageOptions)}
            </li>
          ))}
        </ol>
      )
    case 'blockquote':
      if (block.quoteKind === 'plain') {
        return (
          <blockquote key={key} className="chat-md-blockquote">
            <div className="chat-md-blockquote-body">
              {block.lines.map((line, j) => (
                <p key={`${key}-ln-${j}`} className="chat-md-blockquote-line">
                  {renderAssistantInline(line, imageOptions)}
                </p>
              ))}
            </div>
          </blockquote>
        )
      }
      return (
        <blockquote
          key={key}
          className={`chat-bible-verse${block.quoteKind === 'quran' ? ' chat-bible-verse--quran' : ''}`}
        >
          <span className="chat-bible-verse-label">{block.quoteKind === 'quran' ? 'Quran' : 'Bibel'}</span>
          <div className="chat-bible-verse-body">
            {block.lines.map((line, j) => (
              <p key={`${key}-ln-${j}`} className="chat-bible-verse-line">
                {renderAssistantInline(line, imageOptions)}
              </p>
            ))}
          </div>
        </blockquote>
      )
    case 'code':
      return <CodeBlock key={key} code={block.code} language={block.language} />
    case 'emailDraft':
      return <EmailDraftBlock key={key} body={block.body} />
    case 'mcq':
      return (
        <McqBlock
          key={key}
          title={block.title}
          questionNumber={block.questionNumber}
          prompt={block.prompt}
          options={block.options}
          imageOptions={imageOptions}
        />
      )
    case 'table': {
      const [headerRow, ...bodyRows] = block.rows
      if (!headerRow?.length) {
        return null
      }
      return (
        <div key={key} className="chat-md-table-wrap">
          <table className="chat-md-table">
            <thead>
              <tr>
                {headerRow.map((cell, j) => (
                  <th key={`${key}-th-${j}`} className="chat-md-th">
                    {renderAssistantInline(cell, imageOptions)}
                  </th>
                ))}
              </tr>
            </thead>
            {bodyRows.length > 0 ? (
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr key={`${key}-tr-${ri}`}>
                    {row.map((cell, ci) => (
                      <td key={`${key}-td-${ri}-${ci}`} className="chat-md-td">
                        {renderAssistantInline(cell, imageOptions)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ) : null}
          </table>
        </div>
      )
    }
    default:
      return null
  }
}

/** Strukturierter Assistententext: Markdown-ähnliche Blöcke (Überschriften, Listen, ---, Links). */
export function renderAssistantRichContent(
  content: string,
  imageOptions?: AssistantInlineImageOptions,
): ReactNode {
  const trimmed = stripGeneratedImageModelFooter(content).trim()
  if (!trimmed) {
    return null
  }

  const blocks = parseBlocks(trimmed)
  if (blocks.length === 0) {
    return <p className="chat-md-p">{renderAssistantInline(trimmed, imageOptions)}</p>
  }

  /** Ein einzelner Absatz ohne Struktur-Marker → weiterhin ein p */
  if (blocks.length === 1 && blocks[0].type === 'p') {
    return <p className="chat-md-p">{renderAssistantInline(blocks[0].text, imageOptions)}</p>
  }

  return (
    <div className="chat-md-root">
      {blocks.map((b, i) => renderBlock(b, i, imageOptions))}
    </div>
  )
}
