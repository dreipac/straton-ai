import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import infoIcon from '../../../assets/icons/info.svg'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'

type ChatOnboardingTourProps = {
  newChatButtonRef: React.RefObject<HTMLElement | null>
  learnButtonRef: React.RefObject<HTMLElement | null>
  active: boolean
  onComplete: () => void | Promise<void>
}

const STEPS = [
  {
    title: 'Neuer Chat',
    body: 'Hier startest du jederzeit ein neues Gespräch mit Straton — pro Thema oder Aufgabe ein eigener Chat.',
    action: 'Weiter',
  },
  {
    title: 'Lernpfade',
    body: 'Hier öffnest du den Lernbereich mit Materialien, Übungen und deinen Lernpfaden.',
    action: 'Fertig',
  },
] as const

export function ChatOnboardingTour({
  newChatButtonRef,
  learnButtonRef,
  active,
  onComplete,
}: ChatOnboardingTourProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [popoverStyle, setPopoverStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const pendingCompleteRef = useRef(false)

  const getTargetEl = useCallback(() => {
    return stepIndex === 0 ? newChatButtonRef.current : learnButtonRef.current
  }, [stepIndex, newChatButtonRef, learnButtonRef])

  const updateGeometry = useCallback(() => {
    if (!active) {
      return
    }
    const el = getTargetEl()
    if (!el) {
      setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    setRect(r)

    const popoverWidth = Math.min(21.5 * 16, window.innerWidth - 24)
    let left = r.left + r.width / 2 - popoverWidth / 2
    left = Math.max(12, Math.min(left, window.innerWidth - popoverWidth - 12))

    const estimatedPopoverH = 200
    const gap = 12
    let top = r.bottom + gap
    if (top + estimatedPopoverH > window.innerHeight - 12) {
      top = r.top - gap - estimatedPopoverH
    }
    top = Math.max(12, Math.min(top, window.innerHeight - estimatedPopoverH - 12))
    setPopoverStyle({ top, left })
  }, [active, getTargetEl])

  useLayoutEffect(() => {
    if (!active) {
      return
    }
    const el = getTargetEl()
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active, stepIndex, getTargetEl])

  useLayoutEffect(() => {
    if (!active) {
      return
    }
    let raf = 0
    updateGeometry()
    raf = window.requestAnimationFrame(() => {
      updateGeometry()
    })
    const onWin = () => {
      updateGeometry()
    }
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    const el = getTargetEl()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => updateGeometry()) : null
    if (el && ro) {
      ro.observe(el)
    }
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
      ro?.disconnect()
    }
  }, [active, stepIndex, updateGeometry, getTargetEl])

  useEffect(() => {
    if (!active) {
      setStepIndex(0)
      setRect(null)
      pendingCompleteRef.current = false
    }
  }, [active])

  async function handlePrimary() {
    if (stepIndex === 0) {
      setStepIndex(1)
      return
    }
    if (pendingCompleteRef.current) {
      return
    }
    pendingCompleteRef.current = true
    try {
      await onComplete()
    } finally {
      pendingCompleteRef.current = false
    }
  }

  if (!active) {
    return null
  }

  if (!rect) {
    return createPortal(<div className="chat-onboarding-tour-root" aria-hidden="true" />, document.body)
  }

  const pad = 4
  const spotlightTop = rect.top - pad
  const spotlightLeft = rect.left - pad
  const spotlightW = rect.width + pad * 2
  const spotlightH = rect.height + pad * 2
  const radius = 12

  const bottomStart = spotlightTop + spotlightH
  const rightStart = spotlightLeft + spotlightW

  const step = STEPS[stepIndex]

  return createPortal(
    <div
      className="chat-onboarding-tour-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-onboarding-title"
    >
      <div
        className="chat-onboarding-dim chat-onboarding-dim-top"
        style={{ height: Math.max(0, spotlightTop), width: '100%' }}
        aria-hidden="true"
      />
      <div
        className="chat-onboarding-dim chat-onboarding-dim-bottom"
        style={{
          top: bottomStart,
          height: `calc(100vh - ${bottomStart}px)`,
          width: '100%',
        }}
        aria-hidden="true"
      />
      <div
        className="chat-onboarding-dim chat-onboarding-dim-left"
        style={{
          top: spotlightTop,
          left: 0,
          width: Math.max(0, spotlightLeft),
          height: spotlightH,
        }}
        aria-hidden="true"
      />
      <div
        className="chat-onboarding-dim chat-onboarding-dim-right"
        style={{
          top: spotlightTop,
          left: rightStart,
          width: `calc(100vw - ${rightStart}px)`,
          height: spotlightH,
        }}
        aria-hidden="true"
      />
      <div
        className="chat-onboarding-spotlight-ring"
        style={{
          top: spotlightTop,
          left: spotlightLeft,
          width: spotlightW,
          height: spotlightH,
          borderRadius: radius,
        }}
        aria-hidden="true"
      />
      <div
        className="chat-onboarding-popover learn-chapter-hint-popover-card"
        style={{
          position: 'fixed',
          top: popoverStyle.top,
          left: popoverStyle.left,
          width: 'min(21.5rem, calc(100dvw - 1.5rem))',
          zIndex: 10002,
        }}
      >
        <div className="learn-chapter-hint-popover-body">
          <div className="learn-chapter-hint-popover-icon-badge" aria-hidden="true">
            <img src={infoIcon} alt="" width={18} height={18} />
          </div>
          <div className="chat-onboarding-popover-copy">
            <h3 id="chat-onboarding-title" className="chat-onboarding-title">
              {step.title}
            </h3>
            <p className="learn-chapter-hint-popover-text">{step.body}</p>
            <div className="chat-onboarding-actions">
              <PrimaryButton type="button" onClick={() => void handlePrimary()}>
                {step.action}
              </PrimaryButton>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
