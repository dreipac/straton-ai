import { useState, type RefObject, type MouseEvent as ReactMouseEvent } from 'react'
import type { LearnGenerationMode, LearningPathSummary } from '../../learn/services/learn.persistence'
import { getDisplayPathTitle, isPendingLearningPathId } from '../../learn/utils/learnPageHelpers'
import { ChatSidebarSectionHeader } from './ChatSidebarSectionHeader'

type ChatLearningPathsSidebarSectionProps = {
  sectionRef?: RefObject<HTMLDivElement | null>
  tourHighlight?: boolean
  learningPaths: LearningPathSummary[]
  activePathId: string | null
  isCreateDisabled: boolean
  onCreateLearningPath: (generationMode?: LearnGenerationMode) => void
  onSelectLearningPath: (pathId: string) => void
  onCreateDisabledClick: () => void
  openMenuPathId?: string | null
  onContextMenu?: (event: React.MouseEvent, pathId: string) => void
  /** Superadmin: Popover mit KI vs. Platzhalter (Test ohne API-Kosten) beim Erstellen. */
  canChoosePlaceholder?: boolean
}

export function ChatLearningPathsSidebarSection({
  sectionRef,
  tourHighlight = false,
  learningPaths,
  activePathId,
  isCreateDisabled,
  onCreateLearningPath,
  onSelectLearningPath,
  onCreateDisabledClick,
  openMenuPathId = null,
  onContextMenu,
  canChoosePlaceholder = false,
}: ChatLearningPathsSidebarSectionProps) {
  const [isSectionExpanded, setIsSectionExpanded] = useState(true)
  const [isCreateModeMenuOpen, setIsCreateModeMenuOpen] = useState(false)

  const handleChooseCreateMode = (mode: LearnGenerationMode) => {
    setIsCreateModeMenuOpen(false)
    onCreateLearningPath(mode)
  }

  const createButton = (
    <span className="learn-new-path-wrap">
      <button
        type="button"
        className="chat-folder-create-btn"
        aria-disabled={isCreateDisabled}
        aria-expanded={canChoosePlaceholder ? isCreateModeMenuOpen : undefined}
        onClick={() => {
          if (isCreateDisabled) {
            onCreateDisabledClick()
            return
          }
          if (canChoosePlaceholder) {
            setIsCreateModeMenuOpen((prev) => !prev)
            return
          }
          onCreateLearningPath('ai')
        }}
        aria-label="Neuer Lernpfad"
      >
        +
      </button>
      {isCreateModeMenuOpen ? (
        <>
          <span
            className="learn-create-mode-backdrop"
            onClick={() => setIsCreateModeMenuOpen(false)}
            aria-hidden="true"
          />
          <span className="learn-create-mode-menu learn-create-mode-menu--right" role="menu" aria-label="Lernpfad-Erstellmodus">
            <button
              type="button"
              className="learn-create-mode-option"
              role="menuitem"
              onClick={() => handleChooseCreateMode('ai')}
            >
              <span className="learn-create-mode-option-title">KI</span>
              <span className="learn-create-mode-option-meta">Normaler Lernpfad mit KI-Generierung</span>
            </button>
            <button
              type="button"
              className="learn-create-mode-option"
              role="menuitem"
              onClick={() => handleChooseCreateMode('placeholder')}
            >
              <span className="learn-create-mode-option-title">Platzhalter</span>
              <span className="learn-create-mode-option-meta">Testablauf ohne API-Kosten</span>
            </button>
          </span>
        </>
      ) : null}
    </span>
  )

  return (
    <div
      ref={sectionRef}
      className={`chat-learning-paths-sidebar-section${tourHighlight ? ' chat-onboarding-tour-block' : ''}`}
    >
      <ChatSidebarSectionHeader
        title="Lernpfade"
        isExpanded={isSectionExpanded}
        onToggle={() => setIsSectionExpanded((prev) => !prev)}
        trailing={createButton}
      />
      {isSectionExpanded ? (
        learningPaths.length === 0 ? (
          <p className="chat-folder-empty-hint">Noch keine Lernpfade. Lege einen an.</p>
        ) : (
          <div className="chat-learning-paths-list">
            {learningPaths.map((path) => (
              <div
                key={path.sidebarListKey ?? path.id}
                className={[
                  'chat-thread-row',
                  path.id === activePathId ? 'is-active' : '',
                  path.id === openMenuPathId ? 'has-open-menu' : '',
                  path.isPending ? 'is-pending' : '',
                  path.isRemoving ? 'is-removing' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onContextMenu={
                  onContextMenu
                    ? (event: ReactMouseEvent) => {
                        onContextMenu(event, path.id)
                      }
                    : undefined
                }
              >
                <button
                  type="button"
                  className={`chat-thread-item${path.id === activePathId ? ' is-active' : ''}`}
                  disabled={isPendingLearningPathId(path.id) || path.isRemoving}
                  onClick={() => onSelectLearningPath(path.id)}
                >
                  <span className="chat-thread-title">{getDisplayPathTitle(path.title)}</span>
                  {path.generationMode === 'placeholder' ? (
                    <span className="learn-path-test-badge" aria-label="Platzhalter-Lernpfad (Test)">
                      Test
                    </span>
                  ) : null}
                </button>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}
