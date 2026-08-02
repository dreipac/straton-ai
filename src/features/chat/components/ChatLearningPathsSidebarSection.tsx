import { useState, type CSSProperties, type RefObject, type MouseEvent as ReactMouseEvent } from 'react'
import type { LearnGenerationMode, LearningPathSummary } from '../../learn/services/learn.persistence'
import { getDisplayPathTitle, isPendingLearningPathId } from '../../learn/utils/learnPageHelpers'
import { ChatSidebarSectionHeader } from './ChatSidebarSectionHeader'
import { LearningPathProgressRing } from './LearningPathProgressRing'

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
    <span className="learn-new-path-wrap learn-new-path-wrap--block">
      <button
        type="button"
        className="chat-sidebar-dashed-create-btn"
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
        Neuer Lernpfad
      </button>
      {isCreateModeMenuOpen ? (
        <>
          <span
            className="learn-create-mode-backdrop"
            onClick={() => setIsCreateModeMenuOpen(false)}
            aria-hidden="true"
          />
          <span className="learn-create-mode-menu" role="menu" aria-label="Lernpfad-Erstellmodus">
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
      />
      {isSectionExpanded ? (
        <>
          {createButton}
          {learningPaths.length === 0 ? (
            <p className="chat-folder-empty-hint">Noch keine Lernpfade. Lege einen an.</p>
          ) : (
            <div className="chat-learning-paths-list">
              {learningPaths.map((path, index) => {
                const totalTopics = path.totalTopicsCount ?? 0
                const masteredTopics = path.masteredTopicsCount ?? 0
                const percent = totalTopics > 0 ? (masteredTopics / totalTopics) * 100 : 0
                return (
                  <div
                    key={path.sidebarListKey ?? path.id}
                    className={[
                      'chat-learning-path-card-row',
                      path.id === activePathId ? 'is-active' : '',
                      path.id === openMenuPathId ? 'has-open-menu' : '',
                      path.isPending ? 'is-pending' : '',
                      path.isRemoving ? 'is-removing' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ '--chat-learning-path-enter-index': index } as CSSProperties}
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
                      className={`chat-learning-path-card${path.id === activePathId ? ' is-active' : ''}`}
                      disabled={isPendingLearningPathId(path.id) || path.isRemoving}
                      onClick={() => onSelectLearningPath(path.id)}
                    >
                      <LearningPathProgressRing percent={percent} />
                      <span className="chat-learning-path-card-body">
                        <span className="chat-learning-path-card-title-row">
                          <span className="chat-learning-path-card-title">
                            {getDisplayPathTitle(path.title)}
                          </span>
                          {path.generationMode === 'placeholder' ? (
                            <span className="learn-path-test-badge" aria-label="Platzhalter-Lernpfad (Test)">
                              Test
                            </span>
                          ) : null}
                        </span>
                        <span className="chat-learning-path-card-subtitle">
                          {masteredTopics}/{totalTopics} Themen
                        </span>
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
