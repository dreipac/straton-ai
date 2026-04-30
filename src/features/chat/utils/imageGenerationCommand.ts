export type ImageGenerationCommandParse =
  | { kind: 'none' }
  | { kind: 'empty' }
  | { kind: 'prompt'; prompt: string }

/**
 * Zeilenbeginn: `/bild ` oder `/image ` (Groß/Klein), Rest = Prompt für die Bild-API.
 * Kein Leerzeichen nach dem Befehl → `empty` (Hinweis an Nutzer).
 */
export function matchImageGenerationCommand(raw: string): ImageGenerationCommandParse {
  const t = raw.trim()
  const m = t.match(/^\/(bild|image)\s+(.*)$/is)
  if (!m) {
    if (/^\/(bild|image)\s*$/is.test(t)) {
      return { kind: 'empty' }
    }
    return { kind: 'none' }
  }
  const prompt = String(m[2] ?? '').trim()
  if (!prompt) {
    return { kind: 'empty' }
  }
  return { kind: 'prompt', prompt }
}
