type AiProvider = 'mock' | 'openai'

type AppEnv = {
  supabaseUrl: string
  supabaseAnonKey: string
  aiProvider: AiProvider
}

const envFromVite = import.meta.env

function getAiProvider(): AiProvider {
  if (envFromVite.VITE_AI_PROVIDER === 'mock') {
    return 'mock'
  }

  // Default to OpenAI gateway via Supabase Edge Function.
  return 'openai'
}

export const env: AppEnv = {
  supabaseUrl: envFromVite.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: envFromVite.VITE_SUPABASE_ANON_KEY ?? '',
  aiProvider: getAiProvider(),
}

export function hasSupabaseConfig() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey)
}
