import type { ChatMessage } from '../types'
import { extractWordOutlineFromThread } from '../utils/wordOutline'

export function extractPdfOutlineFromThread(messages: ChatMessage[]) {
  return extractWordOutlineFromThread(messages, 'pdf')
}

function findLastUserMessage(messages: ChatMessage[]): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      return messages[i]
    }
  }
  return undefined
}

export function canFinalizePdfExportFromThread(messages: ChatMessage[]): boolean {
  if (messages.length < 2) {
    return false
  }
  const last = messages[messages.length - 1]
  if (last?.role !== 'assistant' || last.metadata?.pdfExport) {
    return false
  }
  if (last.metadata?.liveStream) {
    return false
  }
  const lastUser = findLastUserMessage(messages)
  if (lastUser?.metadata?.userPdfCommand !== true) {
    return false
  }
  return extractPdfOutlineFromThread(messages) !== null
}
