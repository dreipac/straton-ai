import { useMemo } from 'react'
import type { ChatMessage } from '../types'
import { DEFAULT_MAIN_CHAT_CONTEXT_MAX_TOKENS } from '../constants/mainChatContext'
import { estimateMainChatContextUsage } from '../services/chat.service'

type ChatContextUsageRingProps = {
  messages: ChatMessage[]
  maxTokens?: number | null
  pendingVisionImages?: number
  className?: string
}

const RING_SIZE = 30
const STROKE = 3
const R = (RING_SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * R

function ringFillColor(percent: number): string {
  if (percent >= 90) {
    return 'var(--color-danger, #ef4444)'
  }
  if (percent >= 70) {
    return 'var(--color-accent, #6366f1)'
  }
  return 'color-mix(in srgb, var(--color-accent, #6366f1) 72%, #94a3b8)'
}

export function ChatContextUsageRing({
  messages,
  maxTokens,
  pendingVisionImages = 0,
  className = '',
}: ChatContextUsageRingProps) {
  const usage = useMemo(
    () =>
      estimateMainChatContextUsage(messages, {
        maxTokens: maxTokens === undefined ? DEFAULT_MAIN_CHAT_CONTEXT_MAX_TOKENS : maxTokens,
        pendingVisionImages,
      }),
    [messages, maxTokens, pendingVisionImages],
  )

  const percentValue =
    usage.percent !== null ? Math.min(100, Math.max(0, usage.percent)) : null
  const fillLength =
    percentValue !== null ? (CIRCUMFERENCE * percentValue) / 100 : 0
  const gapLength = CIRCUMFERENCE - fillLength

  const titleParts = [
    usage.maxTokens !== null
      ? `Kontext: ca. ${usage.usedTokens.toLocaleString('de-DE')} / ${usage.maxTokens.toLocaleString('de-DE')} Tokens (${percentValue ?? '–'}%)`
      : `Kontext: ca. ${usage.usedTokens.toLocaleString('de-DE')} Tokens`,
    `${usage.messageCountInContext} von ${usage.totalMessageCount} Nachrichten`,
  ]
  if (usage.visionImagesInContext > 0) {
    titleParts.push(
      `${usage.visionImagesInContext} Bild${usage.visionImagesInContext > 1 ? 'er' : ''} im Kontext`,
    )
  }
  if (usage.ragOverflowActive) {
    titleParts.push('RAG-Überlauf aktiv (ab 200 Nachrichten)')
  }

  const ariaLabel =
    percentValue !== null
      ? `Kontext zu ${percentValue} Prozent genutzt`
      : 'Kontext-Nutzung'

  return (
    <span
      className={['chat-context-usage-ring', className].filter(Boolean).join(' ')}
      title={titleParts.join(' · ')}
      role="img"
      aria-label={ariaLabel}
    >
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        aria-hidden="true"
        className="chat-context-usage-ring__svg"
      >
        <circle
          className="chat-context-usage-ring__track"
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
        />
        {percentValue !== null && percentValue > 0 ? (
          <circle
            className="chat-context-usage-ring__fill"
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={R}
            fill="none"
            strokeWidth={STROKE}
            stroke={ringFillColor(percentValue)}
            strokeLinecap="round"
            strokeDasharray={`${fillLength} ${gapLength}`}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        ) : null}
      </svg>
    </span>
  )
}
