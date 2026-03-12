import { env } from '../../../config/env'
import { getMockAssistantReply } from '../../../integrations/ai/mockAiAdapter'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import type { ChatMessage } from '../types'

type SendMessageResult = {
  assistantMessage: ChatMessage
}

function createAssistantMessage(content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content,
    createdAt: new Date().toISOString(),
  }
}

async function getAssistantReply(messages: ChatMessage[]) {
  if (env.aiProvider === 'openai') {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.functions.invoke('chat-completion', {
      body: {
        provider: 'openai',
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      },
    })

    if (error) {
      throw new Error(error.message)
    }

    const content = data?.assistantMessage?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Der KI-Provider hat keine gueltige Antwort geliefert.')
    }

    return content
  }

  return getMockAssistantReply(messages)
}

export async function sendMessage(messages: ChatMessage[]): Promise<SendMessageResult> {
  const content = await getAssistantReply(messages)
  return {
    assistantMessage: createAssistantMessage(content),
  }
}
