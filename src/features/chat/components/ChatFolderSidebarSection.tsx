import { useState, type ReactNode } from 'react'
import { getChatFolderIconStyle } from '../constants/chatFolderColors'
import type { ChatFolder, ChatThread } from '../types'

type ChatFolderSidebarSectionProps = {
  folders: ChatFolder[]
  threadsByFolderId: Map<string, ChatThread[]>
  selectedFolderId?: string | null
  openFolderMenuId?: string | null
  onCreateFolder: () => void
  onOpenFolder: (folderId: string) => void
  onFolderContextMenu: (folder: ChatFolder, event: React.MouseEvent) => void
  onFolderLongPressStart: (folder: ChatFolder, event: React.TouchEvent) => void
  onFolderLongPressMove: (event: React.TouchEvent) => void
  onFolderLongPressEnd: () => void
  renderThreadRow: (thread: ChatThread, threadIndex: number) => ReactNode
}

export function ChatFolderSidebarSection({
  folders,
  threadsByFolderId,
  selectedFolderId = null,
  openFolderMenuId = null,
  onCreateFolder,
  onOpenFolder,
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
              }${selectedFolderId === folder.id ? ' is-selected' : ''}`}
            >
              <div
                className={`chat-thread-item chat-folder-group-header-row${
                  selectedFolderId === folder.id ? ' is-selected' : ''
                }`}
              >
                <button
                  type="button"
                  className="chat-folder-group-chevron-btn"
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? 'Ordner einklappen' : 'Ordner ausklappen'}
                  onClick={() => toggleFolder(folder.id)}
                >
                  <span className="chat-folder-group-chevron" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="chat-folder-group-open-btn"
                  onClick={() => onOpenFolder(folder.id)}
                  onContextMenu={(event) => onFolderContextMenu(folder, event)}
                  onTouchStart={(event) => onFolderLongPressStart(folder, event)}
                  onTouchMove={onFolderLongPressMove}
                  onTouchEnd={onFolderLongPressEnd}
                  onTouchCancel={onFolderLongPressEnd}
                >
                  <span
                    className="chat-folder-group-icon"
                    style={getChatFolderIconStyle(folder.color)}
                    aria-hidden="true"
                  />
                  <span className="chat-thread-title">{folder.name}</span>
                </button>
              </div>
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
