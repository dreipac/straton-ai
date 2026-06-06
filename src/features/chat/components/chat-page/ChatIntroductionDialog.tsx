import { type RefObject, useRef } from 'react'
import { PrimaryButton } from '../../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../../components/ui/buttons/SecondaryButton'
import {
  ContentBottomSheet,
  type ContentBottomSheetHandle,
} from '../../../../components/ui/bottom-sheet/ContentBottomSheet'
import { ModalShell } from '../../../../components/ui/modal/ModalShell'
import { glassPillTouchClass, useGlassPillTouchFeedback } from '../../../../hooks/useGlassPillTouchFeedback'
import { useBottomSheetPanelFlip } from '../../../../hooks/useBottomSheetPanelFlip'
import { USER_INTRODUCTION_SUBTITLE } from '../../../auth/constants/userIntroduction'
import { IntroductionSectionHeader } from '../../../settings/components/IntroductionSectionHeader'
import {
  IntroductionEditor,
  introductionValueFromProfile,
  type IntroductionEditorValue,
} from '../../../settings/components/IntroductionEditor'

type ChatIntroductionDialogProps = {
  isNarrowViewport: boolean
  isMounted: boolean
  isVisible: boolean
  introductionSheetRef: RefObject<ContentBottomSheetHandle | null>
  draft: IntroductionEditorValue
  onDraftChange: (value: IntroductionEditorValue) => void
  isSaving: boolean
  onSave: () => void | Promise<void>
  onLater: () => void | Promise<void>
  onSheetExitComplete: () => void
}

export function ChatIntroductionDialog({
  isNarrowViewport,
  isMounted,
  isVisible,
  introductionSheetRef,
  draft,
  onDraftChange,
  isSaving,
  onSave,
  onLater,
  onSheetExitComplete,
}: ChatIntroductionDialogProps) {
  const saveTouch = useGlassPillTouchFeedback({ cancelOnVerticalDrag: true })
  const laterTouch = useGlassPillTouchFeedback({ cancelOnVerticalDrag: true })
  const introductionPanelRef = useRef<HTMLDivElement | null>(null)

  useBottomSheetPanelFlip(introductionPanelRef, {
    enabled: isNarrowViewport && isVisible,
    resizeKey: draft.mode,
  })

  if (!isMounted) {
    return null
  }

  const editor = (
    <IntroductionEditor
      value={draft}
      onChange={onDraftChange}
      isSaving={isSaving}
      compact
      showActions={false}
      showAccountHint={false}
      saveLabel="Speichern & weiter"
      onSave={onSave}
      onLater={onLater}
    />
  )

  if (isNarrowViewport) {
    function handleSaveClick() {
      if (saveTouch.consumeScrollGestureClick()) {
        return
      }
      void onSave()
    }

    function handleLaterClick() {
      if (laterTouch.consumeScrollGestureClick()) {
        return
      }
      void onLater()
    }

    return (
      <ContentBottomSheet
        ref={introductionSheetRef}
        panelRef={introductionPanelRef}
        open={isVisible}
        onExitComplete={() => void onSheetExitComplete()}
        title="Einführung"
        closeOnBackdrop={false}
        allowEscape={false}
        showCloseButton={false}
        panelClassName={`introduction-sheet-panel${draft.mode === 'questionnaire' ? ' introduction-sheet-panel--questionnaire' : ''}`}
        bodyClassName="introduction-sheet-body-plain"
      >
        <p className="introduction-sheet-subtitle">{USER_INTRODUCTION_SUBTITLE}</p>
        <div className="introduction-modal-body introduction-modal-body--sheet">{editor}</div>
        <div className="introduction-sheet-actions">
          <PrimaryButton
            type="button"
            className={glassPillTouchClass(saveTouch, 'introduction-sheet-action')}
            disabled={isSaving}
            {...saveTouch.touchHandlers}
            onClick={handleSaveClick}
          >
            {isSaving ? 'Speichert…' : 'Speichern & weiter'}
          </PrimaryButton>
          <SecondaryButton
            type="button"
            className={glassPillTouchClass(laterTouch, 'introduction-sheet-action')}
            disabled={isSaving}
            {...laterTouch.touchHandlers}
            onClick={handleLaterClick}
          >
            Später
          </SecondaryButton>
        </div>
      </ContentBottomSheet>
    )
  }

  return (
    <ModalShell isOpen={isVisible} onRequestClose={() => {}}>
      <section
        className="rename-modal introduction-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Einführung"
      >
        <IntroductionSectionHeader />
        <div className="introduction-modal-body">{editor}</div>
        <div className="introduction-modal-footer">
          <SecondaryButton type="button" disabled={isSaving} onClick={() => void onLater()}>
            Später
          </SecondaryButton>
          <PrimaryButton type="button" disabled={isSaving} onClick={() => void onSave()}>
            {isSaving ? 'Speichert…' : 'Speichern & weiter'}
          </PrimaryButton>
        </div>
      </section>
    </ModalShell>
  )
}

export { introductionValueFromProfile }
