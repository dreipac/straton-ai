import {
  buildThinkingGeminiKernelPrompt,
  buildThinkingGeminiRichTierPrompt,
  buildThinkingGeminiStandardTierPrompt,
} from './thinkingGeminiPromptCache'

/**
 * Draft+Review (interner Kernel ohne Cards-/Layout-Pflicht) und Reply (eigener Kernel mit
 * Cards-/Layout-Regeln) haben jetzt unterschiedlichen Prompt-Text — getrennte Cache-Keys,
 * kein gemeinsamer Key mehr.
 */
export const OPENAI_PROMPT_CACHE_KEY_THINKING_RICH_INTERNAL =
  'straton-thinking-rich-internal-v1' as const
export const OPENAI_PROMPT_CACHE_KEY_THINKING_RICH_REPLY =
  'straton-thinking-rich-reply-v1' as const
/** Reply, Standard-Tier, OpenAI-only (Gemini global deaktiviert) — eigener statischer Kernel fürs Prompt-Caching. */
export const OPENAI_PROMPT_CACHE_KEY_THINKING_STANDARD_REPLY =
  'straton-thinking-standard-reply-v1' as const

export const OPENAI_PROMPT_CACHE_KEY_THINKING_DRAFT_RICH =
  OPENAI_PROMPT_CACHE_KEY_THINKING_RICH_INTERNAL
export const OPENAI_PROMPT_CACHE_KEY_THINKING_REVIEW_RICH =
  OPENAI_PROMPT_CACHE_KEY_THINKING_RICH_INTERNAL

/** Stabiler Kernel — identisch in Draft, Review und Final (OpenAI Prompt Cache). */
export function buildThinkingRichOpenAiCachedKernel(): string {
  return [buildThinkingGeminiKernelPrompt(), buildThinkingGeminiRichTierPrompt()].join('\n\n')
}

/**
 * Stabiler Kernel für Reply, Standard-Tier, wenn OpenAI ohne Gemini-Fallback läuft
 * (Gemini global deaktiviert). Tier-abhängiger Inhalt, aber turn-/task-type-unabhängig —
 * macht den System-Prefix cachefähig (die task-type-spezifische Anweisung wandert in den
 * dynamischen Turn-Block, siehe `thinkingOpenAiStandardCacheSplit` in chat.service.ts).
 */
export function buildThinkingStandardOpenAiCachedKernel(): string {
  return [buildThinkingGeminiKernelPrompt(), buildThinkingGeminiStandardTierPrompt()].join('\n\n')
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
