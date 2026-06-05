/**
 * Obergrenze für Completion-Tokens im Hauptchat (`chat-completion` Body-Feld `maxTokens`).
 * Senkt Output-Kosten; gleichen Wert nutzt die Edge für OpenAI (`max_completion_tokens`/`max_tokens`).
 */
/** Instant: adaptiver Umfang (einfach kurz, komplex tiefer); Obergrenze für lange Diagnosen. */
export const MAIN_CHAT_MAX_OUTPUT_TOKENS = 2048

/** Instant — Aufgabentyp summary: ausführliche Kapitel-Zusammenfassungen. */
export const MAIN_CHAT_SUMMARY_MAX_OUTPUT_TOKENS = 8000

/** Experiment/Test: Summary-Instant über OpenAI statt Gemini Flash Lite. */
export const MAIN_CHAT_SUMMARY_OPENAI_MODELS = ['gpt-5-mini', 'gpt-4o-mini'] as const

/** Thinking-Modus: ausführliche Antworten, Dokument-Zusammenfassungen mit vielen Abschnitten. */
export const THINKING_MAX_OUTPUT_TOKENS = 8192

/**
 * Lernpfad-Antworten über dieselbe Route: etwas höheres Limit für Kapitel-/Übungsantworten.
 */
export const LEARN_PATH_MAX_OUTPUT_TOKENS = 12288

export type MainChatOutputTokenProfile = {
  task_type?: 'mc_solve' | 'quiz_generate' | 'explanation' | 'summary'
}

/** Completion-Obergrenze je nach Instant-Aufgabentyp (Thinking hat eigenes Limit). */
export function resolveMainChatMaxOutputTokens(
  analyze?: MainChatOutputTokenProfile | null,
): number {
  if (analyze?.task_type === 'summary') {
    return MAIN_CHAT_SUMMARY_MAX_OUTPUT_TOKENS
  }
  return MAIN_CHAT_MAX_OUTPUT_TOKENS
}
