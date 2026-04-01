import type { SystemPromptKey } from '../../config/systemPromptDefaults'
import { getSupabaseClient } from '../../integrations/supabase/client'

export async function fetchSystemPromptsFromDb(): Promise<Partial<Record<SystemPromptKey, string>>> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.from('app_system_prompts').select('key, content')
  if (error) {
    throw error
  }
  const out: Partial<Record<SystemPromptKey, string>> = {}
  for (const row of data ?? []) {
    const key = row.key as string
    const content = row.content
    if (typeof key === 'string' && typeof content === 'string') {
      out[key as SystemPromptKey] = content
    }
  }
  return out
}

export async function upsertSystemPrompt(key: SystemPromptKey, content: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('app_system_prompts').upsert(
    {
      key,
      content,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
  if (error) {
    throw error
  }
}

/** Entfernt DB-Zeile; Frontend faellt wieder auf Code-Defaults zurueck. */
export async function deleteSystemPromptOverride(key: SystemPromptKey): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('app_system_prompts').delete().eq('key', key)
  if (error) {
    throw error
  }
}
