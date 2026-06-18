export const OPENAI_PROMPT_CACHE_KEY_THINKING_RICH_SHARED =
  'straton-thinking-rich-openai-v2' as const

export {
  buildThinkingRichOpenAiCachedKernelEdge,
  buildThinkingRichOpenAiDraftStepPromptEdge,
  buildThinkingRichOpenAiReviewStepPromptEdge,
} from './thinkingRichOpenAiKernelEdge.ts'
