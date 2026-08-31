import { useEffect, type RefObject } from 'react'
import type { ProfileFullSheetHandle } from '../../../components/ui/bottom-sheet/ProfileFullSheet'

type UseChatPageOverlayDismissArgs = {
  isCompactMobileSidebarLayout: boolean
  mobileSheetMode: 'closed' | 'profile' | 'settings'
  openMenuThreadId: string | null
  openFolderMenuId: string | null
  folderMoveThreadId: string | null
  chatTourEligible: boolean
  menuWrapperRef: RefObject<HTMLDivElement | null>
  threadSheetRef: RefObject<HTMLDivElement | null>
  folderMenuWrapperRef: RefObject<HTMLDivElement | null>
  folderSheetRef: RefObject<HTMLDivElement | null>
  profileMenuRef: RefObject<HTMLDivElement | null>
  profileFullSheetRef: RefObject<ProfileFullSheetHandle | null>
  closeThreadActionMenu: () => void
  closeFolderActionMenu: () => void
  closeFolderMoveDialog: () => void
  setIsMobileSidebarOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  setIsMobileFoldersOpen: (value: boolean | ((prev: boolean) => boolean)) => void
}

export function useChatPageOverlayDismiss({
  isCompactMobileSidebarLayout,
  mobileSheetMode,
  openMenuThreadId,
  openFolderMenuId,
  folderMoveThreadId,
  chatTourEligible,
  menuWrapperRef,
  threadSheetRef,
  folderMenuWrapperRef,
  folderSheetRef,
  profileMenuRef,
  profileFullSheetRef,
  closeThreadActionMenu,
  closeFolderActionMenu,
  closeFolderMoveDialog,
  setIsMobileSidebarOpen,
  setIsMobileFoldersOpen,
}: UseChatPageOverlayDismissArgs) {
  useEffect(() => {
    function handleOutsidePointer(event: MouseEvent | TouchEvent) {
      const compactSheetOpen = isCompactMobileSidebarLayout && mobileSheetMode !== 'closed'
      if (!openMenuThreadId && !openFolderMenuId && !compactSheetOpen) {
        return
      }

      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      const isInsideThreadMenu = menuWrapperRef.current?.contains(target) ?? false
      const isInsideThreadSheet = threadSheetRef.current?.contains(target) ?? false
      const isInsideFolderMenu = folderMenuWrapperRef.current?.contains(target) ?? false
      const isInsideFolderSheet = folderSheetRef.current?.contains(target) ?? false
      const isInsideProfileMenu = profileMenuRef.current?.contains(target) ?? false

      if (!isInsideThreadMenu && !isInsideThreadSheet && openMenuThreadId) {
        closeThreadActionMenu()
      }

      if (!isInsideFolderMenu && !isInsideFolderSheet && openFolderMenuId) {
        closeFolderActionMenu()
      }

      if (!isInsideProfileMenu && compactSheetOpen) {
        const insideSheet = profileFullSheetRef.current?.containsNode(target) ?? false
        if (!insideSheet) {
          profileFullSheetRef.current?.requestClose()
        }
      }
    }

    document.addEventListener('mousedown', handleOutsidePointer)
    document.addEventListener('touchstart', handleOutsidePointer, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer)
      document.removeEventListener('touchstart', handleOutsidePointer)
    }
  }, [
    closeFolderActionMenu,
    closeThreadActionMenu,
    isCompactMobileSidebarLayout,
    mobileSheetMode,
    openFolderMenuId,
    openMenuThreadId,
    folderMenuWrapperRef,
    folderSheetRef,
    menuWrapperRef,
    profileFullSheetRef,
    profileMenuRef,
    threadSheetRef,
  ])

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || chatTourEligible) {
        return
      }
      setIsMobileSidebarOpen(false)
      setIsMobileFoldersOpen(false)
      if (openMenuThreadId) {
        closeThreadActionMenu()
      }
      if (openFolderMenuId) {
        closeFolderActionMenu()
      }
      if (folderMoveThreadId) {
        closeFolderMoveDialog()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [
    chatTourEligible,
    closeFolderActionMenu,
    closeFolderMoveDialog,
    closeThreadActionMenu,
    folderMoveThreadId,
    openFolderMenuId,
    openMenuThreadId,
    setIsMobileFoldersOpen,
    setIsMobileSidebarOpen,
  ])
}
