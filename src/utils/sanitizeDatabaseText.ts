/** PostgreSQL jsonb lehnt u. a. `\u0000` ab → «unsupported Unicode escape sequence». */
const JSONB_FORBIDDEN = /\u0000/g

/** Steuerzeichen (außer Tab/CR/LF) können API/JSON-Probleme verursachen. */
const CONTROL_CHARS_EXCEPT_WHITESPACE = /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

export function isPostgresUnicodeEscapeError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err ?? '')
  const lower = msg.toLowerCase()
  return lower.includes('unsupported unicode escape') || lower.includes('22p05')
}

/** Text für `chat_messages.content` (TEXT). */
export function sanitizeChatMessageContentForDb(content: string): string {
  return content.replace(JSONB_FORBIDDEN, '').replace(CONTROL_CHARS_EXCEPT_WHITESPACE, '')
}

/** Rekursiv für `metadata` (jsonb) — nur JSON-taugliche Werte. */
export function sanitizeForJsonbStorage<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (typeof v === 'string') {
        return v.replace(JSONB_FORBIDDEN, '').replace(CONTROL_CHARS_EXCEPT_WHITESPACE, '')
      }
      return v
    }),
  ) as T
}
