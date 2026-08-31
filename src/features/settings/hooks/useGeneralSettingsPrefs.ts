import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { UserProfile } from '../../auth/services/auth.service'
import { getAppFeatureFlags } from '../../auth/services/appFeatureFlags.service'
import { CHAT_THREADS_REFRESH_EVENT } from '../../chat/constants/events'
import { deleteEmptyChatThreadsByUserId } from '../../chat/services/chat.persistence'

type UseGeneralSettingsPrefsArgs = {
  user: User | null
  profile: UserProfile | null
  updateAutoRemoveEmptyChats: (enabled: boolean) => Promise<void>
  updateAutoRemoveEmptyLearningPaths: (enabled: boolean) => Promise<void>
  /** Zeigt den dezenten "Gespeichert"-Hinweis im Header. */
  onSaved: () => void
}

/**
 * "Allgemein"-Tab: Chat-Ordner-Feature-Flag, Auto-Löschen-Umschalter für leere Chats/Lernpfade und
 * der "Leere Chats löschen"-Sofort-Aufräumer — aus `SettingsPage.tsx` ausgelagert.
 */
export function useGeneralSettingsPrefs({
  user,
  profile,
  updateAutoRemoveEmptyChats,
  updateAutoRemoveEmptyLearningPaths,
  onSaved,
}: UseGeneralSettingsPrefsArgs) {
  const [chatFoldersFeatureEnabled, setChatFoldersFeatureEnabled] = useState(true)
  const [isUpdatingChatSetting, setIsUpdatingChatSetting] = useState(false)
  const [isUpdatingLearningPathSetting, setIsUpdatingLearningPathSetting] = useState(false)
  const [isCleaningEmptyChats, setIsCleaningEmptyChats] = useState(false)
  const [chatCleanupInfo, setChatCleanupInfo] = useState<string | null>(null)

  const autoRemoveEmptyChats = profile?.auto_remove_empty_chats ?? true
  const autoRemoveEmptyLearningPaths = profile?.auto_remove_empty_learning_paths ?? true

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const flags = await getAppFeatureFlags()
        if (!mounted) {
          return
        }
        setChatFoldersFeatureEnabled(flags.chat_folders_enabled)
      } catch {
        if (!mounted) {
          return
        }
        setChatFoldersFeatureEnabled(true)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  async function handleToggleAutoRemoveEmptyChats() {
    try {
      setIsUpdatingChatSetting(true)
      await updateAutoRemoveEmptyChats(!autoRemoveEmptyChats)
      onSaved()
    } finally {
      setIsUpdatingChatSetting(false)
    }
  }

  async function handleToggleAutoRemoveEmptyLearningPaths() {
    try {
      setIsUpdatingLearningPathSetting(true)
      await updateAutoRemoveEmptyLearningPaths(!autoRemoveEmptyLearningPaths)
      onSaved()
    } finally {
      setIsUpdatingLearningPathSetting(false)
    }
  }

  async function handleCleanupEmptyChats() {
    if (!user) {
      return
    }

    try {
      setIsCleaningEmptyChats(true)
      const deletedCount = await deleteEmptyChatThreadsByUserId(user.id)
      setChatCleanupInfo(
        deletedCount > 0 ? `${deletedCount} leere Chats gelöscht.` : 'Keine leeren Chats gefunden.',
      )
      window.dispatchEvent(new Event(CHAT_THREADS_REFRESH_EVENT))
    } finally {
      setIsCleaningEmptyChats(false)
    }
  }

  return {
    chatFoldersFeatureEnabled,
    autoRemoveEmptyChats,
    isUpdatingChatSetting,
    autoRemoveEmptyLearningPaths,
    isUpdatingLearningPathSetting,
    isCleaningEmptyChats,
    chatCleanupInfo,
    handleToggleAutoRemoveEmptyChats,
    handleToggleAutoRemoveEmptyLearningPaths,
    handleCleanupEmptyChats,
  }
}
