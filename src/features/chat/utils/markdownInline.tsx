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
const MD_IMAGE_RE = /^!\[([^\]]*)\]\(([^)]*)\)$/

/** Entfernt die Footer-Zeile `_Modell: …_` unter generierten Bildern (legacy Edge-Antworten / nicht redeployte Functions). */
export function stripGeneratedImageModelFooter(content: string): string {
  return content
    .split('\n')
    .filter((line) => !/^\s*_Modell:\s*.+$/i.test(line.trim()))
    .join('\n')
    .trim()
}

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)]+$/, '')
}

/** Klartext-E-Mails (nicht in URLs); konservativ, um False Positives zu vermeiden. */
const INLINE_EMAIL_RE = /\b[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g

function hostnameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function renderEmailsThenBold(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let idx = 0
  INLINE_EMAIL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = INLINE_EMAIL_RE.exec(text)) !== null) {
    if (m.index > last) {
      const chunk = text.slice(last, m.index)
      out.push(...withKeys(renderInlineMarkdown(chunk), `${keyBase}-b${idx++}`))
    }
    const addr = m[0]
    out.push(
      <a key={`${keyBase}-e${idx++}`} className="chat-md-email-pill" href={`mailto:${addr}`}>
        {addr}
      </a>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) {
    out.push(...withKeys(renderInlineMarkdown(text.slice(last)), `${keyBase}-b${idx++}`))
  }
  return out
}

function renderPlainBoldUrlsAndEmails(text: string, keyBase: string): ReactNode[] {
  const urlRe = /https?:\/\/[^\s<]+/gi
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let idx = 0

  while ((m = urlRe.exec(text)) !== null) {
    if (m.index > last) {
      const chunk = text.slice(last, m.index)
      out.push(...renderEmailsThenBold(chunk, `${keyBase}-pre${idx++}`))
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
    out.push(...renderEmailsThenBold(text.slice(last), `${keyBase}-post${idx++}`))
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

/** **fett**, ![alt](url) / [Label](url), sowie freistehende http(s)-URLs als Pill. */
export function renderAssistantInline(content: string): ReactNode[] {
  const linkSplit = /(!?\[[^\]]+\]\([^)]+\))/g
  const segments = content.split(linkSplit).filter((s) => s !== '')
  const out: ReactNode[] = []
  let k = 0

  for (const seg of segments) {
    const imageMatch = seg.match(MD_IMAGE_RE)
    if (imageMatch) {
      const href = trimTrailingPunctuation(imageMatch[2].trim())
      const label = imageMatch[1].trim() || hostnameFromUrl(href)
      out.push(
        <img
          key={`mdi-${k++}`}
          className="chat-md-inline-image"
          src={href}
          alt={label || 'Bild'}
          loading="lazy"
        />,
      )
      continue
    }

    const lm = seg.match(MD_LINK_RE)
    if (lm) {
      const href = trimTrailingPunctuation(lm[2].trim())
      const label = lm[1].trim() || hostnameFromUrl(href)
      if (href.startsWith('data:image/')) {
        out.push(
          <img
            key={`mdi-${k++}`}
            className="chat-md-inline-image"
            src={href}
            alt={label || 'Bild'}
            loading="lazy"
          />,
        )
      } else if (/^mailto:/i.test(href)) {
        const raw = href.replace(/^mailto:/i, '').trim()
        out.push(
          <a
            key={`mdl-${k++}`}
            className="chat-md-email-pill"
            href={href}
          >
            {label || raw}
          </a>,
        )
      } else {
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
      }
    } else {
      out.push(...renderPlainBoldUrlsAndEmails(seg, `pi-${k++}`))
    }
  }

  return out
}
