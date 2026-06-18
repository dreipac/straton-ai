import { getSecretSafetyInstruction } from './chatSecretSafety'
import { getSwissGermanOrthographyInstruction } from './chatSwissOrthography'
import { buildDocumentSummaryPlaybook } from './documentSummaryPlaybook'
import type { ThinkingOutputTier } from './thinkingOutputTier'
import {
  getAssistantThinkingMarkdownInstruction,
  getChatThinkingEmojiStyleInstruction,
  getChatThinkingMixedLayoutInstruction,
  getChatThinkingWorkflowInstruction,
} from './chatThinkingInstruction'

/** Gemini Context Cache — Thinking Draft. */
export const GEMINI_CONTEXT_CACHE_THINKING_DRAFT_STANDARD =
  'straton-thinking-draft-standard-gemini-v3' as const
export const GEMINI_CONTEXT_CACHE_THINKING_DRAFT_RICH =
  'straton-thinking-draft-rich-gemini-v3' as const

/** Gemini Context Cache — Thinking Review. */
export const GEMINI_CONTEXT_CACHE_THINKING_REVIEW_STANDARD =
  'straton-thinking-review-standard-gemini-v3' as const
export const GEMINI_CONTEXT_CACHE_THINKING_REVIEW_RICH =
  'straton-thinking-review-rich-gemini-v3' as const

/** Gemini Context Cache — Thinking finale Antwort. */
export const GEMINI_CONTEXT_CACHE_THINKING_REPLY_STANDARD =
  'straton-thinking-reply-standard-gemini-v3' as const
export const GEMINI_CONTEXT_CACHE_THINKING_REPLY_RICH =
  'straton-thinking-reply-rich-gemini-v3' as const

export type ThinkingGeminiCacheMode = 'analyze' | 'draft' | 'review' | 'reply'

export function resolveThinkingGeminiContextCacheKey(
  mode: ThinkingGeminiCacheMode,
  tier: ThinkingOutputTier = 'standard',
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

/** Stabiler Kernel — Workflow, Sicherheit, Markdown/cards-Syntax (gecacht). */
export function buildThinkingGeminiKernelPrompt(): string {
  return [
    getSecretSafetyInstruction(),
    getSwissGermanOrthographyInstruction(),
    getChatThinkingWorkflowInstruction(),
    getChatThinkingEmojiStyleInstruction(),
    'Markdown-Visualisierung (App rendert diese Syntax):',
    '- Grundsatz: Fliesstext ist der Normalfall. Setze visuelles Layout gezielt ein, wenn es Verständnis/Übersicht wirklich verbessert — nicht automatisch bei jeder Aufzählung.',
    '- ```cards` mit `tone`, `label`, `title`, `body`, optional `badges` — Kacheln durch `---` trennen. Sinnvoll bei 3+ parallelen Typen/Kategorien **mit eigenem Inhalt** (mind. ein Satz pro Eintrag); bei reinen Kurz-Stichworten reicht eine Liste.',
    '- ```divided-list` mit `-` Zeilen für 4–8 gleichwertige Fakten.',
    '- Callouts: `> !` Hinweis, `> ?` Frage, `> !!` Warnung, `> ✓` Tipp.',
    '- Zwischen Hauptkapiteln `---`; Glossar nur als `| Begriff | Erklärung |` Tabelle.',
    '- Tabellen nur für echte mehrdimensionale Vergleiche (mehrere Zeilen und Spalten) — nicht für einfache Aufzählungen.',
  ].join('\n')
}

export function buildThinkingGeminiStandardTierPrompt(): string {
  return [
    'Thinking — Standard-Tier (knapp, sparsam):',
    '- Kurze Fragen: präzise Antwort, max. 1–2 Sätze Begründung wo nötig.',
    '- How-to/Setup: nummerierte `##`-Kapitel, je Kapitel 1–2 Sätze + optionale Stichpunkte.',
    '- MC/Auswahl: `**Antwort: X**` oder kleine Tabelle mit ✓ zuerst.',
    '- Kein Essay, keine Pflicht-Kacheln — nur wenn 3+ parallele Kategorien nötig sind.',
  ].join('\n')
}

export function buildThinkingGeminiRichTierPrompt(): string {
  return [
    'Thinking — Rich-Tier (Zusammenfassungen & komplexe Aufgaben):',
    getAssistantThinkingMarkdownInstruction(),
    getChatThinkingMixedLayoutInstruction(),
    '- **Jede Zusammenfassung** (auch ohne Wort «ausführlich»): volles Kachel-Layout — mindestens 2 ```cards```-Blöcke oder 1 Block mit 3+ Kacheln.',
    '- Pro Hauptthema: max. 1 Einleitungssatz, Rest als Kacheln/`divided-list`/Callouts — kein Fliesstext-Wall.',
    buildDocumentSummaryPlaybook(),
  ].join('\n\n')
}

export function buildThinkingGeminiTierKernelPrompt(tier: ThinkingOutputTier): string {
  return tier === 'rich'
    ? buildThinkingGeminiRichTierPrompt()
    : buildThinkingGeminiStandardTierPrompt()
}

export function buildThinkingDraftGeminiCachedSystem(tier: ThinkingOutputTier): string {
  return [
    buildThinkingGeminiKernelPrompt(),
    buildThinkingGeminiTierKernelPrompt(tier),
    'Du erstellst einen INTERNEN Entwurf (Nutzer sieht ihn nicht).',
    'Vollständige inhaltliche Lösung; grob ##-Kapitel und `---` zwischen Hauptteilen.',
    'Bei [Datei:…]: Inhalt aus dem Dateiblock ausarbeiten — nicht «das Dossier deckt…».',
    'Kein Clarify-Block, keine Anpassungsfrage. Nur Entwurf-Markdown.',
  ].join('\n\n')
}

export function buildThinkingReviewGeminiCachedSystem(tier: ThinkingOutputTier): string {
  const cardsRule =
    tier === 'rich'
      ? [
          'Rich/ document_summary — fits_intent false wenn:',
          '- nur Meta («deckt/thematisiert/listet») ohne Fakten aus dem Anhang.',
          '- 3+ parallele Typen/Kategorien als Bullet-Liste oder rohe Markdown-Tabelle statt ```cards```.',
          '- kein ```cards``` oder ```divided-list``` bei Zusammenfassung mit mehreren Themen.',
          '- rewrite_hints: konkret «```cards``` mit tone/badges je Kategorie» fordern.',
        ].join('\n')
      : 'Standard: fits_intent false bei leerem/generischem Entwurf oder fehlender Kernantwort.'

  return [
    buildThinkingGeminiKernelPrompt(),
    buildThinkingGeminiTierKernelPrompt(tier),
    'Du prüfst einen internen Thinking-Entwurf gegen Nutzeranfrage und Aufgabenanalyse.',
    'Antworte ausschließlich mit JSON: fits_intent (boolean), gaps (string[]), rewrite_hints (string), summary (string).',
    'Sei streng bei leeren, generischen oder falschen Entwürfen.',
    cardsRule,
    'fits_intent false bei abgeschnittenem Text oder «Aufgabe:/Lösung:»-Format statt Lernskript.',
  ].join('\n\n')
}

export function buildThinkingReplyGeminiCachedSystem(tier: ThinkingOutputTier): string {
  return [
    buildThinkingGeminiKernelPrompt(),
    buildThinkingGeminiTierKernelPrompt(tier),
    'Finale sichtbare Antwort: Entwurf und Review nutzen, Lücken schließen, Format verbessern.',
    'KEIN Clarify-Block in der finalen Antwort.',
  ].join('\n\n')
}
