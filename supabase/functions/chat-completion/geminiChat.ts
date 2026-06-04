import { GEMINI_DEFAULT_CHAT_MODEL, type GeminiModelId } from './geminiModels.ts'
import { geminiGenerateText, type GeminiUsage } from './geminiClient.ts'

/** Muss mit Client `GEMINI_CONTEXT_CACHE_INSTANT_REPLY` übereinstimmen. */
const GEMINI_CONTEXT_CACHE_INSTANT_REPLY = 'straton-instant-reply-v1'

export type GeminiChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type GeminiChatResult = {
  text: string
  model: GeminiModelId
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
}

function buildGeminiConversation(messages: GeminiChatMessage[]): {
  systemInstruction: string
  userPrompt: string
} {
  const systemParts: string[] = []
  const turns: string[] = []

  for (const m of messages) {
    const content = m.content.trim()
    if (!content) {
      continue
    }
    if (m.role === 'system') {
      systemParts.push(content)
      continue
    }
    const label = m.role === 'assistant' ? 'ASSISTENT' : 'NUTZER'
    turns.push(`${label}:\n${content}`)
  }

  return {
    systemInstruction: systemParts.join('\n\n'),
    userPrompt: turns.join('\n\n---\n\n'),
  }
}

export async function geminiChatCompletion(
  messages: GeminiChatMessage[],
  options?: {
    model?: GeminiModelId
    maxOutputTokens?: number
    contextCacheKey?: string
  },
): Promise<GeminiChatResult> {
  const { systemInstruction, userPrompt } = buildGeminiConversation(messages)
  if (!userPrompt.trim()) {
    throw new Error('Keine gültigen Nachrichten für Gemini-Chat.')
  }

  const cacheKey =
    options?.contextCacheKey === GEMINI_CONTEXT_CACHE_INSTANT_REPLY
      ? GEMINI_CONTEXT_CACHE_INSTANT_REPLY
      : options?.contextCacheKey

  const { text, usage, model } = await geminiGenerateText(userPrompt, {
    model: options?.model ?? GEMINI_DEFAULT_CHAT_MODEL,
    systemInstruction,
    contextCacheKey: cacheKey,
    maxOutputTokens: options?.maxOutputTokens ?? 8192,
    temperature: 0.35,
  })

  return {
    text,
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    ...(usage.cachedInputTokens != null && usage.cachedInputTokens > 0
      ? { cachedInputTokens: usage.cachedInputTokens }
      : {}),
  }
}

export { GEMINI_CONTEXT_CACHE_INSTANT_REPLY, type GeminiUsage }
