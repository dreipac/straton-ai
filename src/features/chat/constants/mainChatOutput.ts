/**
 * Obergrenze für Completion-Tokens im Hauptchat (`chat-completion` Body-Feld `maxTokens`).
 * Senkt Output-Kosten; gleichen Wert nutzt die Edge für OpenAI (`max_completion_tokens`/`max_tokens`).
 */
/** Passt zu Instant-Modus (mittlerer Umfang); begrenzt Kosten, erlaubt strukturierte Antworten. */
export const MAIN_CHAT_MAX_OUTPUT_TOKENS = 2048

/** Thinking-Modus: ausführliche Antworten, Dokument-Zusammenfassungen mit vielen Abschnitten. */
export const THINKING_MAX_OUTPUT_TOKENS = 8192

/**
 * Lernpfad-Antworten über dieselbe Route: etwas höheres Limit für Kapitel-/Übungsantworten.
 */
export const LEARN_PATH_MAX_OUTPUT_TOKENS = 12288
