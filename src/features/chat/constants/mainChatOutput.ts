/**
 * Obergrenze für Completion-Tokens im Hauptchat (`chat-completion` Body-Feld `maxTokens`).
 * Senkt Output-Kosten; gleichen Wert nutzt die Edge für OpenAI (`max_completion_tokens`/`max_tokens`).
 */
export const MAIN_CHAT_MAX_OUTPUT_TOKENS = 4096

/**
 * Lernpfad-Antworten über dieselbe Route: etwas höheres Limit für Kapitel-/Übungsantworten.
 */
export const LEARN_PATH_MAX_OUTPUT_TOKENS = 12288
