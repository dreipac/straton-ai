import type { ChatMessage } from '../types'
import type { ImageSearchPriorTurn } from './imageSearchIntent'

export type ImageSearchMetadata = NonNullable<ChatMessage['metadata']>['imageSearch']

export function getImageSearchMetadata(
  message: Pick<ChatMessage, 'metadata'>,
): ImageSearchMetadata | undefined {
  return message.metadata?.imageSearch ?? message.metadata?.unsplashSearch
}

export function getImageSearchQuery(message: Pick<ChatMessage, 'metadata'>): string | undefined {
  return getImageSearchMetadata(message)?.query
}

export function toImageSearchPriorTurns(
  messages: ReadonlyArray<Pick<ChatMessage, 'role' | 'content' | 'metadata'>>,
): ImageSearchPriorTurn[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const imageSearchQuery = getImageSearchQuery(m)
      return {
        role: m.role as 'user' | 'assistant',
        content: m.content,
        ...(imageSearchQuery ? { imageSearchQuery } : {}),
      }
    })
}
