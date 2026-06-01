import { type RefObject } from 'react'
import { PrimaryButton } from '../../../../components/ui/buttons/PrimaryButton'
import {
  ContentBottomSheet,
  type ContentBottomSheetHandle,
} from '../../../../components/ui/bottom-sheet/ContentBottomSheet'
import { ModalShell } from '../../../../components/ui/modal/ModalShell'

type ChatBetaNoticeDialogProps = {
  isNarrowViewport: boolean
  isMounted: boolean
  isVisible: boolean
  logoSrc: string
  betaNoticeSheetRef: RefObject<ContentBottomSheetHandle | null>
  onClose: () => void
  onSheetExitComplete: () => void
}

export function ChatBetaNoticeDialog({
  isNarrowViewport,
  isMounted,
  isVisible,
  logoSrc,
  betaNoticeSheetRef,
  onClose,
  onSheetExitComplete,
}: ChatBetaNoticeDialogProps) {
  if (!isMounted) {
    return null
  }

  if (isNarrowViewport) {
    return (
      <ContentBottomSheet
        ref={betaNoticeSheetRef}
        open={isVisible}
        onExitComplete={() => void onSheetExitComplete()}
        title="Beta Version"
        closeOnBackdrop
        allowEscape
        showCloseButton={false}
        panelClassName="beta-notice-sheet-panel"
        bodyClassName="beta-notice-sheet-body-plain"
      >
        <p className="beta-notice-sheet-text">
          Du nutzt aktuell eine Beta-Version. Inhalte, Funktionen und Design können sich in den nächsten
          Updates noch ändern. Dein Feedback hilft uns sehr, Straton schneller und besser zu machen.
        </p>
        <div className="beta-notice-sheet-actions">
          <PrimaryButton type="button" className="beta-notice-sheet-submit" onClick={() => void onClose()}>
            Verstanden
          </PrimaryButton>
        </div>
      </ContentBottomSheet>
    )
  }

  return (
    <ModalShell isOpen={isVisible} onRequestClose={() => void onClose()}>
      <section className="rename-modal beta-notice-modal" role="dialog" aria-modal="true" aria-label="Beta Hinweis">
        <header className="beta-notice-header">
          <div className="beta-notice-brand">
            <img className="ui-icon chat-brand-logo beta-notice-logo" src={logoSrc} alt="" aria-hidden="true" />
            <h2>Straton</h2>
          </div>
          <button
            type="button"
            className="settings-close-button"
            onClick={() => void onClose()}
            aria-label="Beta Hinweis schließen"
          >
            <span className="ui-icon settings-close-icon" aria-hidden="true" />
          </button>
        </header>
        <h3 className="beta-notice-title">Beta Version</h3>
        <p className="beta-notice-text">
          Du nutzt aktuell eine Beta-Version. Inhalte, Funktionen und Design können sich in den nächsten Updates
          noch ändern. Dein Feedback hilft uns sehr, Straton schneller und besser zu machen.
        </p>
        <div className="rename-actions">
          <PrimaryButton type="button" onClick={() => void onClose()}>
            Verstanden
          </PrimaryButton>
        </div>
      </section>
    </ModalShell>
  )
}
