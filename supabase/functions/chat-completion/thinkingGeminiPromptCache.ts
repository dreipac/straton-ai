/** Spiegel von src/features/chat/constants/thinkingGeminiPromptCache.ts — Prompt-Kernel für Context Cache. */

import { buildThinkingAnalyzeSystemPromptBase } from './thinkingAnalyzePrompts.ts'

export const GEMINI_CONTEXT_CACHE_THINKING_DRAFT_STANDARD =
  'straton-thinking-draft-standard-gemini-v3'
export const GEMINI_CONTEXT_CACHE_THINKING_DRAFT_RICH = 'straton-thinking-draft-rich-gemini-v3'
export const GEMINI_CONTEXT_CACHE_THINKING_REVIEW_STANDARD =
  'straton-thinking-review-standard-gemini-v3'
export const GEMINI_CONTEXT_CACHE_THINKING_REVIEW_RICH = 'straton-thinking-review-rich-gemini-v3'
export const GEMINI_CONTEXT_CACHE_THINKING_REPLY_STANDARD =
  'straton-thinking-reply-standard-gemini-v3'
export const GEMINI_CONTEXT_CACHE_THINKING_REPLY_RICH = 'straton-thinking-reply-rich-gemini-v3'

export type ThinkingOutputTierEdge = 'standard' | 'rich'
export type ThinkingGeminiCacheModeEdge = 'analyze' | 'draft' | 'review' | 'reply'

export function resolveThinkingGeminiContextCacheKeyEdge(
  mode: ThinkingGeminiCacheModeEdge,
  tier: ThinkingOutputTierEdge = 'standard',
): string {
  if (mode === 'analyze') {
    return 'straton-thinking-analyze-gemini-v1'
  }
  if (mode === 'draft') {
    return tier === 'rich'
      ? GEMINI_CONTEXT_CACHE_THINKING_DRAFT_RICH
      : GEMINI_CONTEXT_CACHE_THINKING_DRAFT_STANDARD
  }
  if (mode === 'review') {
    return tier === 'rich'
      ? GEMINI_CONTEXT_CACHE_THINKING_REVIEW_RICH
      : GEMINI_CONTEXT_CACHE_THINKING_REVIEW_STANDARD
  }
  return tier === 'rich'
    ? GEMINI_CONTEXT_CACHE_THINKING_REPLY_RICH
    : GEMINI_CONTEXT_CACHE_THINKING_REPLY_STANDARD
}

function thinkingGeminiKernel(): string {
  return [
    'Thinking-Modus (Gemini): Analyze immer Standard-Modell; Draft/Review/Final nach output_tier.',
    'Ablauf: Aufgabenanalyse → optional Clarify (max. 1) → interner Entwurf → Review → finale Antwort.',
    'Markdown-Visualisierung: Fliesstext ist der Normalfall. Setze ```cards``` (tone/label/title/body/badges), ```divided-list`, Callouts `> !/?/!!/✓` oder `---` gezielt ein, wenn es Verständnis/Übersicht wirklich verbessert — nicht automatisch bei jeder Aufzählung.',
    'Bei 3+ parallelen Typen/Kategorien mit eigenem Inhalt (mind. 1 Satz pro Eintrag): ```cards``` statt Bullet-Liste oder rohe Pipe-Tabelle. Bei reinen Kurz-Stichworten reicht eine Liste.',
    'Kurze Folgenachrichten (z. B. «und jetzt?», «wieso?», «mehr»): Fortsetzung der eigenen letzten Antwort in diesem Thread — nicht als neues, unklares Thema behandeln.',
    'Schweizer Hochdeutsch (ss statt ß). Keine Emojis in ##-Überschriften.',
  ].join('\n')
}

function thinkingStandardTier(): string {
  return [
    'Thinking — Standard-Tier: knapp, präzise; MC zuerst **Antwort: X**; How-to mit nummerierten ##-Kapiteln.',
  ].join('\n')
}

function thinkingRichTier(): string {
  return [
    'Thinking — Rich-Tier: Zusammenfassungen immer mit ```cards```/```divided-list``` — auch ohne «ausführlich».',
    'Pro Kapitel max. 1 Einleitungssatz, Rest Kacheln; kein «Dossier deckt/thematisiert…».',
    'Schulblatt: integriertes Lernskript — Themen ausarbeiten, Fragen beantworten; kein Aufgabe:/Lösung:-Format.',
    'Jedes Pflicht-Thema aus document_coverage_topics abdecken.',
  ].join('\n')
}

function thinkingTierKernel(tier: ThinkingOutputTierEdge): string {
  return tier === 'rich' ? thinkingRichTier() : thinkingStandardTier()
}

export function buildThinkingDraftGeminiCachedSystemEdge(tier: ThinkingOutputTierEdge): string {
  return [
    thinkingGeminiKernel(),
    thinkingTierKernel(tier),
    'INTERNER Entwurf — vollständige Lösung, ##-Kapitel, `---` zwischen Hauptteilen.',
    'Bei [Datei:…]: Inhalt aus Dateiblock — nicht nur Themen aufzählen. Kein Clarify-Block.',
  ].join('\n\n')
}

export function buildThinkingReviewGeminiCachedSystemEdge(tier: ThinkingOutputTierEdge): string {
  const cardsStrict =
    tier === 'rich'
      ? [
          'Rich/document_summary: fits_intent false bei Meta ohne Fakten, Bullets statt ```cards```, fehlenden Kacheln.',
          'rewrite_hints: «```cards``` mit tone/badges» explizit fordern.',
        ].join(' ')
      : 'Standard: fits_intent false bei leerem oder irrelevantem Entwurf.'

  return [
    thinkingGeminiKernel(),
    thinkingTierKernel(tier),
    'Prüfe Entwurf — nur JSON: fits_intent, gaps[], rewrite_hints, summary, needs_live_web (boolean), web_query (string, max 120, nur wenn needs_live_web), web_reason (string, max 80, nur wenn needs_live_web).',
    cardsStrict,
    'needs_live_web true, wenn der Entwurf auf Fakten beruht, die sich ändern können (Preise, Kurse, News, Versionen, Verfügbarkeit, konkrete Produkte/Modelle) und du dir nicht sicher bist, ob dein Wissen aktuell/korrekt ist — auch wenn die Aufgabenanalyse das nicht erkannt hat.',
  ].join('\n\n')
}

export function buildThinkingAnalyzeGeminiCachedSystemEdge(): string {
  return buildThinkingAnalyzeSystemPromptBase('Gemini 3.1 Flash Lite')
}
