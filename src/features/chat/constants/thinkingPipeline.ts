import type { ChatMessage } from '../types'
import { getSecretSafetyInstruction } from './chatSecretSafety'
import { messageContainsCompleteThinkingClarifyBlock } from '../utils/thinkingClarify'
import type { ThinkingAnalyzeResult } from './thinkingAnalyze'
import { buildThinkingReviewBriefingForGateway, type ThinkingReviewResult } from './thinkingReview'

/** OpenAI-Kette für alle Thinking-Schritte (Analyze, Entwurf, Review, Generate). */
/** Fallback, wenn Gemini Instant global aus ist. */
export const THINKING_OPENAI_MODEL_CHAIN = ['gpt-5-mini', 'gpt-4o-mini'] as const

const FILE_BLOCK_RE = /\[Datei:\s*[^\]]+\]/i

export function userMessageHasThinkingFileAttachment(content: string): boolean {
  return FILE_BLOCK_RE.test(content)
}

/** Kurze Folgenachricht nach einer fertigen Thinking-Antwort (kein erneutes Interview). */
export function isThinkingContinuationFollowUp(
  userMessage: string,
  messages: ChatMessage[],
): boolean {
  const trimmed = userMessage.trim()
  if (!trimmed || trimmed.length > 140) {
    return false
  }
  for (let i = messages.length - 2; i >= 0; i -= 1) {
    const m = messages[i]
    if (m?.role === 'assistant') {
      if (messageContainsCompleteThinkingClarifyBlock(m.content)) {
        return false
      }
      return m.content.trim().length > 400
    }
  }
  return false
}

export function applyThinkingAnalyzeHeuristics(
  userMessage: string,
  analyze: ThinkingAnalyzeResult,
  opts?: { isContinuationFollowUp?: boolean; hasVisionAttachment?: boolean },
): ThinkingAnalyzeResult {
  const trimmed = userMessage.trim()
  const hasFile = userMessageHasThinkingFileAttachment(trimmed)
  const hasVision = opts?.hasVisionAttachment === true

  if (opts?.isContinuationFollowUp) {
    return {
      ...analyze,
      needs_clarification: false,
      clarify_rounds_planned: 0,
      missing_dimensions: [],
    }
  }

  if ((hasFile || hasVision) && analyze.task_type === 'document_summary') {
    return {
      ...analyze,
      needs_clarification: false,
      clarify_rounds_planned: 0,
      missing_dimensions: [],
    }
  }

  if (hasVision && analyze.task_type === 'other') {
    return {
      ...analyze,
      task_type: 'document_summary',
      needs_clarification: false,
      clarify_rounds_planned: 0,
      missing_dimensions: [],
      intent: analyze.intent.trim() || 'Bildanhang auswerten',
    }
  }

  if (!analyze.needs_clarification) {
    return {
      ...analyze,
      clarify_rounds_planned: 0,
      missing_dimensions: [],
    }
  }

  return {
    ...analyze,
    clarify_rounds_planned: 1,
    missing_dimensions: analyze.missing_dimensions.slice(0, 1),
  }
}

export function buildThinkingDraftBriefingForGateway(draft: string): string {
  const body = draft.trim()
  if (!body) {
    return ''
  }
  const clipped = body.length > 14_000 ? `${body.slice(0, 14_000)}\n… [Entwurf gekürzt]` : body
  return [
    'Thinking — Interner Entwurf (Grundlage für die sichtbare Antwort; nicht wörtlich kopieren wenn Lücken gemeldet):',
    clipped,
  ].join('\n')
}

export function buildThinkingPipelineBriefingForGateway(params: {
  draft: string
  review: ThinkingReviewResult
}): string {
  const parts = [
    buildThinkingDraftBriefingForGateway(params.draft),
    buildThinkingReviewBriefingForGateway(params.review),
  ].filter(Boolean)
  return parts.join('\n\n')
}

export function buildThinkingDraftSystemPrompt(): string {
  return [
    'Du erstellst einen INTERNEN ausführlichen Entwurf für den Straton-Thinking-Modus (Gemini 3.1 Flash Lite).',
    'Der Nutzer sieht diesen Text nicht direkt — er wird später formatiert und veröffentlicht.',
    'Nutze die Aufgabenanalyse: vollständige inhaltliche Lösung, alle wichtigen Schritte/Fakten, passend zu task_type.',
    'Struktur grob mit ##-Überschriften; zwischen Hauptteilen `---`.',
    'Kein Meta («Hier ist dein Entwurf»), kein Clarify-Block, keine Anpassungsfrage am Ende.',
    'Bei Dokumenten/Anhängen: **inhaltliche** Zusammenfassung aus dem [Datei:…]-Text — Fakten, Ziele, Aufgaben, Begriffe; nicht nur aufzählen, was das Dokument «deckt».',
    'VERBOTEN im Entwurf: «Das Dossier thematisiert…», reine Themenlisten ohne Erklärung.',
    'Antworte nur mit dem Entwurf-Markdown (kein JSON).',
  ].join('\n')
}

export function buildThinkingReviewSystemPrompt(): string {
  return [
    getSecretSafetyInstruction(),
    'Du prüfst einen internen Thinking-Entwurf gegen die Nutzeranfrage und die Aufgabenanalyse.',
    'Antworte ausschließlich mit einem JSON-Objekt (kein Markdown):',
    '- fits_intent (boolean): erfüllt der Entwurf die Anfrage inhaltlich?',
    '- gaps (string[], max 6): konkrete Lücken oder Fehler',
    '- rewrite_hints (string, max 600 Zeichen): was die finale sichtbare Antwort noch verbessern muss',
    '- summary (string, max 280 Zeichen): ein Satz Urteil',
    'Sei streng bei leeren, generischen oder falschen Entwürfen.',
    'Bei Zusammenfassung mit [Datei:…]: fits_intent false, wenn nur «Dossier deckt/thematisiert…» ohne Fakten aus dem Anhang.',
    'gaps/rewrite_hints: fehlende **Inhalte** aus dem Anhang nachfordern, nicht nur Struktur.',
  ].join('\n')
}
