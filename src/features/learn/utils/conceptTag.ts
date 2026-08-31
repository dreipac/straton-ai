/**
 * Konzept-Tag-Normalisierung — gemeinsame Slug-Logik fuer das Konzept-Netz.
 *
 * Wandelt einen freien `skillTag` in einen stabilen, quellenuebergreifenden Slug
 * (z. B. "MwSt-Berechnung" → "mwst-berechnung"). Genutzt an allen Stellen, die einen skillTag
 * auf ein echtes Konzept (Slug → Concept-id) abbilden.
 */
export function normalizeConceptTag(raw: string | undefined): string {
  if (!raw) {
    return ''
  }
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}
