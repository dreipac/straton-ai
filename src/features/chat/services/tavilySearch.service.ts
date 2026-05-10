import { getSupabaseClient } from '../../../integrations/supabase/client'

export type TavilySearchResult = {
  contextText: string
  /** Nach erfolgreicher Buchung; Superadmins ohne festes Limit oft ausgelassen. */
  remainingWebSearchCredits?: number
}

/**
 * Tavily-Websuche über Edge Function `tavily-search` (API-Key nur serverseitig).
 * Liefert formatierten Kontext für den Hauptchat.
 */
export async function fetchTavilySearchContext(query: string): Promise<TavilySearchResult> {
  const trimmed = query.trim()
  if (!trimmed.length) {
    throw new Error('Bitte eine Frage oder Suchanfrage eingeben.')
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke<{
    contextText?: string
    remainingWebSearchCredits?: number
    error?: string
    message?: string
  }>('tavily-search', {
    body: { query: trimmed.slice(0, 500) },
  })

  if (error) {
    const base = error.message || 'Websuche ist fehlgeschlagen.'
    if (base.includes('402') || base.toLowerCase().includes('guthaben')) {
      throw new Error(
        'Dein Websuche-Guthaben ist aufgebraucht. Es wird täglich (UTC) entsprechend deinem Abo wieder aufgeladen.',
      )
    }
    throw new Error(base)
  }

  if (data && typeof data === 'object' && data.error === 'WEB_SEARCH_LIMIT') {
    throw new Error(
      typeof data.message === 'string' && data.message.trim()
        ? data.message.trim()
        : 'Dein Websuche-Guthaben ist aufgebraucht.',
    )
  }

  const ctx =
    data && typeof data === 'object' && typeof data.contextText === 'string' ? data.contextText.trim() : ''
  if (!ctx.length) {
    throw new Error('Websuche lieferte keine nutzbaren Ergebnisse.')
  }

  const remainingWebSearchCredits =
    data && typeof data === 'object' && typeof data.remainingWebSearchCredits === 'number'
      ? data.remainingWebSearchCredits
      : undefined

  return { contextText: ctx, remainingWebSearchCredits }
}
