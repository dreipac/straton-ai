/** Smart Instant (Modus «normal»): Provider + Modellkette über Gemini API (Edge Function). */
export const SMART_INSTANT_GEMINI_PROVIDER = 'google' as const

/** GA-Modell (Mai 2026); Preview als Fallback. */
export const SMART_INSTANT_GEMINI_MODEL_PRIMARY = 'gemini-3.1-flash-lite'
export const SMART_INSTANT_GEMINI_MODEL_FALLBACK = 'gemini-3.1-flash-lite-preview'

export const SMART_INSTANT_GEMINI_MODEL_CHAIN = [
  SMART_INSTANT_GEMINI_MODEL_PRIMARY,
  SMART_INSTANT_GEMINI_MODEL_FALLBACK,
] as const
