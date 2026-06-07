import { useEffect, useState } from 'react'
import type { ChatSendPhaseState } from '../constants/chatSendPhase'
import { getChatSendPhaseStatus } from '../constants/chatSendPhase'

type ChatPendingReplyLoaderProps = {
  statusLabel?: string
  sendPhase?: ChatSendPhaseState
}

type VisibleSubStep = {
  key: string
  label: string
  phase: 'active' | 'leaving'
}

const SUB_STEP_INTERVAL_MS = 1300
const SUB_STEP_FADE_MS = 380

function useAnimatedSubSteps(subSteps: string[], resetKey: string): VisibleSubStep[] {
  const [items, setItems] = useState<VisibleSubStep[]>([])
  const subStepsKey = subSteps.join('\u0000')

  useEffect(() => {
    const steps = subStepsKey ? subStepsKey.split('\u0000') : []
    if (steps.length === 0) {
      setItems([])
      return
    }

    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    let nextIndex = 0
    let tickCount = 0

    const schedule = (fn: () => void, ms: number) => {
      timers.push(
        setTimeout(() => {
          if (!cancelled) fn()
        }, ms),
      )
    }

    const addStep = () => {
      const idx = nextIndex % steps.length
      const key = `${resetKey}-${tickCount}`
      tickCount += 1

      setItems((prev) => {
        const withLeaving = prev.map((item) =>
          item.phase === 'active' ? { ...item, phase: 'leaving' as const } : item,
        )
        return [
          ...withLeaving,
          { key, label: steps[idx], phase: 'active' as const },
        ].slice(-3)
      })

      schedule(() => {
        setItems((prev) => prev.filter((item) => item.phase !== 'leaving'))
      }, SUB_STEP_FADE_MS)

      nextIndex += 1
    }

    addStep()
    const loop = () => {
      addStep()
      schedule(loop, SUB_STEP_INTERVAL_MS)
    }
    schedule(loop, SUB_STEP_INTERVAL_MS)

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [resetKey, subStepsKey])

  return items
}

function ChatPendingStatusShimmer({
  label,
  variant,
}: {
  label: string
  variant: 'main' | 'sub'
}) {
  return (
    <span
      className={`chat-pending-status-shimmer chat-pending-status-shimmer--${variant}`}
      aria-hidden="true"
    >
      {label}
    </span>
  )
}

/** Ladeanzeige während eine KI-Textantwort generiert wird (zwei Punkte im Halbkreis). */
export function ChatPendingReplyLoader({ statusLabel, sendPhase }: ChatPendingReplyLoaderProps) {
  const status =
    getChatSendPhaseStatus(sendPhase, statusLabel) ??
    (statusLabel?.trim() ? getChatSendPhaseStatus(null, statusLabel) : undefined)
  const mainLabel = status?.mainLabel ?? 'Antwort wird generiert'
  const subSteps = status?.subSteps ?? []
  const resetKey = sendPhase ?? mainLabel
  const visibleSubSteps = useAnimatedSubSteps(subSteps, resetKey)
  const ariaLabel = [mainLabel, ...visibleSubSteps.map((step) => step.label)].join('. ')

  return (
    <div className="chat-pending-orbit-wrap">
      <div className="chat-pending-orbit" role="status" aria-label={ariaLabel}>
        <div className="chat-pending-orbit-swing" aria-hidden="true">
          <span className="chat-pending-orbit-dot chat-pending-orbit-dot--large" />
          <span className="chat-pending-orbit-dot chat-pending-orbit-dot--small" />
        </div>
      </div>
      <div className="chat-pending-status-stack" role="status" aria-live="polite">
        <p className="chat-pending-status chat-pending-status-main">
          <ChatPendingStatusShimmer label={mainLabel} variant="main" />
          <span className="chat-pending-status-fallback">{mainLabel}</span>
        </p>
        {visibleSubSteps.length > 0 ? (
          <ul className="chat-pending-status-sub-list">
            {visibleSubSteps.map((step) => (
              <li
                key={step.key}
                className={`chat-pending-status-sub-item${
                  step.phase === 'leaving' ? ' is-leaving' : ''
                }`}
              >
                <ChatPendingStatusShimmer label={step.label} variant="sub" />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
