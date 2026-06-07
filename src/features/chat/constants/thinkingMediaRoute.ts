import { fallbackInstantAnalyzeResult } from './instantAnalyze'
import {
  applyRouteHeuristics,
  detectRouteHeuristic,
  resolveInstantRouteOverrides,
  syncReplyModeWithRoute,
  type InstantRouteOverrides,
} from './instantAnalyzeRoute'
import type { InstantAnalyzeResult } from './instantAnalyze'
import type { ImageSearchPriorTurn } from '../utils/imageSearchIntent'

export type { InstantRouteOverrides }

export function resolveThinkingMediaRouteFromHeuristics(
  userMessage: string,
  options: {
    hasVisionAttachment?: boolean
    hasDocumentFileAttachment?: boolean
    priorTurns?: ReadonlyArray<ImageSearchPriorTurn>
    composerRouteLocked?: boolean
  },
): InstantRouteOverrides {
  const none: InstantRouteOverrides = {
    wantsWord: false,
    wantsPdf: false,
    wantsExcel: false,
    wantsChart: false,
    wantsDiagram: false,
    imageGenPrompt: null,
    imageGenEmpty: false,
    imageSearchQuery: null,
    loadReferencedImageVision: false,
  }
  if (options.composerRouteLocked) {
    return none
  }

  const trimmed = userMessage.trim()
  const detected = detectRouteHeuristic(
    trimmed,
    options.hasVisionAttachment === true,
    options.priorTurns,
    options.hasDocumentFileAttachment === true,
  )
  if (!detected) {
    return none
  }

  const base = syncReplyModeWithRoute({
    ...fallbackInstantAnalyzeResult(trimmed, options.priorTurns),
    category: detected.category,
    action: detected.action,
  })
  const analyze = applyRouteHeuristics(trimmed, base, {
    hasVisionAttachment: options.hasVisionAttachment,
    hasDocumentFileAttachment: options.hasDocumentFileAttachment,
    priorTurns: options.priorTurns,
  })

  return resolveInstantRouteOverrides(analyze, trimmed, {
    composerRouteLocked: false,
    priorTurns: options.priorTurns,
    hasDocumentFileAttachment: options.hasDocumentFileAttachment,
  })
}

export function resolveThinkingMediaRouteFromInstantAnalyze(
  analyze: InstantAnalyzeResult,
  userMessage: string,
  options: {
    composerRouteLocked?: boolean
    priorTurns?: ReadonlyArray<ImageSearchPriorTurn>
    hasDocumentFileAttachment?: boolean
  },
): InstantRouteOverrides {
  return resolveInstantRouteOverrides(analyze, userMessage, {
    composerRouteLocked: options.composerRouteLocked === true,
    priorTurns: options.priorTurns,
    hasDocumentFileAttachment: options.hasDocumentFileAttachment,
  })
}

export function thinkingMediaRouteOverridesActive(route: InstantRouteOverrides): boolean {
  return (
    route.wantsWord ||
    route.wantsPdf ||
    route.wantsExcel ||
    route.wantsChart ||
    route.wantsDiagram ||
    route.imageGenEmpty ||
    Boolean(route.imageGenPrompt) ||
    Boolean(route.imageSearchQuery)
  )
}
