type AiProvider = 'mock' | 'openai' | 'anthropic'

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
  if (envFromVite.VITE_AI_PROVIDER === 'anthropic') {
    // Legacy-Wert: aktiviert wie «openai» den Gateway-Modus (Edge Function; Provider pro Request).
    return 'anthropic'
  }

  // Default: Gateway (Hauptchat + Lernpfad über OpenAI GPT-5 mini — siehe chat.service + Edge Function).
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
