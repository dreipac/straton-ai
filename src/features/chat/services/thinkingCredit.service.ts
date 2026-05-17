import { getSupabaseClient } from '../../../integrations/supabase/client'

/** Eine Thinking-Modus-Nachricht (RPC `consume_one_thinking_credit`). */
export async function consumeThinkingCredit(): Promise<number> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('consume_one_thinking_credit')

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('THINKING_LIMIT')) {
      throw new Error(
        'Dein Thinking-Guthaben ist aufgebraucht. Es wird täglich (UTC) entsprechend deinem Abo wieder aufgeladen.',
      )
    }
    throw new Error(msg || 'Thinking-Guthaben konnte nicht gebucht werden.')
  }

  if (typeof data === 'number' && Number.isFinite(data)) {
    return Math.max(0, Math.floor(data))
  }
  return 0
}
