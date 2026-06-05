import { GEMINI_DEFAULT_CHAT_MODEL, type GeminiModelId } from './geminiModels.ts'
import {
  geminiGenerateContents,
  geminiGenerateText,
  type GeminiContentPart,
  type GeminiContentTurn,
  type GeminiUsage,
} from './geminiClient.ts'

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

function stripBildDataBlocksFromContent(content: string): string {
  let result = ''
  let cursor = 0
  const closeTag = '[/BildData]'
  while (true) {
    const openIdx = content.indexOf('[BildData:', cursor)
    if (openIdx === -1) {
      result += content.slice(cursor)
      break
    }
    result += content.slice(cursor, openIdx)
    const closeIdx = content.indexOf(closeTag, openIdx)
    if (closeIdx === -1) {
      result += content.slice(openIdx)
      break
    }
    cursor = closeIdx + closeTag.length
  }
  return result.replace(/\[Bild:[^\]]*\][\s\S]*?\[\/Bild\]/g, '').trim()
}

function parseDataUrlForGeminiInline(dataUrl: string): GeminiContentPart | null {
  const trimmed = dataUrl.trim()
  const marker = 'base64,'
  const idx = trimmed.indexOf(marker)
  if (!trimmed.startsWith('data:image/') || idx < 0) {
    return null
  }
  const headerMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i.exec(trimmed)
  let mimeType = (headerMatch?.[1] ?? 'image/jpeg').toLowerCase()
  if (mimeType === 'image/jpg') {
    mimeType = 'image/jpeg'
  }
  const data = trimmed.slice(idx + marker.length).replace(/\s+/g, '')
  if (data.length < 64) {
    return null
  }
  return { inlineData: { mimeType, data } }
}

function extractVisionFromUserContent(content: string): { text: string; imageDataUrls: string[] } {
  const imageDataUrls: string[] = []
  let searchFrom = 0
  const closeTag = '[/BildData]'
  while (imageDataUrls.length < 1) {
    const openIdx = content.indexOf('[BildData:', searchFrom)
    if (openIdx === -1) {
      break
    }
    const closeIdx = content.indexOf(closeTag, openIdx)
    if (closeIdx === -1) {
      break
    }
    const headerEnd = content.indexOf(']', openIdx)
    if (headerEnd === -1 || headerEnd > closeIdx) {
      searchFrom = openIdx + 1
      continue
    }
    const inner = content.slice(headerEnd + 1, closeIdx).trim()
    if (inner.startsWith('data:image/')) {
      imageDataUrls.push(inner)
    } else {
      const dataIdx = inner.indexOf('data:image/')
      if (dataIdx >= 0) {
        imageDataUrls.push(inner.slice(dataIdx))
      }
    }
    searchFrom = closeIdx + closeTag.length
  }
  return { text: stripBildDataBlocksFromContent(content), imageDataUrls: imageDataUrls.slice(0, 1) }
}

function messageHasVisionPayload(content: string): boolean {
  return content.includes('[BildData:') || content.includes('data:image/')
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

function buildGeminiMultimodalContents(messages: GeminiChatMessage[]): GeminiContentTurn[] {
  const contents: GeminiContentTurn[] = []

  for (const m of messages) {
    if (m.role === 'system') {
      continue
    }
    const trimmed = m.content.trim()
    if (!trimmed) {
      continue
    }

    if (m.role === 'assistant') {
      contents.push({ role: 'model', parts: [{ text: trimmed }] })
      continue
    }

    const { text, imageDataUrls } = extractVisionFromUserContent(trimmed)
    const parts: GeminiContentPart[] = []
    for (const url of imageDataUrls) {
      const inline = parseDataUrlForGeminiInline(url)
      if (inline) {
        parts.push(inline)
      }
    }
    const textPart = text.trim() || (parts.length > 0 ? 'Siehe angehängtes Bild.' : '')
    if (textPart) {
      parts.push({ text: textPart })
    }
    if (parts.length > 0) {
      contents.push({ role: 'user', parts })
    }
  }

  return contents
}

export async function geminiChatCompletion(
  messages: GeminiChatMessage[],
  options?: {
    model?: GeminiModelId
    maxOutputTokens?: number
    contextCacheKey?: string
  },
): Promise<GeminiChatResult> {
  const systemInstruction = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join('\n\n')

  const chatMessages = messages.filter((m) => m.role !== 'system')
  const hasVision = chatMessages.some(
    (m) => m.role === 'user' && messageHasVisionPayload(m.content),
  )

  const cacheKey =
    options?.contextCacheKey === GEMINI_CONTEXT_CACHE_INSTANT_REPLY
      ? GEMINI_CONTEXT_CACHE_INSTANT_REPLY
      : options?.contextCacheKey

  const generateOptions = {
    model: options?.model ?? GEMINI_DEFAULT_CHAT_MODEL,
    systemInstruction,
    contextCacheKey: cacheKey,
    maxOutputTokens: options?.maxOutputTokens ?? 8192,
    temperature: 0.35,
  }

  const { text, usage, model } = hasVision
    ? await geminiGenerateContents(buildGeminiMultimodalContents(messages), generateOptions)
    : await (async () => {
        const { userPrompt } = buildGeminiConversation(messages)
        if (!userPrompt.trim()) {
          throw new Error('Keine gültigen Nachrichten für Gemini-Chat.')
        }
        return geminiGenerateText(userPrompt, generateOptions)
      })()

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
