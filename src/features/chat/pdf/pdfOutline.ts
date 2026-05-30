import type { ChatMessage } from '../types'
import { extractWordOutlineFromThread } from '../utils/wordOutline'

export function extractPdfOutlineFromThread(messages: ChatMessage[]) {
  return extractWordOutlineFromThread(messages)
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
  if (!messages.some((m) => m.role === 'user' && m.metadata?.userPdfCommand === true)) {
    return false
  }
  return extractPdfOutlineFromThread(messages) !== null
}
