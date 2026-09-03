import deleteIcon from '../../../../assets/icons/delete.svg'
import folderOutlinedIcon from '../../../../assets/icons/folder-outlined.svg'
import editIcon from '../../../../assets/icons/edit.svg'
import fileIcon from '../../../../assets/icons/file.svg'
import folderFilledIcon from '../../../../assets/icons/folder-filled.svg'
import logoutIcon from '../../../../assets/icons/logout.svg'
import { ActionBottomSheet } from '../../../../components/ui/bottom-sheet/ActionBottomSheet'
import { type ContentBottomSheetHandle } from '../../../../components/ui/bottom-sheet/ContentBottomSheet'
import { ProfileFullSheet, type ProfileFullSheetHandle } from '../../../../components/ui/bottom-sheet/ProfileFullSheet'
import { RenameBottomSheet, type RenameBottomSheetHandle } from '../../../../components/ui/bottom-sheet/RenameBottomSheet'
import { ChatFolderEditorForm } from '../ChatFolderEditorForm'
import { ChatFolderEditorBottomSheet } from '../ChatFolderEditorBottomSheet'
import type { ChatFolderColorId } from '../../constants/chatFolderColors'
import { PopoverMenu } from '../../../../components/ui/menu/PopoverMenu'
import { MenuItem } from '../../../../components/ui/menu/MenuItem'
import { ModalHeader } from '../../../../components/ui/modal/ModalHeader'
import { ModalShell } from '../../../../components/ui/modal/ModalShell'
import type { UserProfile } from '../../../auth/services/auth.service'
import { SettingsModal, type SettingsSectionId } from '../../../../pages/SettingsPage'
import type { useChatFolders } from '../../hooks/useChatFolders'
import type { ChatFolder, ChatThread } from '../../types'
import type { LearningPathSummary } from '../../../learn/services/learn.persistence'
import { getDisplayPathTitle } from '../../../learn/utils/learnPageHelpers'
import { isMobileViewport } from '../../../../utils/mobile'
import { ChatBetaNoticeDialog } from './ChatBetaNoticeDialog'
import { ChatIntroductionDialog } from './ChatIntroductionDialog'
import type { IntroductionEditorValue } from '../../../settings/components/IntroductionEditor'
import { PROFILE_SETTINGS_SHEET_SECTIONS } from './chatPageConstants'
import type { FormEvent, RefObject } from 'react'

type ChatFoldersState = ReturnType<typeof useChatFolders>

export type ChatPageOverlaysProps = {
  isNarrowViewport: boolean
  isCompactMobileSidebarLayout: boolean
  logoSrc: string
  profile: UserProfile | null
  displayName: string
  avatarFallback: string
  subscriptionPlanName: string | null
  threads: ChatThread[]
  chatFolders: ChatFoldersState
  chatFoldersFeatureEnabled: boolean
  profileFullSheetRef: RefObject<ProfileFullSheetHandle | null>
  betaNoticeSheetRef: RefObject<ContentBottomSheetHandle | null>
  mobileSheetMode: 'closed' | 'profile' | 'settings'
  setMobileSheetMode: (mode: 'closed' | 'profile' | 'settings') => void
  settingsInitialSection: SettingsSectionId
  isBetaNoticeMounted: boolean
  isBetaNoticeVisible: boolean
  introductionSheetRef: RefObject<ContentBottomSheetHandle | null>
  isIntroductionMounted: boolean
  isIntroductionVisible: boolean
  introductionDraft: IntroductionEditorValue
  onIntroductionDraftChange: (value: IntroductionEditorValue) => void
  isIntroductionSaving: boolean
  onSaveIntroduction: () => void | Promise<void>
  onDeferIntroduction: () => void | Promise<void>
  onIntroductionSheetExitComplete: () => void
  menuWrapperRef: RefObject<HTMLDivElement | null>
  threadSheetRef: RefObject<HTMLDivElement | null>
  renameSheetRef: RefObject<RenameBottomSheetHandle | null>
  folderSheetRef: RefObject<HTMLDivElement | null>
  folderMenuWrapperRef: RefObject<HTMLDivElement | null>
  openMenuThreadId: string | null
  threadMenuVariant: 'none' | 'context' | 'sheet'
  contextMenuPosition: { x: number; y: number } | null
  ownsThreadForMenu: boolean
  canLeaveSharedChatForMenu: boolean
  openFolderMenuId: string | null
  folderMenuVariant: 'none' | 'context' | 'sheet'
  folderContextMenuPosition: { x: number; y: number } | null
  folderMoveThreadId: string | null
  isFolderMoveModalVisible: boolean
  folderNameSheetMode: 'create' | { editFolderId: string } | null
  folderNameDraft: string
  setFolderNameDraft: (value: string) => void
  folderColorDraft: ChatFolderColorId | null
  setFolderColorDraft: (value: ChatFolderColorId | null) => void
  isFolderNameSheetOpen: boolean
  isFolderNameModalVisible: boolean
  editingThread: ChatThread | null
  isRenameVisible: boolean
  renameDraft: string
  setRenameDraft: (value: string) => void
  onCloseSettings: () => void
  onOpenSettings: (section?: SettingsSectionId) => void
  onOpenAdmin: () => void
  onCloseBetaNotice: () => void
  onBetaNoticeSheetExitComplete: () => void
  onLogout: () => void | Promise<void>
  onCloseThreadMenu: () => void
  onCloseFolderMenu: () => void
  onOpenFolderMove: (threadId: string) => void
  onOpenRenameThread: (thread: ChatThread) => void
  onArchiveThread: (threadId: string) => void | Promise<void>
  onDeleteThread: (threadId: string) => void | Promise<void>
  onLeaveSharedThread: (threadId: string) => void | Promise<void>
  onMoveThreadToFolder: (threadId: string, folderId: string | null) => void | Promise<void>
  onCloseFolderMove: () => void
  onOpenEditFolderSheet: (folder: ChatFolder) => void
  onDeleteFolder: (folderId: string) => void | Promise<void>
  onCloseFolderName: () => void
  onFolderNameSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onCloseRenameModal: () => void
  onRenameSheetClosed: () => void
  onRenameSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  showLearningPathsInSidebar: boolean
  learningPaths: LearningPathSummary[]
  pathMenuRef: RefObject<HTMLDivElement | null>
  learningPathRenameSheetRef: RefObject<RenameBottomSheetHandle | null>
  openMenuPathId: string | null
  pathMenuVariant: 'none' | 'context' | 'sheet'
  pathContextMenuPosition: { x: number; y: number } | null
  onCloseLearningPathMenu: () => void
  onOpenRenameLearningPath: (pathId: string) => void
  onDeleteLearningPath: (pathId: string) => void | Promise<void>
  learningPathRenamingId: string | null
  isLearningPathRenameVisible: boolean
  learningPathRenameDraft: string
  setLearningPathRenameDraft: (value: string) => void
  onCloseLearningPathRename: () => void
  onLearningPathRenameSheetClosed: () => void
  onLearningPathRenameSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
}

export function ChatPageOverlays(props: ChatPageOverlaysProps) {
  const {
    isNarrowViewport,
    isCompactMobileSidebarLayout,
    logoSrc,
    profile,
    displayName,
    avatarFallback,
    subscriptionPlanName,
    threads,
    chatFolders,
    chatFoldersFeatureEnabled,
    profileFullSheetRef,
    betaNoticeSheetRef,
    mobileSheetMode,
    setMobileSheetMode,
    settingsInitialSection,
    isBetaNoticeMounted,
    isBetaNoticeVisible,
    introductionSheetRef,
    isIntroductionMounted,
    isIntroductionVisible,
    introductionDraft,
    onIntroductionDraftChange,
    isIntroductionSaving,
    onSaveIntroduction,
    onDeferIntroduction,
    onIntroductionSheetExitComplete,
    menuWrapperRef,
    threadSheetRef,
    renameSheetRef,
    folderSheetRef,
    folderMenuWrapperRef,
    openMenuThreadId,
    threadMenuVariant,
    contextMenuPosition,
    ownsThreadForMenu,
    canLeaveSharedChatForMenu,
    openFolderMenuId,
    folderMenuVariant,
    folderContextMenuPosition,
    folderMoveThreadId,
    isFolderMoveModalVisible,
    folderNameSheetMode,
    folderNameDraft,
    setFolderNameDraft,
    folderColorDraft,
    setFolderColorDraft,
    isFolderNameSheetOpen,
    isFolderNameModalVisible,
    editingThread,
    isRenameVisible,
    renameDraft,
    setRenameDraft,
    onCloseSettings,
    onOpenSettings,
    onOpenAdmin,
    onCloseBetaNotice,
    onBetaNoticeSheetExitComplete,
    onLogout,
    onCloseThreadMenu,
    onCloseFolderMenu,
    onOpenFolderMove,
    onOpenRenameThread,
    onArchiveThread,
    onDeleteThread,
    onLeaveSharedThread,
    onMoveThreadToFolder,
    onCloseFolderMove,
    onOpenEditFolderSheet,
    onDeleteFolder,
    onCloseFolderName,
    onFolderNameSubmit,
    onCloseRenameModal,
    onRenameSheetClosed,
    onRenameSubmit,
    showLearningPathsInSidebar,
    learningPaths,
    pathMenuRef,
    learningPathRenameSheetRef,
    openMenuPathId,
    pathMenuVariant,
    pathContextMenuPosition,
    onCloseLearningPathMenu,
    onOpenRenameLearningPath,
    onDeleteLearningPath,
    learningPathRenamingId,
    isLearningPathRenameVisible,
    learningPathRenameDraft,
    setLearningPathRenameDraft,
    onCloseLearningPathRename,
    onLearningPathRenameSheetClosed,
    onLearningPathRenameSubmit,
  } = props

  return (
    <>
      {isCompactMobileSidebarLayout && mobileSheetMode !== 'closed' ? (
        <ProfileFullSheet
          ref={profileFullSheetRef}
          open
          bodyClassName={mobileSheetMode === 'settings' ? 'is-settings-mode' : undefined}
          onClose={() => {
            setMobileSheetMode('closed')
          }}
        >
          {mobileSheetMode === 'profile' ? (
            <>
              <div className="profile-full-sheet-hero">
                {profile?.avatar_url ? (
                  <img className="profile-full-sheet-avatar" src={profile.avatar_url} alt="Profilbild" />
                ) : (
                  <div className="profile-full-sheet-avatar-fallback" aria-hidden="true">
                    {avatarFallback}
                  </div>
                )}
                <p className="profile-full-sheet-name">{displayName}</p>
                {subscriptionPlanName ? <p className="profile-full-sheet-plan">{subscriptionPlanName}</p> : null}
                {profile?.is_superadmin ? <span className="ui-pill-badge ui-pill-badge--red">Admin</span> : null}
              </div>
              <nav className="profile-full-sheet-nav" aria-label="Einstellungen">
                {PROFILE_SETTINGS_SHEET_SECTIONS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    className="profile-full-sheet-row"
                    onClick={() => {
                      onOpenSettings(id)
                    }}
                  >
                    <span className="profile-full-sheet-row-label">{label}</span>
                    <span className="profile-full-sheet-row-chevron" aria-hidden="true">
                      ›
                    </span>
                  </button>
                ))}
                {profile?.is_superadmin ? (
                  <button type="button" className="profile-full-sheet-row" onClick={onOpenAdmin}>
                    <span className="profile-full-sheet-row-label">Administrator</span>
                    <span className="profile-full-sheet-row-chevron" aria-hidden="true">
                      ›
                    </span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="profile-full-sheet-row is-danger"
                  onClick={() => void onLogout()}
                >
                  <span className="profile-full-sheet-row-label">Logout</span>
                  <span className="profile-full-sheet-row-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              </nav>
            </>
          ) : (
            <SettingsModal variant="sheet" onClose={onCloseSettings} initialSection={settingsInitialSection} />
          )}
        </ProfileFullSheet>
      ) : null}

      {threadMenuVariant === 'sheet' && openMenuThreadId ? (
        <ActionBottomSheet
          ref={threadSheetRef}
          open
          ariaLabel="Chat-Aktionen"
          title={threads.find((t) => t.id === openMenuThreadId)?.title}
          onClose={onCloseThreadMenu}
          actions={[
            ...(chatFoldersFeatureEnabled
              ? [
                  {
                    id: 'move-folder',
                    label: 'In Ordner verschieben',
                    iconSrc: fileIcon,
                    closeSheetAfter: false,
                    onClick: () => {
                      const id = openMenuThreadId
                      onCloseThreadMenu()
                      if (id) {
                        onOpenFolderMove(id)
                      }
                    },
                  },
                ]
              : []),
            ...(ownsThreadForMenu
              ? [
                  {
                    id: 'edit',
                    label: 'Bearbeiten',
                    iconSrc: editIcon,
                    onClick: () => {
                      const targetThread = threads.find((thread) => thread.id === openMenuThreadId)
                      if (targetThread) {
                        onOpenRenameThread(targetThread)
                      }
                    },
                  },
                ]
              : []),
            ...(ownsThreadForMenu
              ? [
                  {
                    id: 'archive',
                    label: 'Archivieren',
                    iconSrc: folderOutlinedIcon,
                    onClick: async () => {
                      const id = openMenuThreadId
                      if (id) {
                        await onArchiveThread(id)
                      }
                    },
                  },
                  {
                    id: 'delete',
                    label: 'Löschen',
                    iconSrc: deleteIcon,
                    variant: 'danger' as const,
                    onClick: async () => {
                      const id = openMenuThreadId
                      if (id) {
                        await onDeleteThread(id)
                      }
                    },
                  },
                ]
              : []),
            ...(canLeaveSharedChatForMenu
              ? [
                  {
                    id: 'leave-share',
                    label: 'Für mich entfernen',
                    iconSrc: logoutIcon,
                    variant: 'danger' as const,
                    onClick: async () => {
                      const id = openMenuThreadId
                      onCloseThreadMenu()
                      if (id) {
                        await onLeaveSharedThread(id)
                      }
                    },
                  },
                ]
              : []),
          ]}
        />
      ) : null}

      {threadMenuVariant === 'context' && openMenuThreadId && contextMenuPosition ? (
        <PopoverMenu
          ref={menuWrapperRef}
          open
          position={contextMenuPosition}
          onClose={onCloseThreadMenu}
          ariaLabel="Chat-Aktionen"
        >
          {chatFoldersFeatureEnabled ? (
            <MenuItem
              iconSrc={fileIcon}
              onClick={() => {
                const id = openMenuThreadId
                onCloseThreadMenu()
                if (id) {
                  onOpenFolderMove(id)
                }
              }}
            >
              In Ordner verschieben
            </MenuItem>
          ) : null}
          {ownsThreadForMenu ? (
            <MenuItem
              iconSrc={editIcon}
              onClick={() => {
                const targetThread = threads.find((thread) => thread.id === openMenuThreadId)
                if (targetThread) {
                  onOpenRenameThread(targetThread)
                }
              }}
            >
              Bearbeiten
            </MenuItem>
          ) : null}
          {ownsThreadForMenu ? (
            <MenuItem
              iconSrc={folderOutlinedIcon}
              onClick={async () => {
                const id = openMenuThreadId
                onCloseThreadMenu()
                if (id) {
                  await onArchiveThread(id)
                }
              }}
            >
              Archivieren
            </MenuItem>
          ) : null}
          {ownsThreadForMenu ? (
            <MenuItem
              iconSrc={deleteIcon}
              danger
              onClick={async () => {
                const id = openMenuThreadId
                onCloseThreadMenu()
                if (id) {
                  await onDeleteThread(id)
                }
              }}
            >
              Löschen
            </MenuItem>
          ) : null}
          {canLeaveSharedChatForMenu ? (
            <MenuItem
              iconSrc={logoutIcon}
              danger
              onClick={async () => {
                const id = openMenuThreadId
                onCloseThreadMenu()
                if (id) {
                  await onLeaveSharedThread(id)
                }
              }}
            >
              Für mich entfernen
            </MenuItem>
          ) : null}
        </PopoverMenu>
      ) : null}

      {showLearningPathsInSidebar && pathMenuVariant === 'sheet' && openMenuPathId ? (
        <ActionBottomSheet
          open
          ariaLabel="Lernpfad-Aktionen"
          title={getDisplayPathTitle(
            learningPaths.find((path) => path.id === openMenuPathId)?.title ?? 'Lernpfad',
          )}
          onClose={onCloseLearningPathMenu}
          actions={[
            {
              id: 'rename',
              label: 'Bearbeiten',
              iconSrc: editIcon,
              onClick: () => onOpenRenameLearningPath(openMenuPathId),
            },
            {
              id: 'delete',
              label: 'Löschen',
              iconSrc: deleteIcon,
              variant: 'danger' as const,
              onClick: () => {
                void onDeleteLearningPath(openMenuPathId)
              },
            },
          ]}
        />
      ) : null}

      {showLearningPathsInSidebar &&
      pathMenuVariant === 'context' &&
      openMenuPathId &&
      pathContextMenuPosition ? (
        <PopoverMenu
          ref={pathMenuRef}
          open
          position={pathContextMenuPosition}
          onClose={onCloseLearningPathMenu}
          ariaLabel="Lernpfad-Aktionen"
        >
          <MenuItem
            iconSrc={editIcon}
            onClick={() => {
              onOpenRenameLearningPath(openMenuPathId)
            }}
          >
            Bearbeiten
          </MenuItem>
          <MenuItem
            iconSrc={deleteIcon}
            danger
            onClick={() => {
              void onDeleteLearningPath(openMenuPathId)
            }}
          >
            Löschen
          </MenuItem>
        </PopoverMenu>
      ) : null}

      {chatFoldersFeatureEnabled && folderMoveThreadId && isCompactMobileSidebarLayout ? (
        <ActionBottomSheet
          open
          ariaLabel="Ordner wählen"
          title={threads.find((t) => t.id === folderMoveThreadId)?.title ?? 'Chat verschieben'}
          onClose={onCloseFolderMove}
          actions={[
            {
              id: 'folder-none',
              label: 'Ohne Ordner',
              iconSrc: fileIcon,
              onClick: () => {
                void onMoveThreadToFolder(folderMoveThreadId, null)
              },
            },
            ...chatFolders.folders.map((folder) => ({
              id: `folder-${folder.id}`,
              label: folder.name,
              iconSrc: folderFilledIcon,
              onClick: () => {
                void onMoveThreadToFolder(folderMoveThreadId, folder.id)
              },
            })),
          ]}
        />
      ) : chatFoldersFeatureEnabled && folderMoveThreadId ? (
        <ModalShell isOpen={isFolderMoveModalVisible} onRequestClose={onCloseFolderMove}>
          <section
            className="rename-modal chat-folder-move-modal"
            role="dialog"
            aria-modal="true"
            aria-label="In Ordner verschieben"
          >
            <ModalHeader
              title="In Ordner verschieben"
              headingLevel="h3"
              className="rename-modal-header"
              onClose={onCloseFolderMove}
              closeLabel="Ordner wählen schließen"
            />
            <p className="chat-folder-move-modal-subtitle">
              {threads.find((thread) => thread.id === folderMoveThreadId)?.title ?? 'Chat'}
            </p>
            <div className="chat-folder-move-modal-list">
              <MenuItem
                iconSrc={fileIcon}
                onClick={() => {
                  void onMoveThreadToFolder(folderMoveThreadId, null)
                }}
              >
                Ohne Ordner
              </MenuItem>
              {chatFolders.folders.map((folder) => (
                <MenuItem
                  key={folder.id}
                  iconSrc={folderFilledIcon}
                  onClick={() => {
                    void onMoveThreadToFolder(folderMoveThreadId, folder.id)
                  }}
                >
                  {folder.name}
                </MenuItem>
              ))}
            </div>
          </section>
        </ModalShell>
      ) : null}

      {chatFoldersFeatureEnabled && folderMenuVariant === 'sheet' && openFolderMenuId ? (
        <ActionBottomSheet
          ref={folderSheetRef}
          open
          ariaLabel="Ordner-Aktionen"
          title={chatFolders.folders.find((folder) => folder.id === openFolderMenuId)?.name}
          onClose={onCloseFolderMenu}
          actions={[
            {
              id: 'edit-folder',
              label: 'Bearbeiten',
              iconSrc: editIcon,
              onClick: () => {
                const folder = chatFolders.folders.find((item) => item.id === openFolderMenuId)
                if (folder) {
                  onOpenEditFolderSheet(folder)
                }
              },
            },
            {
              id: 'delete-folder',
              label: 'Ordner löschen',
              iconSrc: deleteIcon,
              variant: 'danger' as const,
              onClick: () => {
                if (openFolderMenuId) {
                  void onDeleteFolder(openFolderMenuId)
                }
              },
            },
          ]}
        />
      ) : null}

      {chatFoldersFeatureEnabled &&
      folderMenuVariant === 'context' &&
      openFolderMenuId &&
      folderContextMenuPosition ? (
        <PopoverMenu
          ref={folderMenuWrapperRef}
          open
          position={folderContextMenuPosition}
          onClose={onCloseFolderMenu}
          ariaLabel="Ordner-Aktionen"
        >
          <MenuItem
            iconSrc={editIcon}
            onClick={() => {
              const folder = chatFolders.folders.find((item) => item.id === openFolderMenuId)
              if (folder) {
                onOpenEditFolderSheet(folder)
              }
            }}
          >
            Bearbeiten
          </MenuItem>
          <MenuItem
            iconSrc={deleteIcon}
            danger
            onClick={() => {
              if (openFolderMenuId) {
                void onDeleteFolder(openFolderMenuId)
              }
            }}
          >
            Ordner löschen
          </MenuItem>
        </PopoverMenu>
      ) : null}

      {learningPathRenamingId && isMobileViewport() ? (
        <RenameBottomSheet
          ref={learningPathRenameSheetRef}
          open
          onClose={onLearningPathRenameSheetClosed}
          heading="Lernpfad bearbeiten"
          inputLabel="Name"
          inputId="learn-path-title-input-chat"
          value={learningPathRenameDraft}
          onChange={setLearningPathRenameDraft}
          placeholder="Neuer Lernpfadname"
          onSubmit={onLearningPathRenameSubmit}
        />
      ) : learningPathRenamingId ? (
        <ModalShell isOpen={isLearningPathRenameVisible} onRequestClose={onCloseLearningPathRename}>
          <section className="rename-modal" role="dialog" aria-modal="true" aria-label="Lernpfad umbenennen">
            <ModalHeader
              title="Lernpfad bearbeiten"
              headingLevel="h3"
              className="rename-modal-header"
              onClose={onCloseLearningPathRename}
              closeLabel="Lernpfad bearbeiten schließen"
            />
            <form className="rename-form" onSubmit={onLearningPathRenameSubmit}>
              <label htmlFor="learn-path-title-input-chat">Name</label>
              <input
                id="learn-path-title-input-chat"
                type="text"
                value={learningPathRenameDraft}
                onChange={(event) => setLearningPathRenameDraft(event.target.value)}
                placeholder="Neuer Lernpfadname"
                maxLength={120}
                autoFocus
              />
              <div className="rename-actions">
                <button type="submit" disabled={!learningPathRenameDraft.trim()}>
                  Speichern
                </button>
              </div>
            </form>
          </section>
        </ModalShell>
      ) : null}

      {chatFoldersFeatureEnabled && isFolderNameSheetOpen && isCompactMobileSidebarLayout ? (
        <ChatFolderEditorBottomSheet
          open
          onClose={onCloseFolderName}
          heading={folderNameSheetMode === 'create' ? 'Neuer Ordner' : 'Ordner bearbeiten'}
          name={folderNameDraft}
          color={folderColorDraft}
          onNameChange={setFolderNameDraft}
          onColorChange={setFolderColorDraft}
          submitLabel={folderNameSheetMode === 'create' ? 'Erstellen' : 'Speichern'}
          onSubmit={onFolderNameSubmit}
        />
      ) : chatFoldersFeatureEnabled && isFolderNameSheetOpen ? (
        <ModalShell isOpen={isFolderNameModalVisible} onRequestClose={onCloseFolderName}>
          <section
            className="rename-modal chat-folder-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-label={folderNameSheetMode === 'create' ? 'Neuer Ordner' : 'Ordner bearbeiten'}
          >
            <ModalHeader
              title={folderNameSheetMode === 'create' ? 'Neuer Ordner' : 'Ordner bearbeiten'}
              headingLevel="h3"
              className="rename-modal-header"
              onClose={onCloseFolderName}
              closeLabel={
                folderNameSheetMode === 'create' ? 'Neuer Ordner schließen' : 'Ordner bearbeiten schließen'
              }
            />
            <ChatFolderEditorForm
              inputId="chat-folder-name-input"
              name={folderNameDraft}
              color={folderColorDraft}
              onNameChange={setFolderNameDraft}
              onColorChange={setFolderColorDraft}
              onSubmit={onFolderNameSubmit}
              submitLabel={folderNameSheetMode === 'create' ? 'Erstellen' : 'Speichern'}
            />
          </section>
        </ModalShell>
      ) : null}

      {editingThread && isMobileViewport() ? (
        <RenameBottomSheet
          ref={renameSheetRef}
          open
          onClose={onRenameSheetClosed}
          heading="Chat bearbeiten"
          inputLabel="Chat-Name"
          inputId="chat-title-input"
          value={renameDraft}
          onChange={setRenameDraft}
          placeholder="Neuer Chatname"
          onSubmit={onRenameSubmit}
        />
      ) : editingThread ? (
        <ModalShell isOpen={isRenameVisible} onRequestClose={onCloseRenameModal}>
          <section className="rename-modal" role="dialog" aria-modal="true" aria-label="Chat umbenennen">
            <ModalHeader
              title="Chat bearbeiten"
              headingLevel="h3"
              className="rename-modal-header"
              onClose={onCloseRenameModal}
              closeLabel="Chat bearbeiten schließen"
            />
            <form className="rename-form" onSubmit={onRenameSubmit}>
              <label htmlFor="chat-title-input">Chat-Name</label>
              <input
                id="chat-title-input"
                type="text"
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                placeholder="Neuer Chatname"
              />
              <div className="rename-actions">
                <button type="submit" disabled={!renameDraft.trim()}>
                  Speichern
                </button>
              </div>
            </form>
          </section>
        </ModalShell>
      ) : null}

      <ChatBetaNoticeDialog
        isNarrowViewport={isNarrowViewport}
        isMounted={isBetaNoticeMounted}
        isVisible={isBetaNoticeVisible}
        logoSrc={logoSrc}
        betaNoticeSheetRef={betaNoticeSheetRef}
        onClose={() => void onCloseBetaNotice()}
        onSheetExitComplete={() => void onBetaNoticeSheetExitComplete()}
      />

      <ChatIntroductionDialog
        isNarrowViewport={isNarrowViewport}
        isMounted={isIntroductionMounted}
        isVisible={isIntroductionVisible}
        introductionSheetRef={introductionSheetRef}
        draft={introductionDraft}
        onDraftChange={onIntroductionDraftChange}
        isSaving={isIntroductionSaving}
        onSave={() => void onSaveIntroduction()}
        onLater={() => void onDeferIntroduction()}
        onSheetExitComplete={() => void onIntroductionSheetExitComplete()}
      />
    </>
  )
}
