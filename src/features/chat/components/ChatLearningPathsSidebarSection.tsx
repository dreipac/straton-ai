import { useState, type RefObject, type MouseEvent as ReactMouseEvent } from 'react'
import type { LearningPathSummary } from '../../learn/services/learn.persistence'
import { getDisplayPathTitle, isPendingLearningPathId } from '../../learn/utils/learnPageHelpers'
import { ChatSidebarSectionHeader } from './ChatSidebarSectionHeader'

type ChatLearningPathsSidebarSectionProps = {
  sectionRef?: RefObject<HTMLDivElement | null>
  tourHighlight?: boolean
  learningPaths: LearningPathSummary[]
  activePathId: string | null
  isCreateDisabled: boolean
  onCreateLearningPath: () => void
  onSelectLearningPath: (pathId: string) => void
  onCreateDisabledClick: () => void
  openMenuPathId?: string | null
  onContextMenu?: (event: React.MouseEvent, pathId: string) => void
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
}: ChatLearningPathsSidebarSectionProps) {
  const [isSectionExpanded, setIsSectionExpanded] = useState(true)

  const createButton = (
    <button
      type="button"
      className="chat-folder-create-btn"
      aria-disabled={isCreateDisabled}
      onClick={() => {
        if (isCreateDisabled) {
          onCreateDisabledClick()
          return
        }
        onCreateLearningPath()
      }}
      aria-label="Neuer Lernpfad"
    >
      +
    </button>
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
                </button>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}
