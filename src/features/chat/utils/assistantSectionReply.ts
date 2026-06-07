export const SECTION_REF_START = '<<<STRATON_SECTION_REF>>>'
export const SECTION_REF_END = '<<<END_STRATON_SECTION_REF>>>'

export type AssistantSectionReference = {
  messageId: string
  blockIndex: number
  blockKind: string
  excerpt: string
  previewTitle?: string
}

type SectionRefPayload = {
  messageId: string
  blockIndex: number
  blockKind: string
  excerpt: string
  previewTitle?: string
}

function stripBoldMarkers(line: string): string {
  return line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim()
}

/** `@chat-media:` / Data-URLs in Abschnitts-Zitaten — UI und KI-Kontext nur «Bild». */
export function sanitizeSectionRefExcerpt(text: string): string {
  let s = stripBoldMarkers(text)
  if (!s.trim()) {
    return ''
  }
  s = s.replace(/!?\[[^\]]*\]\(\s*@chat-media:[^)\s]+\s*\)/gi, 'Bild')
  s = s.replace(/!?\[[^\]]*\]\(\s*data:image\/[^)]+\s*\)/gi, 'Bild')
  s = s.replace(/@chat-media:[^\s)\]]+/gi, 'Bild')
  s = s.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=_-]+/gi, 'Bild')
  s = s.replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/gi, 'Bild')
  const lines = s
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (lines.length > 0 && lines.every((line) => /^Bild$/i.test(line))) {
    return 'Bild'
  }
  s = lines.join(' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s.replace(/(?:Bild\s*){2,}/gi, 'Bild')
}

export function formatSectionRefBlock(ref: AssistantSectionReference): string {
  const payload: SectionRefPayload = {
    messageId: ref.messageId,
    blockIndex: ref.blockIndex,
    blockKind: ref.blockKind,
    excerpt: ref.excerpt,
    previewTitle: ref.previewTitle,
  }
  return `${SECTION_REF_START}\n${JSON.stringify(payload)}\n${SECTION_REF_END}`
}

export function parseSectionRefFromUserContent(content: string): {
  userText: string
  sectionRef: AssistantSectionReference | null
} {
  const start = content.indexOf(SECTION_REF_START)
  const end = content.indexOf(SECTION_REF_END)
  if (start === -1 || end === -1 || end <= start) {
    return { userText: content.trim(), sectionRef: null }
  }
  const jsonRaw = content.slice(start + SECTION_REF_START.length, end).trim()
  let sectionRef: AssistantSectionReference | null = null
  try {
    const parsed = JSON.parse(jsonRaw) as SectionRefPayload
    if (parsed && typeof parsed.messageId === 'string' && typeof parsed.excerpt === 'string') {
      sectionRef = {
        messageId: parsed.messageId,
        blockIndex: Number(parsed.blockIndex) || 0,
        blockKind: typeof parsed.blockKind === 'string' ? parsed.blockKind : 'p',
        excerpt: parsed.excerpt.trim(),
        previewTitle:
          typeof parsed.previewTitle === 'string' ? parsed.previewTitle.trim() : undefined,
      }
    }
  } catch {
    sectionRef = null
  }
  const before = content.slice(0, start).trim()
  const after = content.slice(end + SECTION_REF_END.length).trim()
  const userText = [before, after].filter(Boolean).join('\n\n').trim()
  return { userText, sectionRef }
}

export function stripSectionRefBlock(content: string): string {
  return parseSectionRefFromUserContent(content).userText
}

/** Für die KI: Marker entfernen, Bezug als Zitat sichtbar machen. */
export function formatUserContentForGateway(content: string): string {
  const { userText, sectionRef } = parseSectionRefFromUserContent(content)
  if (!sectionRef) {
    return content
  }
  const quote =
    sanitizeSectionRefExcerpt(sectionRef.excerpt) ||
    (sectionRef.previewTitle?.trim() === 'Bild' ? 'Bild' : '')
  const parts = [
    '[Der Nutzer antwortet auf einen bestimmten Abschnitt aus deiner vorherigen Nachricht.]',
    quote ? `> ${quote.replace(/\n/g, '\n> ')}` : '',
    userText,
  ].filter(Boolean)
  return parts.join('\n\n')
}

export function buildUserMessageWithSectionRef(
  userText: string,
  ref: AssistantSectionReference | null,
): string {
  const t = userText.trim()
  if (!ref) {
    return t
  }
  const block = formatSectionRefBlock(ref)
  return t ? `${block}\n\n${t}` : block
}

type BlockExcerptInput =
  | { type: 'hr' }
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'h4'; text: string }
  | { type: 'h5'; text: string }
  | { type: 'h6'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: Array<string | { text: string }> }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'code'; code: string }
  | { type: 'emailDraft'; body: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'cards'; cards: Array<{ title: string; body: string; label: string }> }
  | { type: 'callout'; lines: string[] }
  | { type: 'definition'; title: string; body: string }
  | { type: 'mcq'; prompt: string; options: { text: string }[] }
  | { type: 'math'; latex: string }

export function blockToReferenceExcerpt(block: BlockExcerptInput): {
  excerpt: string
  previewTitle?: string
} {
  switch (block.type) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const t = stripBoldMarkers(block.text)
      return { excerpt: t, previewTitle: t.slice(0, 72) }
    }
    case 'p': {
      const t = sanitizeSectionRefExcerpt(block.text)
      if (t === 'Bild') {
        return { excerpt: '', previewTitle: 'Bild' }
      }
      return { excerpt: t.slice(0, 420), previewTitle: t.slice(0, 56) || 'Absatz' }
    }
    case 'ul':
    case 'ol': {
      const joined = block.items
        .map((i) => stripBoldMarkers(typeof i === 'string' ? i : i.text))
        .filter(Boolean)
        .join(' · ')
      return {
        excerpt: joined.slice(0, 420),
        previewTitle: block.type === 'ol' ? 'Nummerierte Liste' : 'Liste',
      }
    }
    case 'blockquote': {
      const joined = block.lines.map((l) => stripBoldMarkers(l)).join(' ')
      return { excerpt: joined.slice(0, 420), previewTitle: 'Zitat' }
    }
    case 'code':
      return {
        excerpt: block.code.trim().slice(0, 280),
        previewTitle: 'Code',
      }
    case 'emailDraft':
      return {
        excerpt: block.body.trim().slice(0, 280),
        previewTitle: 'E-Mail-Entwurf',
      }
    case 'table':
      return {
        excerpt: block.rows
          .slice(0, 3)
          .map((row) => row.join(' | '))
          .join('\n')
          .slice(0, 280),
        previewTitle: 'Tabelle',
      }
    case 'cards': {
      const joined = block.cards
        .map((card) => [card.title, card.body].filter(Boolean).join(': '))
        .join(' · ')
      return {
        excerpt: joined.slice(0, 420),
        previewTitle: block.cards[0]?.title?.slice(0, 56) || 'Karten',
      }
    }
    case 'callout': {
      const joined = block.lines.map((l) => stripBoldMarkers(l)).join(' ')
      return { excerpt: joined.slice(0, 420), previewTitle: 'Einleitung' }
    }
    case 'definition': {
      const joined = [block.title, block.body].filter(Boolean).join(': ')
      return {
        excerpt: joined.slice(0, 420),
        previewTitle: block.title.slice(0, 56) || 'Definition',
      }
    }
    case 'mcq':
      return {
        excerpt: [block.prompt, ...block.options.map((o) => o.text)].join(' · ').slice(0, 420),
        previewTitle: 'Frage',
      }
    case 'math':
      return {
        excerpt: block.latex.trim().slice(0, 280),
        previewTitle: 'Formel',
      }
    case 'hr':
      return { excerpt: '—', previewTitle: 'Trennlinie' }
    default:
      return { excerpt: '', previewTitle: 'Abschnitt' }
  }
}
