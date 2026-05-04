import { getSupabaseClient } from '../../../integrations/supabase/client'

const BUCKET = 'word-templates'
/** Fester Pfad für die eine globale Vorlage (Singleton `app_word_template`). */
export const WORD_TEMPLATE_STORAGE_PATH = 'global/default.docx'

export type AppWordTemplateMeta = {
  storage_path: string | null
  file_display_name: string
  updated_at: string
}

export async function fetchWordTemplateMeta(): Promise<AppWordTemplateMeta | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('app_word_template')
    .select('storage_path, file_display_name, updated_at')
    .eq('id', 1)
    .maybeSingle()

  if (error || !data) {
    return null
  }
  return {
    storage_path: typeof data.storage_path === 'string' ? data.storage_path : null,
    file_display_name: typeof data.file_display_name === 'string' ? data.file_display_name : 'Vorlage.docx',
    updated_at: typeof data.updated_at === 'string' ? data.updated_at : '',
  }
}

export async function uploadWordTemplate(file: File): Promise<void> {
  const supabase = getSupabaseClient()
  const { error: upError } = await supabase.storage.from(BUCKET).upload(WORD_TEMPLATE_STORAGE_PATH, file, {
    upsert: true,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  if (upError) {
    throw new Error(upError.message)
  }

  const { error: rowError } = await supabase
    .from('app_word_template')
    .update({
      storage_path: WORD_TEMPLATE_STORAGE_PATH,
      file_display_name: file.name?.trim() || 'Vorlage.docx',
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)

  if (rowError) {
    throw new Error(rowError.message)
  }
}
