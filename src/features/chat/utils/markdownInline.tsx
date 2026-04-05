import type { ReactNode } from 'react'

/** Nur **fett** — für Nutzer-Nachrichten und einfache Fälle. */
export function renderInlineMarkdown(content: string): ReactNode[] {
  const fragments: ReactNode[] = []
  let cursor = 0
  let keyIndex = 0

  while (cursor < content.length) {
    const start = content.indexOf('**', cursor)
    if (start === -1) {
      fragments.push(<span key={`plain-${keyIndex++}`}>{content.slice(cursor)}</span>)
      break
    }

    const end = content.indexOf('**', start + 2)
    if (end === -1) {
      fragments.push(<span key={`plain-${keyIndex++}`}>{content.slice(cursor)}</span>)
      break
    }

    if (start > cursor) {
      fragments.push(<span key={`plain-${keyIndex++}`}>{content.slice(cursor, start)}</span>)
    }

    const boldText = content.slice(start + 2, end)
    if (boldText) {
      fragments.push(<strong key={`bold-${keyIndex++}`}>{boldText}</strong>)
    } else {
      fragments.push(<span key={`plain-${keyIndex++}`}>****</span>)
    }

    cursor = end + 2
  }

  return fragments
}

const MD_LINK_RE = /^\[([^\]]*)\]\(([^)]*)\)$/

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)]+$/, '')
}

function hostnameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function renderPlainBoldAndUrls(text: string, keyBase: string): ReactNode[] {
  const urlRe = /https?:\/\/[^\s<]+/gi
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let idx = 0

  while ((m = urlRe.exec(text)) !== null) {
    if (m.index > last) {
      const chunk = text.slice(last, m.index)
      out.push(...withKeys(renderInlineMarkdown(chunk), `${keyBase}-b${idx++}`))
    }
    const href = trimTrailingPunctuation(m[0])
    out.push(
      <a
        key={`${keyBase}-u${idx++}`}
        className="chat-md-link-pill"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {hostnameFromUrl(href)}
      </a>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) {
    out.push(...withKeys(renderInlineMarkdown(text.slice(last)), `${keyBase}-b${idx++}`))
  }
  return out
}

function withKeys(nodes: ReactNode[], prefix: string): ReactNode[] {
  return nodes.map((n, i) => {
    if (typeof n === 'object' && n !== null && 'key' in (n as object) && (n as { key?: unknown }).key != null) {
      return n
    }
    return <span key={`${prefix}-${i}`}>{n}</span>
  })
}

/** **fett**, [Label](url), sowie freistehende http(s)-URLs als Pill. */
export function renderAssistantInline(content: string): ReactNode[] {
  const linkSplit = /(\[[^\]]+\]\([^)]+\))/g
  const segments = content.split(linkSplit).filter((s) => s !== '')
  const out: ReactNode[] = []
  let k = 0

  for (const seg of segments) {
    const lm = seg.match(MD_LINK_RE)
    if (lm) {
      const href = trimTrailingPunctuation(lm[2].trim())
      const label = lm[1].trim() || hostnameFromUrl(href)
      out.push(
        <a
          key={`mdl-${k++}`}
          className="chat-md-link"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {label}
        </a>,
      )
    } else {
      out.push(...renderPlainBoldAndUrls(seg, `pi-${k++}`))
    }
  }

  return out
}
