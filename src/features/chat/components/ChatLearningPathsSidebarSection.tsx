import { useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import type { LearningPathSummary } from '../../learn/services/learn.persistence'
import { getDisplayPathTitle, isPendingLearningPathId } from '../../learn/utils/learnPageHelpers'
import { ChatSidebarSectionHeader } from './ChatSidebarSectionHeader'
import { LearningPathProgressRing } from './LearningPathProgressRing'

type ChatLearningPathsSidebarSectionProps = {
  learningPaths: LearningPathSummary[]
  activePathId: string | null
  onSelectLearningPath: (pathId: string) => void
  openMenuPathId?: string | null
  onContextMenu?: (event: React.MouseEvent, pathId: string) => void
}

export function ChatLearningPathsSidebarSection({
  learningPaths,
  activePathId,
  onSelectLearningPath,
  openMenuPathId = null,
  onContextMenu,
}: ChatLearningPathsSidebarSectionProps) {
  const [isSectionExpanded, setIsSectionExpanded] = useState(true)

  return (
    <div className="chat-learning-paths-sidebar-section">
      <ChatSidebarSectionHeader
        title="Lernpfade"
        isExpanded={isSectionExpanded}
        onToggle={() => setIsSectionExpanded((prev) => !prev)}
      />
      {isSectionExpanded ? (
        <>
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
                      <LearningPathProgressRing percent={percent} className="chat-learning-path-card-ring" />
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
