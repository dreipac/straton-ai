import { useState, type ReactNode } from 'react'
import { getChatFolderIconStyle } from '../constants/chatFolderColors'
import type { ChatFolder, ChatThread } from '../types'

type ChatFolderSidebarSectionProps = {
  folders: ChatFolder[]
  threadsByFolderId: Map<string, ChatThread[]>
  openFolderMenuId?: string | null
  onCreateFolder: () => void
  onFolderContextMenu: (folder: ChatFolder, event: React.MouseEvent) => void
  onFolderLongPressStart: (folder: ChatFolder, event: React.TouchEvent) => void
  onFolderLongPressMove: (event: React.TouchEvent) => void
  onFolderLongPressEnd: () => void
  renderThreadRow: (thread: ChatThread, threadIndex: number) => ReactNode
}

export function ChatFolderSidebarSection({
  folders,
  threadsByFolderId,
  openFolderMenuId = null,
  onCreateFolder,
  onFolderContextMenu,
  onFolderLongPressStart,
  onFolderLongPressMove,
  onFolderLongPressEnd,
  renderThreadRow,
}: ChatFolderSidebarSectionProps) {
  const [expandedFolderIds, setExpandedFolderIds] = useState<Record<string, boolean>>({})

  function toggleFolder(folderId: string) {
    setExpandedFolderIds((prev) => ({
      ...prev,
      [folderId]: !(prev[folderId] ?? true),
    }))
  }

  if (folders.length === 0) {
    return (
      <div className="chat-folder-sidebar-section">
        <div className="chat-folder-sidebar-header">
          <p className="thread-list-info">Ordner</p>
          <button type="button" className="chat-folder-create-btn" onClick={onCreateFolder}>
            + Ordner
          </button>
        </div>
        <p className="chat-folder-empty-hint">Noch keine Ordner. Lege einen an, um Chats zu sortieren.</p>
      </div>
    )
  }

  return (
    <div className="chat-folder-sidebar-section">
      <div className="chat-folder-sidebar-header">
        <p className="thread-list-info">Ordner</p>
        <button type="button" className="chat-folder-create-btn" onClick={onCreateFolder}>
          + Ordner
        </button>
      </div>
      <div className="chat-folder-list">
        {folders.map((folder) => {
          const threads = threadsByFolderId.get(folder.id) ?? []
          const isExpanded = expandedFolderIds[folder.id] ?? true
          return (
            <div
              key={folder.id}
              className={`chat-folder-group chat-thread-row${isExpanded ? ' is-expanded' : ''}${
                openFolderMenuId === folder.id ? ' has-open-menu' : ''
              }`}
            >
              <button
                type="button"
                className="chat-thread-item chat-folder-group-header"
                aria-expanded={isExpanded}
                onClick={() => toggleFolder(folder.id)}
                onContextMenu={(event) => onFolderContextMenu(folder, event)}
                onTouchStart={(event) => onFolderLongPressStart(folder, event)}
                onTouchMove={onFolderLongPressMove}
                onTouchEnd={onFolderLongPressEnd}
                onTouchCancel={onFolderLongPressEnd}
              >
                <span className="chat-folder-group-leading">
                  <span className="chat-folder-group-chevron" aria-hidden="true" />
                  <span
                    className="chat-folder-group-icon"
                    style={getChatFolderIconStyle(folder.color)}
                    aria-hidden="true"
                  />
                </span>
                <span className="chat-thread-title">{folder.name}</span>
              </button>
              {isExpanded ? (
                <div className="chat-folder-group-threads">
                  {threads.length === 0 ? (
                    <p className="chat-folder-group-empty">Keine Chats in diesem Ordner</p>
                  ) : (
                    threads.map((thread, index) => renderThreadRow(thread, index))
                  )}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
