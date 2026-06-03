/** Textpräfix für Bildgenerierung – wird von {@link matchExplicitImageGenerationRequest} erkannt. */
export const IMAGE_GEN_TILE_PROMPT_PREFIX = 'Erstelle ein Bild: '

/** Entfernt das «Bilder»-Kachel-Präfix für API-Prompts. */
export function isComposerImageGenRequest(raw: string): boolean {
  const t = raw.trim()
  return t.toLowerCase().startsWith(IMAGE_GEN_TILE_PROMPT_PREFIX.toLowerCase())
}

export function stripImageGenTilePromptPrefix(raw: string): string {
  const t = raw.trim()
  const prefix = IMAGE_GEN_TILE_PROMPT_PREFIX
  if (t.toLowerCase().startsWith(prefix.toLowerCase())) {
    const rest = t.slice(prefix.length).trim()
    return rest || t
  }
  return t
}
