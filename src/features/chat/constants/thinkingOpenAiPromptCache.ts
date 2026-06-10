import {
  buildThinkingGeminiKernelPrompt,
  buildThinkingGeminiRichTierPrompt,
} from './thinkingGeminiPromptCache'

/**
 * Gemeinsamer OpenAI Prompt-Cache-Key für Rich-Thinking (Draft, Review, Final).
 * Gleicher Key + identischer System-Kernel → Cache-Treffer innerhalb des Workflows.
 */
export const OPENAI_PROMPT_CACHE_KEY_THINKING_RICH_SHARED =
  'straton-thinking-rich-openai-v1' as const

export const OPENAI_PROMPT_CACHE_KEY_THINKING_RICH_REPLY =
  OPENAI_PROMPT_CACHE_KEY_THINKING_RICH_SHARED
export const OPENAI_PROMPT_CACHE_KEY_THINKING_DRAFT_RICH =
  OPENAI_PROMPT_CACHE_KEY_THINKING_RICH_SHARED
export const OPENAI_PROMPT_CACHE_KEY_THINKING_REVIEW_RICH =
  OPENAI_PROMPT_CACHE_KEY_THINKING_RICH_SHARED

/** Stabiler Kernel — identisch in Draft, Review und Final (OpenAI Prompt Cache). */
export function buildThinkingRichOpenAiCachedKernel(): string {
  return [buildThinkingGeminiKernelPrompt(), buildThinkingGeminiRichTierPrompt()].join('\n\n')
}

export function buildThinkingRichOpenAiDraftStepPrompt(): string {
  return [
    'Thinking — interner Entwurf (Nutzer sieht ihn nicht).',
    'Vollständige inhaltliche Lösung; grob ##-Kapitel und `---` zwischen Hauptteilen.',
    'Bei [Datei:…]: Inhalt aus dem Dateiblock ausarbeiten — nicht «das Dossier deckt…».',
    'Kein Clarify-Block, keine Anpassungsfrage. Nur Entwurf-Markdown.',
  ].join('\n')
}

export function buildThinkingRichOpenAiReviewStepPrompt(): string {
  return [
    'Thinking — internes Review (nur JSON).',
    'Du prüfst einen internen Thinking-Entwurf gegen Nutzeranfrage und Aufgabenanalyse.',
    'Antworte ausschließlich mit JSON: fits_intent (boolean), gaps (string[]), rewrite_hints (string), summary (string).',
    'Rich/document_summary — fits_intent false wenn:',
    '- nur Meta («deckt/thematisiert/listet») ohne Fakten aus dem Anhang.',
    '- 3+ parallele Typen/Kategorien als Bullet-Liste oder rohe Markdown-Tabelle statt ```cards```.',
    '- kein ```cards``` oder ```divided-list``` bei Zusammenfassung mit mehreren Themen.',
    '- rewrite_hints: konkret «```cards``` mit tone/badges je Kategorie» fordern.',
    'fits_intent false bei leerem/generischem Entwurf oder fehlender Kernantwort.',
    'fits_intent false bei abgeschnittenem Text oder «Aufgabe:/Lösung:»-Format statt Lernskript.',
  ].join('\n')
}

export function buildThinkingRichOpenAiReplyStepPrompt(): string {
  return [
    'Thinking — finale sichtbare Antwort.',
    'Entwurf und Review nutzen, Lücken schließen, Format verbessern.',
    'KEIN Clarify-Block in der finalen Antwort.',
  ].join('\n')
}
