import {
  type ChatIntentModelRoutingConfig,
  parseChatIntentModelRoutingRows,
} from '../constants/chatIntentModelRouting'
import { getSupabaseClient } from '../../../integrations/supabase/client'

let chatIntentModelRoutingFromSupabase: ChatIntentModelRoutingConfig | null = null
let chatIntentModelRoutingLoadPromise: Promise<void> | null = null

export function setChatIntentModelRoutingFromSupabase(config: ChatIntentModelRoutingConfig): void {
  chatIntentModelRoutingFromSupabase = config
}

export function clearChatIntentModelRoutingCache(): void {
  chatIntentModelRoutingFromSupabase = null
}

export function getChatIntentModelRoutingConfig(): ChatIntentModelRoutingConfig {
  return chatIntentModelRoutingFromSupabase ?? []
}

export function isChatIntentModelRoutingLoaded(): boolean {
  return chatIntentModelRoutingFromSupabase !== null
}

export async function ensureChatIntentModelRoutingLoaded(): Promise<void> {
  if (chatIntentModelRoutingFromSupabase !== null) {
    return
  }
  if (!chatIntentModelRoutingLoadPromise) {
    chatIntentModelRoutingLoadPromise = Promise.resolve(
      getSupabaseClient().rpc('get_chat_intent_model_routing'),
    )
      .then(({ data, error }) => {
        if (error) {
          throw error
        }
        setChatIntentModelRoutingFromSupabase(parseChatIntentModelRoutingRows(data))
      })
      .catch(() => {
        setChatIntentModelRoutingFromSupabase([])
      })
      .finally(() => {
        chatIntentModelRoutingLoadPromise = null
      })
  }
  await chatIntentModelRoutingLoadPromise
}
