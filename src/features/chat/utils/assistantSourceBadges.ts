export type AssistantSourceLink = {
  label: string
  href: string
}

const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi

const SOURCE_SECTION_CUE =
  /\b(quellen|sources|weitere\s+details|mehr\s+erfahren|siehe\s+auch|folgenden\s+quellen|nachfolgend|lesen\s+sie)\b/i

const SOURCES_HEADING_RE = /^(quellen|sources|links|weiterführende\s+links|literatur|quellenangabe)$/i

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[),.;\]]+$/, '')
}

export function extractMarkdownLinksFromText(text: string): AssistantSourceLink[] {
  const links: AssistantSourceLink[] = []
  const seen = new Set<string>()
  const re = new RegExp(MD_LINK_RE.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    const href = trimTrailingPunctuation(match[2].trim())
    if (!href || seen.has(href)) {
      continue
    }
    seen.add(href)
    const label = match[1].trim() || href
    links.push({ label, href })
  }
  return links
}

function stripMarkdownLinks(text: string): string {
  return text
    .replace(new RegExp(MD_LINK_RE.source, 'gi'), '')
    .replace(/(\s*,\s*){2,}/g, ', ')
    .replace(/\s*,\s*(?=[,.]|\s*$)/g, '')
    .replace(/,\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .trim()
}

function isSourcesHeading(text: string): boolean {
  return SOURCES_HEADING_RE.test(stripBoldMarkers(text))
}

function stripBoldMarkers(line: string): string {
  return line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim()
}

function isSourceSectionParagraph(text: string): boolean {
  const links = extractMarkdownLinksFromText(text)
  if (links.length === 0) {
    return false
  }
  if (links.length >= 2) {
    const remainder = stripMarkdownLinks(text).replace(/^[:\s,–—-]+|[:\s,.]+$/g, '')
    return remainder.length <= 220
  }
  return SOURCE_SECTION_CUE.test(text)
}

function extractLeadTextFromSourceParagraph(text: string): string | undefined {
  if (!SOURCE_SECTION_CUE.test(text)) {
    return undefined
  }
  const lead = stripMarkdownLinks(text)
    .replace(/:\s*\.?\s*$/g, '')
    .replace(/[,.:]\s*$/g, '')
    .trim()
  return lead.length > 0 ? lead : undefined
}

function isHeadingOnlyBlock(block: string): boolean {
  const t = block.trim()
  return /^#{1,3}\s+\S[^\n]*$/.test(t) && !t.includes('\n\n')
}

/**
 * Entfernt typische Quellen-Absätze am Ende (z. B. «…folgenden Quellen: [A](…), [B](…)»)
 * und liefert sie als Badge-Daten für die UI unter der Nachricht.
 */
export function splitAssistantContentSources(rawContent: string): {
  body: string
  sources: AssistantSourceLink[]
  leadText?: string
} {
  const content = rawContent.trim()
  if (!content) {
    return { body: '', sources: [] }
  }

  const parts = content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) {
    return { body: '', sources: [] }
  }

  let sourcesAcc: AssistantSourceLink[] = []
  const seenHref = new Set<string>()
  let leadText: string | undefined
  let peelCount = 0

  function appendBlockLinks(links: AssistantSourceLink[]) {
    const fresh = links.filter((link) => {
      if (seenHref.has(link.href)) {
        return false
      }
      seenHref.add(link.href)
      return true
    })
    if (fresh.length > 0) {
      sourcesAcc = [...fresh, ...sourcesAcc]
    }
  }

  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const block = parts[i]

    if (isHeadingOnlyBlock(block)) {
      const heading = block.replace(/^#{1,3}\s+/, '').trim()
      if (isSourcesHeading(heading)) {
        peelCount += 1
        continue
      }
      break
    }

    const headingWithBody = block.match(/^(#{1,3})\s+([^\n]+)\n+([\s\S]+)$/)
    if (headingWithBody && isSourcesHeading(headingWithBody[2])) {
      const links = extractMarkdownLinksFromText(headingWithBody[3])
      if (links.length > 0) {
        appendBlockLinks(links)
        peelCount += 1
        continue
      }
    }

    if (isSourceSectionParagraph(block)) {
      appendBlockLinks(extractMarkdownLinksFromText(block))
      const lead = extractLeadTextFromSourceParagraph(block)
      if (lead && !leadText) {
        leadText = lead
      }
      peelCount += 1
      continue
    }

    break
  }

  const body = parts.slice(0, parts.length - peelCount).join('\n\n').trim()
  return { body, sources: sourcesAcc, leadText }
}
