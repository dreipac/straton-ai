import { useCallback, useEffect, useRef, useState } from 'react'
import checkIcon from '../../../assets/icons/check.svg'
import { ContentBottomSheet, type ContentBottomSheetHandle } from '../../../components/ui/bottom-sheet/ContentBottomSheet'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { ModalHeader } from '../../../components/ui/modal/ModalHeader'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { glassPillTouchClass, useGlassPillTouchFeedback } from '../../../hooks/useGlassPillTouchFeedback'
import { useAuth } from '../../auth/context/useAuth'
import { useIsMobileViewport } from '../../../hooks/useIsMobileViewport'
import {
  listUnseenFeedbackResolutions,
  markFeedbackResolutionSeen,
  type UnseenFeedbackResolution,
} from '../services/feedback.persistence'

function NoticeContent({
  item,
  onAcknowledge,
  isBusy,
  enableTapFeedback,
}: {
  item: UnseenFeedbackResolution
  onAcknowledge: () => void
  isBusy: boolean
  enableTapFeedback: boolean
}) {
  const okTouch = useGlassPillTouchFeedback({ cancelOnVerticalDrag: true })

  function handleOkClick() {
    if (enableTapFeedback && okTouch.consumeScrollGestureClick()) {
      return
    }
    onAcknowledge()
  }

  return (
    <div className="feedback-resolution-notice-body">
      <div className="feedback-resolution-notice-row">
        <img className="feedback-resolution-notice-icon" src={checkIcon} alt="" aria-hidden="true" />
        <div className="feedback-resolution-notice-copy">
          <p className="feedback-resolution-notice-id">
            <span className="feedback-resolution-notice-id-label">Feedback-ID</span>
            <span className="feedback-resolution-notice-id-value">{item.display_id}</span>
          </p>
          <p className="feedback-resolution-notice-message">{item.resolution_message}</p>
        </div>
      </div>
      <PrimaryButton
        type="button"
        className={
          enableTapFeedback
            ? glassPillTouchClass(okTouch, 'feedback-resolution-notice-ok')
            : 'feedback-resolution-notice-ok'
        }
        disabled={isBusy}
        {...(enableTapFeedback ? okTouch.touchHandlers : {})}
        onClick={handleOkClick}
      >
        {isBusy ? 'Bitte warten…' : 'Verstanden'}
      </PrimaryButton>
    </div>
  )
}

export function FeedbackResolutionNoticeModal() {
  const { user, isLoading } = useAuth()
  const isMobileUi = useIsMobileViewport()
  const sheetRef = useRef<ContentBottomSheetHandle | null>(null)
  const [queue, setQueue] = useState<UnseenFeedbackResolution[]>([])
  const [displayItem, setDisplayItem] = useState<UnseenFeedbackResolution | null>(null)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [isAcknowledging, setIsAcknowledging] = useState(false)

  const refreshQueue = useCallback(async () => {
    if (!user) {
      setQueue([])
      return
    }
    try {
      const items = await listUnseenFeedbackResolutions()
      setQueue(items)
    } catch {
      /* stillig — Hinweis ist optional */
    }
  }, [user])

  useEffect(() => {
    if (isLoading || !user) {
      return
    }
    void refreshQueue()
    const onFocus = () => {
      void refreshQueue()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
    }
  }, [isLoading, user, refreshQueue])

  useEffect(() => {
    if (!isMobileUi || !queue[0] || mobileSheetOpen || displayItem) {
      return
    }
    setDisplayItem(queue[0])
    setMobileSheetOpen(true)
  }, [queue, isMobileUi, mobileSheetOpen, displayItem])

  const showDesktopModal = !isMobileUi && Boolean(queue[0])
  const desktopItem = queue[0] ?? null

  async function acknowledgeFeedback(item: UnseenFeedbackResolution) {
    setIsAcknowledging(true)
    try {
      await markFeedbackResolutionSeen(item.id)
      setQueue((prev) => prev.filter((entry) => entry.id !== item.id))
    } catch {
      /* bei Fehler Dialog offen lassen */
    } finally {
      setIsAcknowledging(false)
    }
  }

  async function handleMobileAcknowledge() {
    if (!displayItem || isAcknowledging) {
      return
    }
    setIsAcknowledging(true)
    try {
      await markFeedbackResolutionSeen(displayItem.id)
      setQueue((prev) => prev.filter((entry) => entry.id !== displayItem.id))
      sheetRef.current?.requestClose()
    } catch {
      setIsAcknowledging(false)
    }
  }

  function handleMobileSheetExitComplete() {
    setDisplayItem(null)
    setMobileSheetOpen(false)
    setIsAcknowledging(false)
  }

  if (isMobileUi) {
    if (!displayItem || !mobileSheetOpen) {
      return null
    }

    return (
      <ContentBottomSheet
        ref={sheetRef}
        open={mobileSheetOpen}
        onExitComplete={handleMobileSheetExitComplete}
        title="Dein Feedback wurde bearbeitet"
        showCloseButton={false}
        closeOnBackdrop={false}
        allowEscape={false}
        adaptVisualViewport
        panelClassName="feedback-resolution-notice-sheet-panel"
        bodyClassName="feedback-resolution-notice-sheet-body"
      >
        <NoticeContent
          item={displayItem}
          onAcknowledge={handleMobileAcknowledge}
          isBusy={isAcknowledging}
          enableTapFeedback
        />
      </ContentBottomSheet>
    )
  }

  if (!showDesktopModal || !desktopItem) {
    return null
  }

  return (
    <ModalShell isOpen={true} closeOnOverlayClick={false}>
      <section
        className="rename-modal feedback-resolution-notice-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Feedback bearbeitet"
      >
        <ModalHeader
          title="Dein Feedback wurde bearbeitet"
          headingLevel="h3"
          className="rename-modal-header"
          onClose={() => {}}
          closeLabel="Dialog schließen"
          showCloseButton={false}
        />
        <NoticeContent
          item={desktopItem}
          onAcknowledge={() => void acknowledgeFeedback(desktopItem)}
          isBusy={isAcknowledging}
          enableTapFeedback={false}
        />
      </section>
    </ModalShell>
  )
}
