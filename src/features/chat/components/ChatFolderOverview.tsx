import { useEffect, useRef, useState } from 'react'
import chevronLeftIcon from '../../../assets/icons/chevron-left.svg'
import editIcon from '../../../assets/icons/edit.svg'
import infoIcon from '../../../assets/icons/info.svg'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { getChatFolderIconStyle } from '../constants/chatFolderColors'
import type { ChatFolderFileRecord } from '../services/chat.folderFiles'
import type { ChatFolder, ChatFolderOverviewTab, ChatThread } from '../types'

type ChatFolderOverviewProps = {
  folder: ChatFolder
  tab: ChatFolderOverviewTab
  threads: ChatThread[]
  files: ChatFolderFileRecord[]
  filesLoading: boolean
  filesUploading: boolean
  isLearnPathCreateDisabled: boolean
  isCompactMobile: boolean
  activeThreadId: string | null
  onSelectThread: (threadId: string) => void
  onEditFolder: () => void
  onTabChange: (tab: ChatFolderOverviewTab) => void
  onUploadFiles: (files: FileList) => void | Promise<void>
  onDeleteFile: (file: ChatFolderFileRecord) => void | Promise<void>
  onDownloadFile: (file: ChatFolderFileRecord) => void | Promise<void>
  onCreateLearningPath: () => void | Promise<void>
  onCreateChat: () => void | Promise<void>
  onBack: () => void
}

const FOLDER_FILES_HINT =
  'Dateien in diesem Ordner stehen allen Chats hier als zusätzliche Quelle zur Verfügung.'

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ChatFolderOverview({
  folder,
  tab,
  threads,
  files,
  filesLoading,
  filesUploading,
  isLearnPathCreateDisabled,
  isCompactMobile,
  activeThreadId,
  onSelectThread,
  onEditFolder,
  onTabChange,
  onUploadFiles,
  onDeleteFile,
  onDownloadFile,
  onCreateLearningPath,
  onCreateChat,
  onBack,
}: ChatFolderOverviewProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const prefersReducedMotionRef = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [isOverviewEntering, setIsOverviewEntering] = useState(prefersReducedMotionRef.current)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsOverviewEntering(true)
      return
    }

    setIsOverviewEntering(false)
    const frame = window.requestAnimationFrame(() => {
      setIsOverviewEntering(true)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [folder.id])

  const newChatButton = (
    <button type="button" className="chat-folder-overview-text-action chat-folder-overview-new-chat-btn" onClick={() => void onCreateChat()}>
      <span className="chat-folder-overview-new-chat-icon" aria-hidden="true" />
      <span>Neuer Chat</span>
    </button>
  )

  return (
    <section
      className={`chat-folder-overview${isCompactMobile ? ' is-mobile-fullscreen' : ''}${
        isOverviewEntering ? ' is-entering' : ''
      }`}
      aria-label={`Ordner ${folder.name}`}
    >
      <div className="chat-folder-overview-inner">
        <header className="chat-folder-overview-header">
          <div className="chat-folder-overview-title-row">
            <button
              type="button"
              className="chat-folder-overview-back-btn"
              aria-label="Zurück zum Chat"
              onClick={onBack}
            >
              <img className="ui-icon chat-folder-overview-back-icon" src={chevronLeftIcon} alt="" aria-hidden="true" />
            </button>
            <span
              className="chat-folder-overview-icon"
              style={getChatFolderIconStyle(folder.color)}
              aria-hidden="true"
            />
            <div className="chat-folder-overview-title-group">
              <h2 className="chat-folder-overview-title">{folder.name}</h2>
              <button
                type="button"
                className="chat-folder-overview-edit-btn"
                aria-label="Ordner bearbeiten"
                onClick={onEditFolder}
              >
                <img
                  className="ui-icon chat-folder-overview-edit-icon"
                  src={editIcon}
                  alt=""
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
          <PrimaryButton
            type="button"
            className="chat-folder-overview-learn-btn"
            disabled={isLearnPathCreateDisabled}
            onClick={() => void onCreateLearningPath()}
          >
            Lernpfad erstellen
          </PrimaryButton>
        </header>

        <nav className="chat-folder-overview-tabs learn-top-tabs" aria-label="Ordner Tabs">
          <button
            type="button"
            className={`learn-top-tab learn-top-tab--path${tab === 'chats' ? ' is-active' : ''}`}
            onClick={() => onTabChange('chats')}
          >
            <span className="learn-top-tab-label">Chats</span>
          </button>
          <button
            type="button"
            className={`learn-top-tab learn-top-tab--tests${tab === 'files' ? ' is-active' : ''}`}
            onClick={() => onTabChange('files')}
          >
            <span className="learn-top-tab-label">Dateien</span>
          </button>
        </nav>

        <div key={tab} className="chat-folder-overview-tab-content">
          <div className="chat-folder-overview-panel learn-tab-panel">
            <div className="chat-folder-overview-panel-toolbar">
              {tab === 'chats' ? (
                newChatButton
              ) : (
                <>
                  <button
                    type="button"
                    className="chat-folder-overview-text-action"
                    disabled={filesUploading}
                    onClick={() => uploadInputRef.current?.click()}
                  >
                    {filesUploading ? 'Wird hochgeladen…' : 'Datei hochladen'}
                  </button>
                  <input
                    ref={uploadInputRef}
                    type="file"
                    className="chat-folder-overview-upload-input"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.ppt,.pptx,.png,.jpg,.jpeg,.webp"
                    onChange={(event) => {
                      const selected = event.currentTarget.files
                      if (selected && selected.length > 0) {
                        void onUploadFiles(selected)
                      }
                      event.currentTarget.value = ''
                    }}
                  />
                </>
              )}
            </div>
            {tab === 'chats' ? (
              threads.length === 0 ? (
                <p className="chat-folder-overview-empty">Noch keine Chats in diesem Ordner.</p>
              ) : (
                <ul className="chat-folder-overview-thread-list">
                  {threads.map((thread) => (
                    <li key={thread.id}>
                      <button
                        type="button"
                        className={`chat-folder-overview-thread-card${
                          thread.id === activeThreadId ? ' is-active' : ''
                        }`}
                        onClick={() => onSelectThread(thread.id)}
                      >
                        <span className="chat-folder-overview-thread-card-title">{thread.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : filesLoading ? (
              <p className="chat-folder-overview-empty">Dateien werden geladen…</p>
            ) : files.length === 0 ? (
              <p className="chat-folder-overview-empty">Noch keine Dateien in diesem Ordner.</p>
            ) : (
              <ul className="chat-folder-overview-file-list">
                {files.map((file) => (
                  <li key={file.id} className="chat-folder-overview-file-item">
                    <div className="chat-folder-overview-file-main">
                      <p className="chat-folder-overview-file-name">{file.name}</p>
                      <p className="chat-folder-overview-file-meta">{formatFileSize(file.sizeBytes)}</p>
                    </div>
                    <div className="chat-folder-overview-file-actions">
                      <button type="button" className="chat-folder-overview-file-action" onClick={() => void onDownloadFile(file)}>
                        Download
                      </button>
                      <button type="button" className="chat-folder-overview-file-action is-danger" onClick={() => void onDeleteFile(file)}>
                        Entfernen
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {tab === 'files' ? (
            <p className="chat-folder-overview-files-footnote">
              <img
                className="ui-icon ui-icon-sm chat-folder-overview-files-footnote-icon"
                src={infoIcon}
                alt=""
                aria-hidden="true"
              />
              <span>{FOLDER_FILES_HINT}</span>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
