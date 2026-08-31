import { useCallback, useEffect, useRef, useState } from 'react'
import correctIcon from '../../../assets/icons/correct.svg'
import { ModalHeader } from '../../../components/ui/modal/ModalHeader'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { useToast } from '../../../components/toast/ToastProvider'
import { useAuth } from '../../auth/context/useAuth'
import {
  listUnseenFeedbackResolutions,
  markFeedbackResolutionSeen,
  type UnseenFeedbackResolution,
} from '../services/feedback.persistence'

/** Wie lange die Abschluss-Meldung von selbst sichtbar bleibt, bevor sie ausblendet. */
const NOTICE_TOAST_VISIBLE_MS = 4000

/**
 * Zeigt für jedes bearbeitete, noch nicht gesehene Feedback eine kurze, nicht blockierende
 * Toast-Meldung oben zentriert (siehe `ToastProvider`/`toast.css`, `variant: 'notice'`). Klick auf
 * die Meldung öffnet ein schlichtes Detail-Modal mit dem gemeldeten Text und der Antwort; sowohl das
 * automatische Ausblenden als auch das Kreuz markieren das Feedback als gesehen.
 */
export function FeedbackResolutionNoticeModal() {
  const { user, isLoading } = useAuth()
  const toast = useToast()
  const [queue, setQueue] = useState<UnseenFeedbackResolution[]>([])
  const [detailItem, setDetailItem] = useState<UnseenFeedbackResolution | null>(null)
  /* Verhindert doppelte Toasts für dasselbe Feedback, solange `markFeedbackResolutionSeen` noch
     nicht durch ist (z. B. erneuter Poll bei Fenster-Fokus, während der vorige Toast noch offen ist). */
  const toastedIdsRef = useRef(new Set<string>())

  const refreshQueue = useCallback(async () => {
    if (!user) {
      setQueue([])
      return
    }
    try {
      const items = await listUnseenFeedbackResolutions()
      setQueue(items)
    } catch {
      /* still — Hinweis ist optional */
    }
  }, [user])

  useEffect(() => {
    if (isLoading || !user) {
      return
    }
    // `refreshQueue` ist async — das eigentliche `setQueue` läuft erst nach dem `await`, nicht
    // synchron im Effekt-Body. Gleiches, unveränderte Fetch-Muster wie zuvor in dieser Datei; der
    // Compiler-Regel-Fehlalarm hier hängt an einer Heuristik (verschwindet z. B., wenn `queue`
    // stärker verschachtelt gelesen wird) statt an echtem Fehlverhalten.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshQueue()
    const onFocus = () => {
      void refreshQueue()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
    }
  }, [isLoading, user, refreshQueue])

  const acknowledge = useCallback((item: UnseenFeedbackResolution) => {
    setQueue((prev) => prev.filter((entry) => entry.id !== item.id))
    void markFeedbackResolutionSeen(item.id).catch(() => {
      /* still — nächster Poll versucht es erneut, solange resolution_seen_at leer bleibt */
    })
  }, [])

  useEffect(() => {
    for (const item of queue) {
      if (toastedIdsRef.current.has(item.id)) {
        continue
      }
      toastedIdsRef.current.add(item.id)
      toast.push({
        variant: 'notice',
        icon: correctIcon,
        tone: 'success',
        title: `Problem behoben: ${item.display_id}`,
        subtitle: 'Klicke für mehr Details',
        position: 'top-center',
        visibleMs: NOTICE_TOAST_VISIBLE_MS,
        onClick: () => setDetailItem(item),
        onDismiss: () => {
          toastedIdsRef.current.delete(item.id)
          acknowledge(item)
        },
      })
    }
  }, [queue, acknowledge, toast])

  return (
    <ModalShell isOpen={detailItem !== null} onRequestClose={() => setDetailItem(null)}>
      {detailItem ? (
        <section
          className="rename-modal feedback-resolution-notice-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Feedback-Details"
        >
          <ModalHeader
            title={`Problem behoben: ${detailItem.display_id}`}
            headingLevel="h3"
            className="rename-modal-header"
            onClose={() => setDetailItem(null)}
            closeLabel="Dialog schließen"
          />
          <div className="feedback-resolution-detail-body">
            <p className="feedback-resolution-detail-label">Dein gemeldetes Feedback</p>
            <p className="feedback-resolution-detail-text">{detailItem.body}</p>
            <p className="feedback-resolution-detail-label">Antwort</p>
            <p className="feedback-resolution-detail-text">{detailItem.resolution_message}</p>
          </div>
        </section>
      ) : null}
    </ModalShell>
  )
}
