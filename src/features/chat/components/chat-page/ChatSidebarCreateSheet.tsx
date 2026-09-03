import { useEffect, useRef, useState } from 'react'
import { ContentBottomSheet, type ContentBottomSheetHandle } from '../../../../components/ui/bottom-sheet/ContentBottomSheet'
import type { LearnGenerationMode } from '../../../learn/services/learn.persistence'

type ChatSidebarCreateSheetProps = {
  open: boolean
  onClose: () => void
  showLearningPathsInSidebar: boolean
  isLearnPathCreateDisabled: boolean
  /** Superadmin: Auswahl KI vs. Platzhalter (Test ohne API-Kosten) beim Erstellen eines Lernpfads. */
  canChooseCreatePathMode: boolean
  onCreateLearningPath: (generationMode?: LearnGenerationMode) => void
  onCreateNewChat: () => void
  onShowLearnUnavailable: () => void
}

/**
 * Sheet für die mobile "+"-Pill in `ChatPageSidebar`: zwei Buttons, "Lernpfad" (primary) und
 * "Chat". Bewusst NICHT als Kind von `.chat-sidebar` gerendert (siehe Aufrufstelle in
 * `ChatPage.tsx`) — die Sidebar trägt auf Mobile ein `transform` für die Slide-Animation, das sie
 * zum Containing Block für `position: fixed`-Nachfahren macht und sie auf ihre eigene, per
 * `overflow: hidden` beschnittene Box zwingt. Ein hier verschachteltes Sheet würde dadurch nur
 * innerhalb der Sidebar sichtbar sein statt über dem ganzen Bildschirm.
 */
export function ChatSidebarCreateSheet({
  open,
  onClose,
  showLearningPathsInSidebar,
  isLearnPathCreateDisabled,
  canChooseCreatePathMode,
  onCreateLearningPath,
  onCreateNewChat,
  onShowLearnUnavailable,
}: ChatSidebarCreateSheetProps) {
  const [isCreatePathModeMenuOpen, setIsCreatePathModeMenuOpen] = useState(false)
  const sheetRef = useRef<ContentBottomSheetHandle | null>(null)

  useEffect(() => {
    if (!open) {
      setIsCreatePathModeMenuOpen(false)
    }
  }, [open])

  function handleLearnPathClick() {
    if (isLearnPathCreateDisabled) {
      onShowLearnUnavailable()
      return
    }
    if (canChooseCreatePathMode) {
      setIsCreatePathModeMenuOpen((prev) => !prev)
      return
    }
    sheetRef.current?.requestClose()
    onCreateLearningPath('ai')
  }

  function handleChooseMode(mode: LearnGenerationMode) {
    setIsCreatePathModeMenuOpen(false)
    sheetRef.current?.requestClose()
    onCreateLearningPath(mode)
  }

  function handleChatClick() {
    sheetRef.current?.requestClose()
    onCreateNewChat()
  }

  return (
    <ContentBottomSheet
      ref={sheetRef}
      open={open}
      onExitComplete={onClose}
      title="Neu erstellen"
      bodyClassName="chat-sidebar-create-sheet-body"
    >
      {showLearningPathsInSidebar ? (
        <div className="learn-new-path-wrap learn-new-path-wrap--block">
          <button
            type="button"
            className={`chat-sidebar-create-card chat-sidebar-create-card--primary${
              isLearnPathCreateDisabled ? ' is-disabled' : ''
            }`}
            aria-disabled={isLearnPathCreateDisabled}
            aria-expanded={canChooseCreatePathMode ? isCreatePathModeMenuOpen : undefined}
            onClick={handleLearnPathClick}
          >
            <span className="chat-sidebar-create-card-icon chat-sidebar-create-card-icon--learn" aria-hidden="true" />
            <span className="chat-sidebar-create-card-label">Lernpfad</span>
          </button>
          {isCreatePathModeMenuOpen ? (
            <>
              <div
                className="learn-create-mode-backdrop"
                onClick={() => setIsCreatePathModeMenuOpen(false)}
                aria-hidden="true"
              />
              <div className="learn-create-mode-menu" role="menu" aria-label="Lernpfad-Erstellmodus">
                <button
                  type="button"
                  className="learn-create-mode-option"
                  role="menuitem"
                  onClick={() => handleChooseMode('ai')}
                >
                  <span className="learn-create-mode-option-title">KI</span>
                  <span className="learn-create-mode-option-meta">Normaler Lernpfad mit KI-Generierung</span>
                </button>
                <button
                  type="button"
                  className="learn-create-mode-option"
                  role="menuitem"
                  onClick={() => handleChooseMode('placeholder')}
                >
                  <span className="learn-create-mode-option-title">Platzhalter</span>
                  <span className="learn-create-mode-option-meta">Testablauf ohne API-Kosten</span>
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      <button type="button" className="chat-sidebar-create-card" onClick={handleChatClick}>
        <span className="chat-sidebar-create-card-icon chat-sidebar-create-card-icon--chat" aria-hidden="true" />
        <span className="chat-sidebar-create-card-label">Chat</span>
      </button>
    </ContentBottomSheet>
  )
}
