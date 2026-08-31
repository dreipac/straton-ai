/** Spiegel von src/features/chat/constants/thinkingGeminiPromptCache.ts — Prompt-Kernel für Context Cache. */

import { buildThinkingAnalyzeSystemPromptBase } from './thinkingAnalyzePrompts.ts'

export const GEMINI_CONTEXT_CACHE_THINKING_DRAFT_STANDARD =
  'straton-thinking-draft-standard-gemini-v4'
export const GEMINI_CONTEXT_CACHE_THINKING_DRAFT_RICH = 'straton-thinking-draft-rich-gemini-v4'
export const GEMINI_CONTEXT_CACHE_THINKING_REVIEW_STANDARD =
  'straton-thinking-review-standard-gemini-v4'
export const GEMINI_CONTEXT_CACHE_THINKING_REVIEW_RICH = 'straton-thinking-review-rich-gemini-v4'
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

/** Reiner Inhalt — keine Formatierungsvorgaben (Cards/Tabellen entscheidet erst Reply anhand des fertigen Inhalts). */
function thinkingStandardTierContent(): string {
  return [
    'Thinking — Standard-Tier: knapp, präzise; MC zuerst **Antwort: X**; How-to mit nummerierten ##-Kapiteln.',
  ].join('\n')
}

function thinkingRichTierContent(): string {
  return [
    'Thinking — Rich-Tier: vollständige, inhaltlich ausgearbeitete Lösung — kein «Dossier deckt/thematisiert…» ohne Substanz.',
    'Schulblatt: integriertes Lernskript — Themen ausarbeiten, Fragen beantworten; kein Aufgabe:/Lösung:-Format.',
    'Jedes Pflicht-Thema aus document_coverage_topics abdecken.',
  ].join('\n')
}

function thinkingTierContentKernel(tier: ThinkingOutputTierEdge): string {
  return tier === 'rich' ? thinkingRichTierContent() : thinkingStandardTierContent()
}

export function buildThinkingDraftGeminiCachedSystemEdge(tier: ThinkingOutputTierEdge): string {
  return [
    thinkingGeminiKernel(),
    thinkingTierContentKernel(tier),
    'INTERNER Entwurf — reiner Inhalt, keine Formatierungsvorgaben: vollständige Lösung, ##-Kapitel, `---` zwischen Hauptteilen.',
    'Bei [Datei:…]: Inhalt aus Dateiblock — nicht nur Themen aufzählen. Kein Clarify-Block.',
  ].join('\n\n')
}

export function buildThinkingReviewGeminiCachedSystemEdge(tier: ThinkingOutputTierEdge): string {
  const contentStrict =
    tier === 'rich'
      ? [
          'Rich/document_summary: fits_intent false bei Meta-Beschreibung ohne Fakten aus dem Anhang oder bei fehlenden wesentlichen Inhalten.',
          'Bei 3+ parallelen Themen/Kategorien mit eigenem Inhalt: rewrite_hints soll empfehlen, die finale Antwort als ```cards```/```divided-list``` zu strukturieren (der Entwurf selbst muss das nicht sein).',
        ].join(' ')
      : 'Standard: fits_intent false bei leerem oder irrelevantem Entwurf.'

  return [
    thinkingGeminiKernel(),
    thinkingTierContentKernel(tier),
    'Prüfe Entwurf — nur JSON: fits_intent, gaps[], rewrite_hints, summary, needs_live_web (boolean), web_query (string, max 120, nur wenn needs_live_web), web_reason (string, max 80, nur wenn needs_live_web).',
    contentStrict,
    'needs_live_web true, wenn der Entwurf auf Fakten beruht, die sich ändern können (Preise, Kurse, News, Versionen, Verfügbarkeit, konkrete Produkte/Modelle) und du dir nicht sicher bist, ob dein Wissen aktuell/korrekt ist — auch wenn die Aufgabenanalyse das nicht erkannt hat.',
  ].join('\n\n')
}

export function buildThinkingAnalyzeGeminiCachedSystemEdge(): string {
  return buildThinkingAnalyzeSystemPromptBase('Gemini 3.1 Flash Lite')
}
