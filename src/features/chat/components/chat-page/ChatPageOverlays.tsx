import deleteIcon from '../../../../assets/icons/delete.svg'
import folderOutlinedIcon from '../../../../assets/icons/folder-outlined.svg'
import editIcon from '../../../../assets/icons/edit.svg'
import fileIcon from '../../../../assets/icons/file.svg'
import folderFilledIcon from '../../../../assets/icons/folder-filled.svg'
import logoutIcon from '../../../../assets/icons/logout.svg'
import { PrimaryButton } from '../../../../components/ui/buttons/PrimaryButton'
import { ActionBottomSheet } from '../../../../components/ui/bottom-sheet/ActionBottomSheet'
import { type ContentBottomSheetHandle } from '../../../../components/ui/bottom-sheet/ContentBottomSheet'
import { ProfileFullSheet, type ProfileFullSheetHandle } from '../../../../components/ui/bottom-sheet/ProfileFullSheet'
import { RenameBottomSheet, type RenameBottomSheetHandle } from '../../../../components/ui/bottom-sheet/RenameBottomSheet'
import { ContextMenu } from '../../../../components/ui/menu/ContextMenu'
import { MenuItem } from '../../../../components/ui/menu/MenuItem'
import { ModalHeader } from '../../../../components/ui/modal/ModalHeader'
import { ModalShell } from '../../../../components/ui/modal/ModalShell'
import type { UserProfile } from '../../../auth/services/auth.service'
import { AdministratorModal } from '../../../../pages/AdminPage'
import { SettingsModal, type SettingsSectionId } from '../../../../pages/SettingsPage'
import type { useChatFolders } from '../../hooks/useChatFolders'
import type { ChatFolder, ChatThread } from '../../types'
import { isMobileViewport } from '../../../../utils/mobile'
import { ChatBetaNoticeDialog } from './ChatBetaNoticeDialog'
import { ChatIntroductionDialog } from './ChatIntroductionDialog'
import type { IntroductionEditorValue } from '../../../settings/components/IntroductionEditor'
import { NewsFeedModal } from '../../../news/components/NewsFeedModal'
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
  chatTourEligible: boolean
  isLearnPathsButtonDisabled: boolean
  profileFullSheetRef: RefObject<ProfileFullSheetHandle | null>
  newsFullSheetRef: RefObject<ProfileFullSheetHandle | null>
  betaNoticeSheetRef: RefObject<ContentBottomSheetHandle | null>
  mobileSheetMode: 'closed' | 'profile' | 'settings'
  setMobileSheetMode: (mode: 'closed' | 'profile' | 'settings') => void
  isSettingsMounted: boolean
  isSettingsVisible: boolean
  settingsInitialSection: SettingsSectionId
  isAdminMounted: boolean
  isAdminVisible: boolean
  isNewsMounted: boolean
  isNewsVisible: boolean
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
  folderNameSheetMode: 'create' | { renameFolderId: string } | null
  folderNameDraft: string
  setFolderNameDraft: (value: string) => void
  isFolderNameSheetOpen: boolean
  isFolderNameModalVisible: boolean
  editingThread: ChatThread | null
  isRenameVisible: boolean
  renameDraft: string
  setRenameDraft: (value: string) => void
  onCloseSettings: () => void
  onCloseAdmin: () => void
  onCloseNews: () => void
  onNewsSheetExitComplete: () => void
  onOpenSettings: (section?: SettingsSectionId) => void
  onOpenAdmin: () => void
  onCloseBetaNotice: () => void
  onBetaNoticeSheetExitComplete: () => void
  onNavigateLearn: () => void
  onLogout: () => void | Promise<void>
  onShowLearnUnavailable: () => void
  onCloseThreadMenu: () => void
  onCloseFolderMenu: () => void
  onOpenFolderMove: (threadId: string) => void
  onOpenRenameThread: (thread: ChatThread) => void
  onArchiveThread: (threadId: string) => void | Promise<void>
  onDeleteThread: (threadId: string) => void | Promise<void>
  onLeaveSharedThread: (threadId: string) => void | Promise<void>
  onMoveThreadToFolder: (threadId: string, folderId: string | null) => void | Promise<void>
  onCloseFolderMove: () => void
  onOpenRenameFolderSheet: (folder: ChatFolder) => void
  onDeleteFolder: (folderId: string) => void | Promise<void>
  onCloseFolderName: () => void
  onFolderNameSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onCloseRenameModal: () => void
  onRenameSheetClosed: () => void
  onRenameSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
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
    chatTourEligible,
    isLearnPathsButtonDisabled,
    profileFullSheetRef,
    newsFullSheetRef,
    betaNoticeSheetRef,
    mobileSheetMode,
    setMobileSheetMode,
    isSettingsMounted,
    isSettingsVisible,
    settingsInitialSection,
    isAdminMounted,
    isAdminVisible,
    isNewsMounted,
    isNewsVisible,
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
    isFolderNameSheetOpen,
    isFolderNameModalVisible,
    editingThread,
    isRenameVisible,
    renameDraft,
    setRenameDraft,
    onCloseSettings,
    onCloseAdmin,
    onCloseNews,
    onNewsSheetExitComplete,
    onOpenSettings,
    onOpenAdmin,
    onCloseBetaNotice,
    onBetaNoticeSheetExitComplete,
    onNavigateLearn,
    onLogout,
    onShowLearnUnavailable,
    onCloseThreadMenu,
    onCloseFolderMenu,
    onOpenFolderMove,
    onOpenRenameThread,
    onArchiveThread,
    onDeleteThread,
    onLeaveSharedThread,
    onMoveThreadToFolder,
    onCloseFolderMove,
    onOpenRenameFolderSheet,
    onDeleteFolder,
    onCloseFolderName,
    onFolderNameSubmit,
    onCloseRenameModal,
    onRenameSheetClosed,
    onRenameSubmit,
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
                {profile?.is_superadmin ? <span className="account-admin-badge">Admin</span> : null}
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
                <button
                  type="button"
                  className={`profile-full-sheet-row${chatTourEligible ? ' chat-onboarding-tour-block' : ''}${
                    isLearnPathsButtonDisabled ? ' is-disabled' : ''
                  }`}
                  aria-disabled={isLearnPathsButtonDisabled}
                  onClick={() => {
                    if (isLearnPathsButtonDisabled) {
                      onShowLearnUnavailable()
                      return
                    }
                    setMobileSheetMode('closed')
                    onNavigateLearn()
                  }}
                >
                  <span className="profile-full-sheet-row-label">
                    Lernpfade
                    <span className="chat-dev-badge">In Entwicklung</span>
                  </span>
                  <span className="profile-full-sheet-row-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
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

      {isSettingsMounted && !isCompactMobileSidebarLayout ? (
        <ModalShell isOpen={isSettingsVisible} onRequestClose={onCloseSettings}>
          <SettingsModal variant="modal" onClose={onCloseSettings} initialSection={settingsInitialSection} />
        </ModalShell>
      ) : null}
      {isAdminMounted ? (
        <ModalShell isOpen={isAdminVisible} closeOnOverlayClick={false}>
          <AdministratorModal onClose={onCloseAdmin} />
        </ModalShell>
      ) : null}
      {isNewsMounted && !isCompactMobileSidebarLayout ? (
        <NewsFeedModal
          isOpen={isNewsVisible}
          onClose={onCloseNews}
          isAdmin={profile?.is_superadmin === true}
          variant="modal"
        />
      ) : null}
      {isCompactMobileSidebarLayout && isNewsMounted ? (
        <ProfileFullSheet
          ref={newsFullSheetRef}
          open={isNewsMounted}
          onClose={onNewsSheetExitComplete}
          title="Updates & Neuigkeiten"
          bodyClassName="news-feed-sheet-body-wrap is-news-mode"
        >
          <NewsFeedModal
            variant="sheet"
            sheetRef={newsFullSheetRef}
            isOpen={isNewsVisible}
            onClose={onNewsSheetExitComplete}
            isAdmin={profile?.is_superadmin === true}
          />
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
        <ContextMenu
          ref={menuWrapperRef}
          className="thread-menu-context-global"
          style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}
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
        </ContextMenu>
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
              id: 'rename-folder',
              label: 'Umbenennen',
              iconSrc: editIcon,
              onClick: () => {
                const folder = chatFolders.folders.find((item) => item.id === openFolderMenuId)
                if (folder) {
                  onOpenRenameFolderSheet(folder)
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
        <ContextMenu
          ref={folderMenuWrapperRef}
          className="thread-menu-context-global"
          style={{ left: folderContextMenuPosition.x, top: folderContextMenuPosition.y }}
        >
          <MenuItem
            iconSrc={editIcon}
            onClick={() => {
              const folder = chatFolders.folders.find((item) => item.id === openFolderMenuId)
              if (folder) {
                onOpenRenameFolderSheet(folder)
              }
            }}
          >
            Umbenennen
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
        </ContextMenu>
      ) : null}

      {chatFoldersFeatureEnabled && isFolderNameSheetOpen && isCompactMobileSidebarLayout ? (
        <RenameBottomSheet
          open
          onClose={onCloseFolderName}
          heading={folderNameSheetMode === 'create' ? 'Neuer Ordner' : 'Ordner umbenennen'}
          inputLabel="Ordnername"
          inputId="chat-folder-name-input"
          value={folderNameDraft}
          onChange={setFolderNameDraft}
          placeholder="z. B. Arbeit"
          saveLabel={folderNameSheetMode === 'create' ? 'Erstellen' : 'Speichern'}
          onSubmit={onFolderNameSubmit}
        />
      ) : chatFoldersFeatureEnabled && isFolderNameSheetOpen ? (
        <ModalShell isOpen={isFolderNameModalVisible} onRequestClose={onCloseFolderName}>
          <section
            className="rename-modal"
            role="dialog"
            aria-modal="true"
            aria-label={folderNameSheetMode === 'create' ? 'Neuer Ordner' : 'Ordner umbenennen'}
          >
            <ModalHeader
              title={folderNameSheetMode === 'create' ? 'Neuer Ordner' : 'Ordner umbenennen'}
              headingLevel="h3"
              className="rename-modal-header"
              onClose={onCloseFolderName}
              closeLabel={
                folderNameSheetMode === 'create' ? 'Neuer Ordner schließen' : 'Ordner umbenennen schließen'
              }
            />
            <form className="rename-form" onSubmit={onFolderNameSubmit}>
              <label htmlFor="chat-folder-name-input">Ordnername</label>
              <input
                id="chat-folder-name-input"
                type="text"
                value={folderNameDraft}
                onChange={(event) => setFolderNameDraft(event.target.value)}
                placeholder="z. B. Arbeit"
                autoFocus
              />
              <div className="rename-actions">
                <PrimaryButton type="submit" disabled={!folderNameDraft.trim()}>
                  {folderNameSheetMode === 'create' ? 'Erstellen' : 'Speichern'}
                </PrimaryButton>
              </div>
            </form>
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
