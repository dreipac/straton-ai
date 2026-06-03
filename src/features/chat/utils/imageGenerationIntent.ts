import { stripImageGenTilePromptPrefix } from '../constants/imageGenTile'
import {
  matchImageAttributionQuestion,
  matchImageReferenceQuestion,
} from './referencedImageVision'

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
    '(?:generiere|generier|erstelle|erstellt|erzeug|erzeugt|mach|mache|macht|zeichne|zeichnet|male|malt)'
  /** ein/eine/einen/… + Bild oder Foto */
  const imageArticleDe = '(?:ein(?:e|en|em|er)?|eine(?:r|n|m)?)'
  const imageWordDe = `(?:${imageArticleDe}\\s+)?(?:bild|foto)`
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
    /^\s*(?:ich\s+möchte|ich\s+will)\s+(?:mir\s+)?(?:ein(?:e|en)?|eine)\s+(?:bild|foto)\s*\.?\s*$/is,
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
    prev.includes('@chat-media:') ||
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

  if (matchImageAttributionQuestion(t) || matchImageReferenceQuestion(t)) {
    return { kind: 'none' }
  }

  /** Klare Text-/Diskussionsfragen nicht zum Bildgenerator schicken */
  if (
    /^(?:was|wer|weshalb|warum|wie\s+(?:funktioniert|geht)|erklär|beschreib\s+(?:mir\s+)?(?:nicht\s+)?(?:das\s+)?bild)/i.test(
      t,
    )
  ) {
    return { kind: 'none' }
  }

  return { kind: 'prompt', prompt: t }
}

/**
 * «Bilder»-Modus + angehängtes Foto: Bearbeitungswunsch ohne explizites «Erstelle ein Bild …».
 */
export function matchAttachedImageEditRequest(
  raw: string,
  hasAttachedImage: boolean,
): ImageGenerationIntentParse {
  if (!hasAttachedImage) {
    return { kind: 'none' }
  }

  const t = stripImageGenTilePromptPrefix(raw)
  if (!t || t.length > 620) {
    return { kind: 'none' }
  }

  if (matchExplicitImageGenerationRequest(raw).kind === 'prompt') {
    return { kind: 'prompt', prompt: t }
  }

  if (matchImageAttributionQuestion(t) || matchImageReferenceQuestion(t)) {
    return { kind: 'none' }
  }

  const refersToAttachedImage =
    /\b(?:im|am|auf dem|in dem)\s+(?:angehängten\s+)?(?:bild|foto|screenshot|anhang)\b/i.test(t) ||
    /\b(?:meinem|meine[mrs]?)\s+(?:bild|foto)\b/i.test(t) ||
    /\b(?:dieses|das)\s+(?:bild|foto)\b/i.test(t)

  const hasVisualEditKeywords =
    /\b(schriftzug|schrift|text|beschriftung|überschrift|farbe|farbig|farben|blau|rot|grün|gelb|orange|lila|violett|rosa|türkis|braun|schwarz|weiss|weiß|grau|gold|silber|grösser|größer|kleiner|heller|dunkler|hintergrund|vordergrund|kontrast|schatten|rahmen|zentrier|verschieb|person|objekt|element|logo|himmel|wolken)\b/i.test(
      t,
    )

  const startsWithEditVerb =
    /^(?:bitte\s+)?(?:ändere|ändere|passe|pass|bearbeit|mach|mache|entfern|füge|ersetz|korrigier)\b/i.test(t)

  const looksLikeVisualEdit =
    (startsWithEditVerb && (refersToAttachedImage || hasVisualEditKeywords)) ||
    (refersToAttachedImage && hasVisualEditKeywords)

  if (!looksLikeVisualEdit) {
    return { kind: 'none' }
  }

  if (
    /^(?:was|wer|weshalb|warum|wie\s+(?:funktioniert|geht)|erklär|beschreib\s+(?:mir\s+)?(?:nicht\s+)?(?:das\s+)?bild)/i.test(
      t,
    )
  ) {
    return { kind: 'none' }
  }

  return { kind: 'prompt', prompt: t }
}

/** Neues Motiv statt Bearbeitung des Anhangs (z. B. «eine Katze im Wald»). */
export function looksLikePureNewImageRequest(prompt: string): boolean {
  const t = stripImageGenTilePromptPrefix(prompt).trim()
  if (!t) {
    return false
  }
  if (
    /\b(?:im|am|auf dem|in dem)\s+(?:angehängten\s+)?(?:bild|foto|screenshot|anhang)\b/i.test(t) ||
    /\b(?:meinem|meine[mrs]?)\s+(?:bild|foto)\b/i.test(t) ||
    /^(?:bitte\s+)?(?:ändere|ändere|passe|pass|bearbeit|entfern|füge|ersetz|korrigier)\b/i.test(t)
  ) {
    return false
  }
  return (
    /^(?:ein|eine)\s+/i.test(t) ||
    /\b(?:zeichne|male|generiere|erstelle|stelle\s+dar|darstellung|szene|landschaft|portrait|illustration)\b/i.test(
      t,
    )
  )
}

/** Anhang als Referenz für `/images/edits` nutzen (Ausgabe bleibt 1024×1024). */
export function shouldUseAttachedImageEdit(prompt: string, hasSourceImage: boolean): boolean {
  if (!hasSourceImage) {
    return false
  }
  return !looksLikePureNewImageRequest(prompt)
}
