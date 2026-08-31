import { useMemo, type ReactNode } from 'react'
import katex from 'katex'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/700.css'
import 'katex/dist/katex.min.css'

export function normalizeMathLatex(latex: string): string {
  return latex.trim()
}

/** Letztes echtes «=» (nicht !=, <=, \neq, …) — Ergebnis rechts davon wird fett gesetzt. */
function findResultEqualsIndex(latex: string): number {
  for (let idx = latex.length - 1; idx >= 0; idx -= 1) {
    if (latex[idx] !== '=') {
      continue
    }
    const prev = idx > 0 ? latex[idx - 1] : ''
    if (prev === '!' || prev === '<' || prev === '>') {
      continue
    }
    const before = latex.slice(Math.max(0, idx - 12), idx)
    if (/\\(?:neq|leq|geq|ge|le|approx|equiv|sim|coloneqq)$/.test(before)) {
      continue
    }
    return idx
  }
  return -1
}

function boldMathResult(latex: string): string {
  const eqIdx = findResultEqualsIndex(latex)
  if (eqIdx === -1) {
    return latex
  }
  const left = latex.slice(0, eqIdx + 1).trimEnd()
  const right = latex.slice(eqIdx + 1).trim()
  if (!right) {
    return latex
  }
  return `${left} \\boldsymbol{${right}}`
}

function prepareMathLatex(latex: string, displayMode: boolean): string {
  let s = boldMathResult(normalizeMathLatex(latex))
  if (displayMode) {
    s = `\\mathsf{\\displaystyle ${s}}`
  }
  return s
}

export function katexHtml(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(prepareMathLatex(latex, displayMode), {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    })
  } catch {
    return ''
  }
}

type MathTextPart = { type: 'text'; value: string } | { type: 'math'; latex: string }

/** Display: `$$…$$` oder `\[…\]`. */
const DISPLAY_MATH_IN_TEXT_RE = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/g

export function splitTextWithDisplayMath(text: string): MathTextPart[] {
  const parts: MathTextPart[] = []
  let last = 0
  DISPLAY_MATH_IN_TEXT_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = DISPLAY_MATH_IN_TEXT_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'text', value: text.slice(last, match.index) })
    }
    const raw = match[0]
    const latex = raw.startsWith('$$')
      ? raw.slice(2, -2).trim()
      : raw.slice(2, -2).trim()
    parts.push({ type: 'math', latex })
    last = match.index + raw.length
  }
  if (last < text.length) {
    parts.push({ type: 'text', value: text.slice(last) })
  }
  if (parts.length === 0) {
    parts.push({ type: 'text', value: text })
  }
  return parts
}

/** Inline: `\(...\)` oder `$…$` (nicht `$$`). */
const INLINE_MATH_RE = /\\\(([\s\S]*?)\\\)|(?<!\$)\$((?:[^$\n]|\\\$)+?)\$(?!\$)/g

export function splitInlineMath(text: string): MathTextPart[] {
  const parts: MathTextPart[] = []
  let last = 0
  INLINE_MATH_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = INLINE_MATH_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'text', value: text.slice(last, match.index) })
    }
    parts.push({ type: 'math', latex: (match[1] ?? match[2] ?? '').trim() })
    last = match.index + match[0].length
  }
  if (last < text.length) {
    parts.push({ type: 'text', value: text.slice(last) })
  }
  if (parts.length === 0) {
    parts.push({ type: 'text', value: text })
  }
  return parts
}

export function ChatMathDisplay({ latex }: { latex: string }) {
  const html = useMemo(() => katexHtml(latex, true), [latex])
  if (!html) {
    return <pre className="chat-md-math-fallback">{latex}</pre>
  }
  return (
    <div
      className="chat-md-math chat-md-math--display"
      role="math"
      aria-label="Formel"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function ChatMathInline({ latex }: { latex: string }) {
  const html = useMemo(() => katexHtml(latex, false), [latex])
  if (!html) {
    return <code className="chat-md-math-fallback">{latex}</code>
  }
  return (
    <span
      className="chat-md-math chat-md-math--inline"
      role="math"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function renderInlineMathNodes(
  text: string,
  renderPlainText: (chunk: string, keyBase: string) => ReactNode[],
  keyBase: string,
): ReactNode[] {
  const out: ReactNode[] = []
  let partIndex = 0
  for (const part of splitInlineMath(text)) {
    const key = `${keyBase}-p${partIndex++}`
    if (part.type === 'math') {
      out.push(<ChatMathInline key={`${key}-m`} latex={part.latex} />)
    } else if (part.value) {
      out.push(...renderPlainText(part.value, key))
    }
  }
  return out
}

export function tryParseDisplayMathBlock(
  lines: string[],
  startIndex: number,
): { latex: string; end: number } | null {
  const trimmed = (lines[startIndex] ?? '').trim()

  const doubleDollarOne = trimmed.match(/^\$\$\s*([\s\S]+?)\s*\$\$$/)
  if (doubleDollarOne?.[1]) {
    return { latex: doubleDollarOne[1].trim(), end: startIndex + 1 }
  }

  const bracketOne = trimmed.match(/^\\\[\s*([\s\S]*?)\s*\\\]$/)
  if (bracketOne?.[1]) {
    return { latex: bracketOne[1].trim(), end: startIndex + 1 }
  }

  if (trimmed === '$$') {
    const body: string[] = []
    let i = startIndex + 1
    while (i < lines.length && lines[i]?.trim() !== '$$') {
      body.push(lines[i] ?? '')
      i += 1
    }
    if (i < lines.length) {
      return { latex: body.join('\n').trim(), end: i + 1 }
    }
    return null
  }

  if (trimmed === '\\[') {
    const body: string[] = []
    let i = startIndex + 1
    while (i < lines.length && lines[i]?.trim() !== '\\]') {
      body.push(lines[i] ?? '')
      i += 1
    }
    if (i < lines.length) {
      return { latex: body.join('\n').trim(), end: i + 1 }
    }
    return null
  }

  return null
}
