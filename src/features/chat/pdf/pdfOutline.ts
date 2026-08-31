import type { ChatMessage } from '../types'
import { extractWordOutlineFromThread } from '../utils/wordOutline'
import { PDF_SPEC_JSON_START, PDF_SPEC_JSON_END } from '../constants/documentExportIntent'

export function stripPdfSpecMarkerBlock(content: string): string {
  const i = content.indexOf(PDF_SPEC_JSON_START)
  const j = content.indexOf(PDF_SPEC_JSON_END)
  if (i === -1 || j === -1 || j < i) {
    return content
  }
  return `${content.slice(0, i).trimEnd()}\n\n${content.slice(j + PDF_SPEC_JSON_END.length).trimStart()}`.trim()
}

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
  if (!lastUser?.metadata?.userPdfCommand && !lastUser?.metadata?.userWordCommand) {
    return false
  }
  return extractPdfOutlineFromThread(messages) !== null
}
