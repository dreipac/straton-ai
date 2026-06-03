/** Gemeinsame Logik für Unsplash-Treffer-Relevanz (Edge + Client). */

export type UnsplashRankablePhoto = {
  id: string
  description: string
  altText?: string
  tagTitles?: string[]
}

const IRRELEVANT_RE =
  /\b(wax(?:work)?|tussauds|madame|statue|figurine|figur|impersonator|look[\s-]?alike|tribute|mural|graffiti|cartoon|drawing|sketch|illustration|cosplay|cake|toy|lego|memorial\s+wall|wax\s+figure)\b/i

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}

function photoHaystack(photo: UnsplashRankablePhoto): string {
  const tags = (photo.tagTitles ?? []).join(' ')
  return `${photo.description} ${photo.altText ?? ''} ${tags}`.toLowerCase()
}

export function scoreUnsplashPhoto(photo: UnsplashRankablePhoto, query: string): number {
  const hay = photoHaystack(photo)
  const qLower = query.toLowerCase().trim()
  let score = 0

  if (qLower && hay.includes(qLower)) {
    score += 40
  }

  const tokens = tokenizeQuery(query)
  for (const token of tokens) {
    if (hay.includes(token)) {
      score += 12
    }
  }

  if (IRRELEVANT_RE.test(hay)) {
    score -= 80
  }

  return score
}

export function pickBestUnsplashPhotos<T extends UnsplashRankablePhoto>(
  candidates: T[],
  query: string,
  limit: number,
): T[] {
  if (candidates.length <= limit) {
    return candidates.slice(0, limit)
  }
  return [...candidates]
    .sort((a, b) => scoreUnsplashPhoto(b, query) - scoreUnsplashPhoto(a, query))
    .slice(0, limit)
}

/** Suchbegriff für die Unsplash-API schärfen (beschreibender = passendere Treffer). */
export function refineUnsplashSearchQuery(query: string): string {
  const q = query.replace(/\s+/g, ' ').trim().replace(/\?+$/, '')
  if (!q) {
    return q
  }
  const lower = q.toLowerCase()
  if (/\b(foto|photo|portrait|concert|live|performance)\b/i.test(lower)) {
    return q.slice(0, 120)
  }
  const looksLikePerson =
    /^[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){1,4}$/u.test(q) &&
    !/\b(stadt|city|land|country|gebäude|building|auto|car|hund|dog|katze)\b/i.test(lower)
  if (looksLikePerson) {
    return `${q} portrait`.slice(0, 120)
  }
  return `${q} photo`.slice(0, 120)
}
