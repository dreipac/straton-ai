export type ImageGenerationIntentParse =
  | { kind: 'none' }
  | { kind: 'empty' }
  | { kind: 'prompt'; prompt: string }

function squeezeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Erkennt eine ausdrückliche Bitte um Bildgenerierung (DE/EN), ohne Slash-Befehl.
 * Nur Nachrichtenbeginn — normaler Chat ohne diese Formulierungen bleibt Text-Antwort.
 */
export function matchExplicitImageGenerationRequest(raw: string): ImageGenerationIntentParse {
  const t = raw.trim()
  if (!t) {
    return { kind: 'none' }
  }

  const deVerb =
    '(?:generiere|generier|erstelle|erstellt|erzeug|erzeugt|mach|mache|macht|zeichne|zeichnet)'
  const imageWordDe = '(?:ein|eine)\\s+bild'
  const imageWordEn = '(?:an\\s+)?image'

  const withPromptDeVerb = new RegExp(
    `^\\s*(?:bitte\\s+)?${deVerb}\\s+(?:mir\\s+)?${imageWordDe}\\s*(?:[:,–—]|\\s+)\\s*(.+)$`,
    'is',
  )
  const withPromptDeLoose = new RegExp(
    `^\\s*(?:bitte\\s+)?${deVerb}\\s+(?:mir\\s+)?${imageWordDe}\\s+(.+)$`,
    'is',
  )
  const withPromptIch = new RegExp(
    '^\\s*(?:ich\\s+möchte|ich\\s+will|ich\\s+hätte\\s+gerne)\\s+(?:mir\\s+)?(?:ein|eine|gerne\\s+ein)\\s+bild\\s*(?:[:,–—]|\\s+)\\s*(.+)$',
    'is',
  )
  const withPromptDu = new RegExp(
    '^\\s*(?:kannst\\s+du|könntest\\s+du|kann\\s+du)\\s+(?:mir\\s+)?(?:bitte\\s+)?(?:ein|eine)\\s+bild\\s*(?:[:,–—]|\\s+)\\s*(.+)$',
    'is',
  )
  const withPromptZeig = /^\s*zeig\s+(?:mir\s+)?(?:ein|eine)\s+bild\s+(?:von|mit)\s+(.+)$/is

  const withPromptAfterGreeting = new RegExp(
    `^\\s*(?:hallo|hi|hey|servus|guten\\s+(?:tag|morgen|abend))[,!.]*\\s+(?:bitte\\s+)?${deVerb}\\s+(?:mir\\s+)?${imageWordDe}\\s*(?:[:,–—]|\\s+)\\s*(.+)$`,
    'is',
  )

  const withPromptEn = new RegExp(
    `^\\s*(?:please\\s+)?(?:generate|create|draw|make)\\s+(?:me\\s+)?${imageWordEn}\\s*(?:[:,–—]|\\s+)\\s*(.+)$`,
    'is',
  )
  const withPromptEnLoose = new RegExp(
    `^\\s*(?:please\\s+)?(?:generate|create|draw|make)\\s+(?:me\\s+)?${imageWordEn}\\s+(.+)$`,
    'is',
  )
  const withPromptCanYou = new RegExp(
    `^\\s*(?:can\\s+you|could\\s+you)\\s+(?:please\\s+)?(?:generate|create|draw|make)\\s+(?:me\\s+)?${imageWordEn}\\s*(?:[:,–—]|\\s+)\\s*(.+)$`,
    'is',
  )

  const promptMatchers: RegExp[] = [
    withPromptAfterGreeting,
    withPromptDeVerb,
    withPromptIch,
    withPromptDu,
    withPromptZeig,
    withPromptEn,
    withPromptCanYou,
    withPromptDeLoose,
    withPromptEnLoose,
  ]

  for (const re of promptMatchers) {
    const m = t.match(re)
    if (m) {
      const prompt = squeezeWs(String(m[1] ?? ''))
      if (!prompt) {
        return { kind: 'empty' }
      }
      return { kind: 'prompt', prompt }
    }
  }

  const emptyMatchers: RegExp[] = [
    new RegExp(`^\\s*(?:bitte\\s+)?${deVerb}\\s+(?:mir\\s+)?${imageWordDe}\\s*\\.?\\s*$`, 'is'),
    /^\s*(?:ich\s+möchte|ich\s+will)\s+(?:mir\s+)?(?:ein|eine)\s+bild\s*\.?\s*$/is,
    /^\s*(?:kannst\s+du|könntest\s+du)\s+(?:mir\s+)?(?:bitte\s+)?(?:ein|eine)\s+bild\s*\.?\s*$/is,
    new RegExp(`^\\s*(?:please\\s+)?(?:generate|create|draw|make)\\s+(?:me\\s+)?${imageWordEn}\\s*\\.?\\s*$`, 'is'),
    new RegExp(
      `^\\s*(?:can\\s+you|could\\s+you)\\s+(?:please\\s+)?(?:generate|create|draw|make)\\s+(?:me\\s+)?${imageWordEn}\\s*\\.?\\s*$`,
      'is',
    ),
  ]

  if (emptyMatchers.some((re) => re.test(t))) {
    return { kind: 'empty' }
  }

  return { kind: 'none' }
}

/**
 * Direkt nach einer Nachricht mit eingebettetem Generiert-Bild: kurze Anpassungen
 * («mach den Text blau», «heller Hintergrund») ohne erneutes «erstelle ein Bild …».
 */
export function matchFollowUpImageEditRequest(
  raw: string,
  priorMessages: ReadonlyArray<{ role: string; content?: string | null }>,
): ImageGenerationIntentParse {
  const t = squeezeWs(raw)
  if (!t || t.length > 620) {
    return { kind: 'none' }
  }

  const lastAssistant = [...priorMessages].reverse().find((m) => m.role === 'assistant')
  const prev = typeof lastAssistant?.content === 'string' ? lastAssistant.content : ''
  const hadGeneratedImage =
    prev.includes('data:image/') ||
    /\[[^\]]*\]\(\s*data:image\//i.test(prev) ||
    /\[Generiertes Bild\]/i.test(prev)

  if (!hadGeneratedImage) {
    return { kind: 'none' }
  }

  const looksLikeVisualEdit =
    /^(?:mache|mach|ändere|änder|stell|stelle|bitte|nochmal|erneut)\b/i.test(t) ||
    /\b(schriftzug|schrift|text|beschriftung|überschrift|farbe|farbig|farben|blau|rot|grün|gelb|orange|lila|violett|rosa|türkis|braun|schwarz|weiss|weiß|grau|gold|silber|grösser|größer|kleiner|heller|dunkler|hintergrund|vordergrund|kontrast|schatten|rahmen|zentrier|verschieb|mehr|weniger)\b/i.test(
      t,
    )

  if (!looksLikeVisualEdit) {
    return { kind: 'none' }
  }

  /** Klare Text-/Diskussionsfragen nicht zum Bildgenerator schicken */
  if (/^(?:was|warum|wie\s+(?:funktioniert|geht)|erklär|beschreib\s+(?:mir\s+)?(?:nicht\s+)?(?:das\s+)?bild)/i.test(t)) {
    return { kind: 'none' }
  }

  return { kind: 'prompt', prompt: t }
}
