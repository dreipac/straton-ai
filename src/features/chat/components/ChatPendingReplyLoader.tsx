import { useEffect, useState } from 'react'
import type { ChatSendPhaseState } from '../constants/chatSendPhase'
import { getChatSendPhaseStatus } from '../constants/chatSendPhase'

type ChatPendingReplyLoaderProps = {
  statusLabel?: string
  sendPhase?: ChatSendPhaseState
}

type SubStepFrame = {
  key: string
  label: string
}

const SUB_STEP_HOLD_MS = 1300
const SUB_STEP_CROSSFADE_MS = 520

function useRotatingSubStep(
  subSteps: string[],
  resetKey: string,
): { current: SubStepFrame | null; previous: SubStepFrame | null } {
  const [current, setCurrent] = useState<SubStepFrame | null>(null)
  const [previous, setPrevious] = useState<SubStepFrame | null>(null)
  const subStepsKey = subSteps.join('\u0000')

  useEffect(() => {
    const steps = subStepsKey ? subStepsKey.split('\u0000') : []
    if (steps.length === 0) {
      setCurrent(null)
      setPrevious(null)
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

    const showStep = (label: string) => {
      const key = `${resetKey}-${tickCount}`
      tickCount += 1

      setCurrent((cur) => {
        if (cur) {
          setPrevious(cur)
        }
        return { key, label }
      })

      schedule(() => {
        setPrevious(null)
      }, SUB_STEP_CROSSFADE_MS)
    }

    const advance = () => {
      const idx = nextIndex % steps.length
      showStep(steps[idx]!)
      nextIndex += 1
    }

    advance()
    const loop = () => {
      advance()
      schedule(loop, SUB_STEP_HOLD_MS)
    }
    schedule(loop, SUB_STEP_HOLD_MS)

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [resetKey, subStepsKey])

  return { current, previous }
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
  const { current: currentSubStep, previous: previousSubStep } = useRotatingSubStep(subSteps, resetKey)
  const ariaLabel = [
    mainLabel,
    currentSubStep?.label,
    previousSubStep?.label,
  ]
    .filter(Boolean)
    .join('. ')

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
        {currentSubStep || previousSubStep ? (
          <div className="chat-pending-status-sub-slot">
            {previousSubStep ? (
              <p
                key={previousSubStep.key}
                className="chat-pending-status-sub-layer is-leaving"
              >
                <ChatPendingStatusShimmer label={previousSubStep.label} variant="sub" />
              </p>
            ) : null}
            {currentSubStep ? (
              <p
                key={currentSubStep.key}
                className={`chat-pending-status-sub-layer${
                  previousSubStep ? ' is-entering' : ' is-entering-first'
                }`}
              >
                <ChatPendingStatusShimmer label={currentSubStep.label} variant="sub" />
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
