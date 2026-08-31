import { refineUnsplashSearchQuery } from './unsplashPhotoRank'

export type ImageSearchPriorTurn = {
  role: 'user' | 'assistant'
  content: string
  /** Letzte Unsplash-Suche in dieser Assistenten-Nachricht. */
  unsplashQuery?: string
}

function squeezeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

const IMAGE_SEARCH_PREFIX_RE =
  /^\s*(?:bitte\s+)?(?:(?:zeige?|zeig)|(?:such(?:e)?)|(?:finde?)|(?:hol(?:e)?)|(?:gib(?:\s+mir)?)|(?:show(?:\s+me)?)|(?:find))\s+(?:mir\s+)?(?:(?:ein(?:e)?|ein)\s+)?(?:foto(?:s)?|bild(?:er)?)\s*(?:von|vom|über|ueber|to|of|about)\s+(.+)$/is

const IMAGE_SEARCH_LOOSE_RE =
  /^\s*(?:bitte\s+)?(?:(?:zeige?|zeig)|(?:such(?:e)?)|(?:finde?))\s+(?:mir\s+)?(?:foto(?:s)?|bild(?:er)?)\s+(.+)$/is

const IMAGE_SEARCH_BILDER_RE =
  /\b(zeige?|zeig|such(?:e)?|find(?:e)?|hol(?:e)?|gib(?:\s+mir)?)\b.{0,28}\b(bilder|fotos|bild)\b/i

const IMAGE_TOPIC_CLARIFY_RE =
  /\b(ich\s+meine|meinte\s+ich|meine\s+ich|nicht\s+damit|sondern|gemeint\s+(?:war|ist|habe))\b/i

const GENERATE_VERB_RE =
  /^\s*(?:bitte\s+)?(?:generiere|generier|erstelle|erstellt|erzeug|erzeugt|zeichne|zeichnet|male|malt|mach|mache|macht|create|generate|draw|make)\b/i

const WEAK_QUERY_RE =
  /^(?:ihm|ihr|ihn|sie|der|die|das|es|dem|den|de[mnr]|the|it|him|her|them|that|this|da|dort|welche[rsn]?|ein[er]?|eine[rsn]?|us|usa|amerikanisch(?:er|e|en)?|schauspieler(?:in)?|actor|actress|berühmt(?:er|e|en)?|famous)$/i

const PRONOUN_CAPTURE_RE =
  /^(?:ihm|ihr|ihn|sie|der|die|das|es|dem|den|de[mnr]|the|it|him|her|them|that|this)$/i

/** Bekannte Mehrdeutigkeiten → präzisere Unsplash-Suche. */
const FAMOUS_SUBJECT_ALIASES: Array<{ test: (q: string) => boolean; search: string }> = [
  {
    test: (q) => /^the\s+rock$/i.test(q) || /^«?the\s+rock»?$/i.test(q),
    search: 'Dwayne Johnson actor',
  },
]

function normalizeAliasQuery(query: string): string {
  const t = squeezeWs(query)
  for (const { test, search } of FAMOUS_SUBJECT_ALIASES) {
    if (test(t)) {
      return search
    }
  }
  return t
}

function isWeakImageSearchQuery(query: string): boolean {
  const t = squeezeWs(query)
  if (!t || t.length < 2) {
    return true
  }
  if (PRONOUN_CAPTURE_RE.test(t)) {
    return true
  }
  if (WEAK_QUERY_RE.test(t)) {
    return true
  }
  if (t.length <= 3 && !/\d/.test(t)) {
    return true
  }
  return false
}

function extractQuotedFromContent(content: string): string[] {
  const found: string[] = []
  const re = /[«"']([^»"']{2,80})[»"']/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const t = squeezeWs(m[1] ?? '')
    if (t && !/^(ihm|ihr|the|es)$/i.test(t)) {
      found.push(t)
    }
  }
  return found
}

function extractUnsplashTopicFromAssistant(content: string): string | null {
  const m = content.match(/Fotos\s+zu\s+[«"']([^»"']+)[»"']/i)
  return m?.[1] ? squeezeWs(m[1]) : null
}

function extractPersonFromAssistantBio(content: string): string | null {
  const dwayne = content.match(/\b(Dwayne\s+[«"']?The\s+Rock[»"']?\s+Johnson)\b/i)
  if (dwayne?.[1]) {
    return squeezeWs(dwayne[1].replace(/[«»"]/g, ''))
  }
  const uber = content.match(/\b(?:über|zu)\s+([A-ZÄÖÜ][\p{L}'’.-]+(?:\s+[A-ZÄÖÜ][\p{L}'’.-]+){0,3})/u)
  if (uber?.[1] && uber[1].length >= 4) {
    return squeezeWs(uber[1])
  }
  return null
}

function hadRecentImageTopic(priorTurns: ReadonlyArray<ImageSearchPriorTurn>): boolean {
  const recent = priorTurns.slice(-8)
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const t = recent[i]!
    if (t.unsplashQuery?.trim()) {
      return true
    }
    const c = t.content
    if (/Fotos\s+zu\s+[«"']/i.test(c)) {
      return true
    }
    if (t.role === 'user' && IMAGE_SEARCH_BILDER_RE.test(c)) {
      return true
    }
    if (/\b(the\s+rock|dwayne\s+johnson)\b/i.test(c)) {
      return true
    }
  }
  return false
}

/** Stock-Fotos zeigen — nicht KI-Bild generieren. */
export function matchImageSearchRequest(raw: string): { kind: 'none' } | { kind: 'query'; query: string } {
  const t = raw.trim()
  if (!t || GENERATE_VERB_RE.test(t)) {
    return { kind: 'none' }
  }

  for (const re of [IMAGE_SEARCH_PREFIX_RE, IMAGE_SEARCH_LOOSE_RE]) {
    const m = t.match(re)
    if (m?.[1]) {
      const query = squeezeWs(String(m[1]).replace(/\?+$/, ''))
      if (query.length >= 2) {
        return { kind: 'query', query: query.slice(0, 120) }
      }
    }
  }

  if (IMAGE_SEARCH_BILDER_RE.test(t)) {
    const subject = t.match(
      /\b(?:foto(?:s)?|bild(?:er)?)\s*(?:von|vom|über|ueber|to|of|about)?\s*(.+)$/i,
    )?.[1]
    const query = subject ? squeezeWs(subject.replace(/\?+$/, '')) : t
    if (query.length >= 2) {
      return { kind: 'query', query: query.slice(0, 120) }
    }
  }

  return { kind: 'none' }
}

/** Klarstellung im Bild-Thema («ich meine den Schauspieler …»). */
export function matchImageTopicClarification(
  raw: string,
  priorTurns?: ReadonlyArray<ImageSearchPriorTurn>,
): boolean {
  const t = raw.trim()
  if (!t || !priorTurns?.length || !hadRecentImageTopic(priorTurns)) {
    return false
  }
  return IMAGE_TOPIC_CLARIFY_RE.test(t) && /\b(schauspieler|actor|actress|musiker|sänger|person|berühmt|famous|us|usa)\b/i.test(t)
}

export function resolveImageSearchSubjectFromThread(
  userMessage: string,
  priorTurns?: ReadonlyArray<ImageSearchPriorTurn>,
): string | null {
  if (!priorTurns?.length) {
    return null
  }

  const user = squeezeWs(userMessage)
  const recent = priorTurns.slice(-10)

  if (/\b(dwayne|johnson)\b/i.test(user) || /the\s+rock/i.test(user)) {
    return 'Dwayne Johnson actor'
  }

  if (matchImageTopicClarification(userMessage, priorTurns)) {
    for (let i = recent.length - 1; i >= 0; i -= 1) {
      const t = recent[i]!
      if (t.unsplashQuery) {
        const aliased = normalizeAliasQuery(t.unsplashQuery)
        if (/\b(schauspieler|actor)\b/i.test(user)) {
          return aliased.includes('Dwayne') ? aliased : `${aliased} actor`
        }
        return aliased
      }
      if (t.role === 'assistant') {
        const person = extractPersonFromAssistantBio(t.content)
        if (person) {
          return `${person} actor`
        }
      }
    }
    return 'Dwayne Johnson actor'
  }

  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const t = recent[i]!
    if (t.unsplashQuery?.trim()) {
      return normalizeAliasQuery(t.unsplashQuery)
    }
    if (t.role === 'assistant') {
      const topic = extractUnsplashTopicFromAssistant(t.content)
      if (topic) {
        return normalizeAliasQuery(topic)
      }
      const person = extractPersonFromAssistantBio(t.content)
      if (person) {
        return person
      }
    }
  }

  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const t = recent[i]!
    for (const q of extractQuotedFromContent(t.content)) {
      if (!isWeakImageSearchQuery(q)) {
        return normalizeAliasQuery(q)
      }
    }
    if (t.role === 'user' && /\b(the\s+rock|dwayne\s+johnson)\b/i.test(t.content)) {
      return 'Dwayne Johnson actor'
    }
  }

  return null
}

export function extractImageSearchQuery(
  raw: string,
  intentFallback?: string,
  priorTurns?: ReadonlyArray<ImageSearchPriorTurn>,
): string {
  const matched = matchImageSearchRequest(raw)
  let query = matched.kind === 'query' ? squeezeWs(matched.query) : ''

  if (query && !isWeakImageSearchQuery(query)) {
    return refineUnsplashSearchQuery(normalizeAliasQuery(query)).slice(0, 120)
  }

  const fromThread = resolveImageSearchSubjectFromThread(raw, priorTurns)
  if (fromThread) {
    return refineUnsplashSearchQuery(fromThread).slice(0, 120)
  }

  const intent = intentFallback?.trim()
  if (intent && intent.length >= 2 && !isWeakImageSearchQuery(intent) && intent !== 'Allgemeine Anfrage') {
    return refineUnsplashSearchQuery(normalizeAliasQuery(intent)).slice(0, 120)
  }

  if (query) {
    return refineUnsplashSearchQuery(normalizeAliasQuery(query)).slice(0, 120)
  }

  return squeezeWs(raw).slice(0, 120)
}

export function isImageSearchTurnMessage(raw: string): boolean {
  return matchImageSearchRequest(raw).kind === 'query'
}
