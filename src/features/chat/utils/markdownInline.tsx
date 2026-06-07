import type { ReactNode } from 'react'
import { ChatMediaInlineImage } from '../components/ChatMediaInlineImage'
import { CHAT_MEDIA_REF_PREFIX } from '../services/chat.visionStorage'
import { renderInlineMathNodes } from './renderMath'

/** Optional: Klick auf eingebettete Bilder → z. B. Vollbild-Lightbox im Chat. */
export type AssistantInlineImageOptions = {
  onChatImagePreview?: (src: string) => void
}

/** **fett** und `inline code` — für Nutzer-Nachrichten und einfache Fälle. */
export function renderInlineMarkdown(content: string): ReactNode[] {
  const fragments: ReactNode[] = []
  let cursor = 0
  let keyIndex = 0

  while (cursor < content.length) {
    const boldStart = content.indexOf('**', cursor)
    const codeStart = content.indexOf('`', cursor)
    const hasBold = boldStart !== -1
    const hasCode = codeStart !== -1

    if (!hasBold && !hasCode) {
      fragments.push(<span key={`plain-${keyIndex++}`}>{content.slice(cursor)}</span>)
      break
    }

    let next = -1
    let kind: 'bold' | 'code' = 'bold'
    if (hasBold && (!hasCode || boldStart <= codeStart)) {
      next = boldStart
      kind = 'bold'
    } else if (hasCode) {
      next = codeStart
      kind = 'code'
    }

    if (next > cursor) {
      fragments.push(<span key={`plain-${keyIndex++}`}>{content.slice(cursor, next)}</span>)
    }

    if (kind === 'bold') {
      const end = content.indexOf('**', next + 2)
      if (end === -1) {
        fragments.push(<span key={`plain-${keyIndex++}`}>{content.slice(next)}</span>)
        break
      }
      const boldText = content.slice(next + 2, end)
      if (boldText) {
        fragments.push(<strong key={`bold-${keyIndex++}`}>{boldText}</strong>)
      } else {
        fragments.push(<span key={`plain-${keyIndex++}`}>****</span>)
      }
      cursor = end + 2
      continue
    }

    const end = content.indexOf('`', next + 1)
    if (end === -1) {
      fragments.push(<span key={`plain-${keyIndex++}`}>{content.slice(next)}</span>)
      break
    }
    const codeText = content.slice(next + 1, end)
    if (codeText) {
      fragments.push(
        <code key={`code-${keyIndex++}`} className="chat-md-inline-code">
          {codeText}
        </code>,
      )
    } else {
      fragments.push(<span key={`plain-${keyIndex++}`}>``</span>)
    }
    cursor = end + 1
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

function withKeys(nodes: ReactNode[], prefix: string): ReactNode[] {
  return nodes.map((n, i) => {
    if (typeof n === 'object' && n !== null && 'key' in (n as object) && (n as { key?: unknown }).key != null) {
      return n
    }
    return <span key={`${prefix}-${i}`}>{n}</span>
  })
}

const BADGE_INLINE_RE = /\[badge(?::(blue|green|orange|gray|teal))?\]([\s\S]*?)\[\/badge\]/gi

function renderBadgeSegments(text: string, keyBase: string, renderRest: (chunk: string, kb: string) => ReactNode[]): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let idx = 0
  BADGE_INLINE_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = BADGE_INLINE_RE.exec(text)) !== null) {
    if (match.index > last) {
      out.push(...renderRest(text.slice(last, match.index), `${keyBase}-pre${idx++}`))
    }
    const variant = (match[1] ?? 'blue').toLowerCase()
    const label = match[2]?.trim() ?? ''
    out.push(
      <span
        key={`${keyBase}-badge-${idx++}`}
        className={`chat-md-badge chat-md-badge--${
          variant === 'green' || variant === 'orange' || variant === 'gray' || variant === 'teal'
            ? variant
            : 'blue'
        }`}
      >
        {label ? renderInlineMarkdown(label) : null}
      </span>,
    )
    last = match.index + match[0].length
  }
  if (last < text.length) {
    out.push(...renderRest(text.slice(last), `${keyBase}-post${idx++}`))
  }
  if (out.length === 0) {
    return renderRest(text, keyBase)
  }
  return out
}

function renderPlainBoldUrlsAndEmailsWithoutMath(text: string, keyBase: string): ReactNode[] {
  return renderBadgeSegments(text, keyBase, (chunk, kb) => {
    const urlRe = /https?:\/\/[^\s<]+/gi
    const out: ReactNode[] = []
    let last = 0
    let m: RegExpExecArray | null
    let idx = 0

    while ((m = urlRe.exec(chunk)) !== null) {
      if (m.index > last) {
        const inner = chunk.slice(last, m.index)
        out.push(...renderEmailsThenBold(inner, `${kb}-pre${idx++}`))
      }
      const href = trimTrailingPunctuation(m[0])
      out.push(
        <a
          key={`${kb}-u${idx++}`}
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
    if (last < chunk.length) {
      out.push(...renderEmailsThenBold(chunk.slice(last), `${kb}-post${idx++}`))
    }
    return out
  })
}

function renderPlainBoldUrlsAndEmails(text: string, keyBase: string): ReactNode[] {
  return renderInlineMathNodes(text, renderPlainBoldUrlsAndEmailsWithoutMath, keyBase)
}

function assistantInlineImageEl(
  key: string,
  href: string,
  label: string,
  options?: AssistantInlineImageOptions,
): ReactNode {
  const alt = label || 'Bild'
  const preview = options?.onChatImagePreview

  if (href.startsWith(CHAT_MEDIA_REF_PREFIX)) {
    const storagePath = href.slice(CHAT_MEDIA_REF_PREFIX.length).trim()
    if (storagePath) {
      return (
        <ChatMediaInlineImage
          key={key}
          storagePath={storagePath}
          alt={alt}
          onPreview={preview}
        />
      )
    }
  }

  if (preview) {
    return (
      <button
        key={key}
        type="button"
        className="chat-inline-image-trigger"
        aria-label={label ? `Bild vergrößern: ${label}` : 'Bild vergrößern'}
        onClick={() => preview(href)}
      >
        <img className="chat-md-inline-image" src={href} alt={alt} loading="lazy" />
      </button>
    )
  }
  return (
    <img key={key} className="chat-md-inline-image" src={href} alt={alt} loading="lazy" />
  )
}

/** **fett**, ![alt](url) / [Label](url), sowie freistehende http(s)-URLs als Pill. */
export function renderAssistantInline(content: string, options?: AssistantInlineImageOptions): ReactNode[] {
  const linkSplit = /(!?\[[^\]]+\]\([^)]+\))/g
  const segments = content.split(linkSplit).filter((s) => s !== '')
  const out: ReactNode[] = []
  let k = 0

  for (const seg of segments) {
    const imageMatch = seg.match(MD_IMAGE_RE)
    if (imageMatch) {
      const href = trimTrailingPunctuation(imageMatch[2].trim())
      const label = imageMatch[1].trim() || hostnameFromUrl(href)
      out.push(assistantInlineImageEl(`mdi-${k++}`, href, label, options))
      continue
    }

    const lm = seg.match(MD_LINK_RE)
    if (lm) {
      const href = trimTrailingPunctuation(lm[2].trim())
      const label = lm[1].trim() || hostnameFromUrl(href)
      if (href.startsWith('data:image/') || href.startsWith(CHAT_MEDIA_REF_PREFIX)) {
        out.push(assistantInlineImageEl(`mdi-${k++}`, href, label, options))
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
