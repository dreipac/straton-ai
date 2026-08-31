import type { ExcelSpecV1 } from '../excel/excelSpec'
import { userMessageHadDirectAnswerIntent } from '../constants/chatDirectAnswerInstruction'
import { userMessageRequestsChart, userMessageRequestsDiagram } from '../constants/instantAnalyzeRoute'
import {
  messageContainsSubscriptionUsageMarker,
  userMessageRequestsSubscriptionUsage,
} from '../constants/chatSubscriptionUsageMarker'
import { stripComposerAttachmentBlocksForRouting } from './chatRoutingText'
import { getImageSearchMetadata } from './imageSearchMetadata'
import type { ChatMessage } from '../types'
import type { ImageSearchMetadata } from './imageSearchMetadata'
import {
  canFinalizeExcelExportFromThread,
  hasExcelSpecMarkers,
  parseExcelSpecFromContent,
} from '../excel/excelSpec'
import {
  canFinalizePdfExportFromThread,
} from '../pdf/pdfOutline'
import {
  canFinalizeWordExportFromThread,
} from './wordOutline'
import {
  hasChartSpecMarkers,
  parseChartSpecFromContent,
  type ChartSpecV1,
} from '../chart/chartSpec'
import {
  hasDiagramSpecMarkers,
  parseDiagramSpecFromContent,
  type DiagramSpecV1,
} from '../diagram/diagramSpec'
import { safeMessageContent } from '../components/chat-window/chatWindowMessageUtils'

export type MessagePriorTurn = {
  role: 'user' | 'assistant'
  content: string
}

export type MessageDisplayContext = {
  precedingUser: ChatMessage | null
  precedingUserRoutingText: string
  isWordAssistantTurn: boolean
  isPdfAssistantTurn: boolean
  isExcelAssistantTurn: boolean
  isChartAssistantTurn: boolean
  isDiagramAssistantTurn: boolean
  isDirectAnswerAssistantTurn: boolean
  isSubscriptionUsageAssistantTurn: boolean
  priorTurnsBeforeMessage: MessagePriorTurn[]
  imageSearchForMessage: ImageSearchMetadata | undefined
  showWordPaperLayout: boolean
}

export type ThreadDisplayContext = {
  latestMessageId: string | undefined
  canFinalizeWord: boolean
  canFinalizePdf: boolean
  canFinalizeExcel: boolean
}

export function buildThreadDisplayContext(messages: ChatMessage[]): ThreadDisplayContext {
  return {
    latestMessageId: messages[messages.length - 1]?.id,
    canFinalizeWord: canFinalizeWordExportFromThread(messages),
    canFinalizePdf: canFinalizePdfExportFromThread(messages),
    canFinalizeExcel: canFinalizeExcelExportFromThread(messages),
  }
}

export function buildMessageDisplayContexts(messages: ChatMessage[]): MessageDisplayContext[] {
  const contexts: MessageDisplayContext[] = []
  let lastUser: ChatMessage | null = null
  const priorTurns: MessagePriorTurn[] = []

  for (const message of messages) {
    const isAssistant = message.role === 'assistant'
    const precedingUser = isAssistant ? lastUser : null
    const precedingUserRoutingText = precedingUser
      ? stripComposerAttachmentBlocksForRouting(precedingUser.content)
      : ''

    const isWordAssistantTurn = isAssistant && Boolean(precedingUser?.metadata?.userWordCommand)
    const isPdfAssistantTurn = isAssistant && Boolean(precedingUser?.metadata?.userPdfCommand)
    const isExcelAssistantTurn = isAssistant && Boolean(precedingUser?.metadata?.userExcelCommand)
    const isChartAssistantTurn =
      isAssistant &&
      Boolean(
        precedingUser &&
          userMessageRequestsChart(precedingUser.content, precedingUser.metadata),
      )
    const isDiagramAssistantTurn =
      isAssistant &&
      Boolean(
        precedingUser &&
          userMessageRequestsDiagram(precedingUser.content, precedingUser.metadata),
      )
    const isDirectAnswerAssistantTurn =
      isAssistant &&
      Boolean(
        precedingUser &&
          userMessageHadDirectAnswerIntent(
            precedingUserRoutingText,
            precedingUser.metadata,
            priorTurns,
          ),
      )
    const isSubscriptionUsageAssistantTurn =
      isAssistant &&
      Boolean(
        precedingUser && userMessageRequestsSubscriptionUsage(precedingUser.content),
      )

    contexts.push({
      precedingUser,
      precedingUserRoutingText,
      isWordAssistantTurn,
      isPdfAssistantTurn,
      isExcelAssistantTurn,
      isChartAssistantTurn,
      isDiagramAssistantTurn,
      isDirectAnswerAssistantTurn,
      isSubscriptionUsageAssistantTurn,
      priorTurnsBeforeMessage: priorTurns,
      imageSearchForMessage: getImageSearchMetadata(message),
      showWordPaperLayout: isWordAssistantTurn || isPdfAssistantTurn,
    })

    if (message.role === 'user') {
      lastUser = message
    }
    if (message.role === 'user' || message.role === 'assistant') {
      priorTurns.push({
        role: message.role,
        content: message.content,
      })
    }
  }

  return contexts
}

export type MessageContentDerivedContext = {
  excelSpecForPreview: ExcelSpecV1 | null
  chartSpecForPreview: ChartSpecV1 | null
  diagramSpecForPreview: DiagramSpecV1 | null
  hasExcelSpecMarkersInContent: boolean
  hasChartSpecMarkersInContent: boolean
  hasDiagramSpecMarkersInContent: boolean
  containsSubscriptionUsageMarker: boolean
}

export function buildMessageContentDerivedContext(
  rawContent: string,
  displayContext: MessageDisplayContext,
  message: Pick<ChatMessage, 'metadata'>,
): MessageContentDerivedContext {
  return {
    excelSpecForPreview:
      displayContext.isExcelAssistantTurn && !message.metadata?.excelExport
        ? parseExcelSpecFromContent(rawContent).spec
        : null,
    chartSpecForPreview: displayContext.isChartAssistantTurn
      ? parseChartSpecFromContent(rawContent).spec
      : null,
    diagramSpecForPreview: displayContext.isDiagramAssistantTurn
      ? parseDiagramSpecFromContent(rawContent).spec
      : null,
    hasExcelSpecMarkersInContent: hasExcelSpecMarkers(rawContent),
    hasChartSpecMarkersInContent: hasChartSpecMarkers(rawContent),
    hasDiagramSpecMarkersInContent: hasDiagramSpecMarkers(rawContent),
    containsSubscriptionUsageMarker: messageContainsSubscriptionUsageMarker(rawContent),
  }
}

export function resolveMessageRawContent(
  message: ChatMessage,
  liveStreamContent?: string,
): string {
  return safeMessageContent(liveStreamContent ?? message.content)
}
