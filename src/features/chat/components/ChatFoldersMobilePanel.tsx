import { useState, type ReactNode } from 'react'
import { getChatFolderIconStyle } from '../constants/chatFolderColors'
import type { ChatFolder, ChatThread } from '../types'

type ChatFoldersMobilePanelProps = {
  folders: ChatFolder[]
  threadsByFolderId: Map<string, ChatThread[]>
  onFolderContextMenu: (folder: ChatFolder, event: React.MouseEvent) => void
  onFolderLongPressStart: (folder: ChatFolder, event: React.TouchEvent) => void
  onFolderLongPressMove: (event: React.TouchEvent) => void
  onFolderLongPressEnd: () => void
  renderThreadRow: (thread: ChatThread, threadIndex: number) => ReactNode
}

export function ChatFoldersMobilePanel({
  folders,
  threadsByFolderId,
  onFolderContextMenu,
  onFolderLongPressStart,
  onFolderLongPressMove,
  onFolderLongPressEnd,
  renderThreadRow,
}: ChatFoldersMobilePanelProps) {
  const [expandedFolderIds, setExpandedFolderIds] = useState<Record<string, boolean>>({})

  function toggleFolder(folderId: string) {
    setExpandedFolderIds((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }))
  }

  return (
    <div className="chat-folders-mobile-panel" role="region" aria-label="Eigene Ordner">
      <header className="chat-folders-mobile-section-header">
        <span className="chat-folders-mobile-section-icon" aria-hidden="true" />
        <h2 className="chat-folders-mobile-section-title">Eigene Ordner</h2>
      </header>

      <div className="chat-folders-mobile-body">
        {folders.length === 0 ? (
          <p className="chat-folder-empty-hint">Lege einen Ordner an und verschiebe Chats per Long-Press-Menü.</p>
        ) : (
          <ul className="chat-folders-mobile-list">
            {folders.map((folder) => {
              const threads = threadsByFolderId.get(folder.id) ?? []
              const isExpanded = expandedFolderIds[folder.id] ?? false
              return (
                <li
                  key={folder.id}
                  className={`chat-folders-mobile-item${isExpanded ? ' is-expanded' : ''}`}
                >
                  <button
                    type="button"
                    className="chat-folders-mobile-folder-toggle"
                    aria-expanded={isExpanded}
                    onClick={() => toggleFolder(folder.id)}
                    onContextMenu={(event) => onFolderContextMenu(folder, event)}
                    onTouchStart={(event) => onFolderLongPressStart(folder, event)}
                    onTouchMove={onFolderLongPressMove}
                    onTouchEnd={onFolderLongPressEnd}
                    onTouchCancel={onFolderLongPressEnd}
                  >
                    <span className="chat-folders-mobile-folder-leading">
                      <span className="chat-folders-mobile-folder-chevron" aria-hidden="true" />
                      <span
                        className="chat-folders-mobile-folder-icon"
                        style={getChatFolderIconStyle(folder.color)}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="chat-folders-mobile-folder-name">{folder.name}</span>
                    <span className="chat-folders-mobile-folder-count">{threads.length}</span>
                  </button>
                  {isExpanded ? (
                    <div className="chat-folders-mobile-folder-threads">
                      {threads.length === 0 ? (
                        <p className="chat-folder-group-empty">Keine Chats in diesem Ordner</p>
                      ) : (
                        threads.map((thread, index) => (
                          <div key={thread.id}>{renderThreadRow(thread, index)}</div>
                        ))
                      )}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
