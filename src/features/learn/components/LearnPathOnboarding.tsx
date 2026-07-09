import { useEffect, useState } from 'react'

const ONBOARDING_TITLE = 'Lernpfad wurde erstellt'
const TYPE_INTERVAL_MS = 55
/** Automatisches Ausblenden: Tippdauer (~1.3s) + Haken-Animation + Lesezeit. */
const AUTO_CLOSE_MS = 5600

export type LearnPathOnboardingProps = {
  onClose: () => void
}

/** Kurzes Onboarding nach der Material-Analyse: dunkles Overlay über dem Lernbereich,
 *  Titel mit Tipp-Animation, danach animierter grüner Haken-Kreis. Klick schließt sofort. */
export function LearnPathOnboarding({ onClose }: LearnPathOnboardingProps) {
  const [typedLength, setTypedLength] = useState(0)
  const isTypingDone = typedLength >= ONBOARDING_TITLE.length

  useEffect(() => {
    if (isTypingDone) {
      return
    }
    const timer = window.setInterval(() => {
      setTypedLength((current) => Math.min(current + 1, ONBOARDING_TITLE.length))
    }, TYPE_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [isTypingDone])

  useEffect(() => {
    const timer = window.setTimeout(onClose, AUTO_CLOSE_MS)
    return () => window.clearTimeout(timer)
  }, [onClose])

  return (
    <div className="learn-path-onboarding" role="status" aria-live="polite" onClick={onClose}>
      <div className="learn-path-onboarding-content">
        <h2 className="learn-path-onboarding-title">
          {ONBOARDING_TITLE.slice(0, typedLength)}
          <span
            className={`learn-path-onboarding-caret${isTypingDone ? ' is-done' : ''}`}
            aria-hidden="true"
          />
        </h2>
        <div
          className={`learn-path-onboarding-check${isTypingDone ? ' is-visible' : ''}`}
          aria-hidden="true"
        >
          <svg viewBox="0 0 56 56" width="88" height="88">
            <circle className="learn-path-onboarding-check-circle" cx="28" cy="28" r="25" />
            <polyline className="learn-path-onboarding-check-mark" points="17 29 25 37 39 21" />
          </svg>
        </div>
      </div>
    </div>
  )
}
