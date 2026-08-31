/**
 * Fallback, wenn ein Abo kein `ai_credits_balance_max` liefert (z. B. Alt-Daten vor der Credits-Migration).
 * Ersetzt das frühere `MAX_TOKEN_BALANCE` (tokenBalance.ts) / `DEFAULT_THINKING_CREDIT_MAX`
 * (thinkingCredits.ts) — Chat und Denken teilen sich seit dem Credits-System einen Pool.
 */
export const DEFAULT_AI_CREDITS_BALANCE_MAX = 5000
