import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChatFolder, ChatThread } from '../types'
import {
  createChatFolder,
  deleteChatFolder,
  listChatFolders,
  listChatThreadFolderLinks,
  updateChatFolder,
  setChatThreadFolder,
} from '../services/chat.folders'
import { deleteAllChatFolderFilesForFolder } from '../services/chat.folderFiles'

export function useChatFolders(userId: string | undefined, threads: ChatThread[]) {
  const [folders, setFolders] = useState<ChatFolder[]>([])
  const [folderIdByThreadId, setFolderIdByThreadId] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)

  const refreshFolders = useCallback(async () => {
    if (!userId) {
      setFolders([])
      setFolderIdByThreadId({})
      return
    }

    setIsLoading(true)
    try {
      const [nextFolders, nextLinks] = await Promise.all([
        listChatFolders(userId),
        listChatThreadFolderLinks(userId),
      ])
      setFolders(nextFolders)
      setFolderIdByThreadId(nextLinks)
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refreshFolders()
  }, [refreshFolders])

  const threadsWithoutFolder = useMemo(() => {
    return threads.filter((thread) => !folderIdByThreadId[thread.id])
  }, [folderIdByThreadId, threads])

  const threadsByFolderId = useMemo(() => {
    const map = new Map<string, ChatThread[]>()
    for (const folder of folders) {
      map.set(folder.id, [])
    }
    for (const thread of threads) {
      const folderId = folderIdByThreadId[thread.id]
      if (!folderId) {
        continue
      }
      const list = map.get(folderId)
      if (list) {
        list.push(thread)
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }
    return map
  }, [folderIdByThreadId, folders, threads])

  const createFolder = useCallback(
    async (name: string, color?: string | null) => {
      if (!userId) {
        return null
      }
      const folder = await createChatFolder(userId, name, folders.length, color)
      setFolders((prev) => [...prev, folder])
      return folder
    },
    [folders.length, userId],
  )

  const updateFolder = useCallback(
    async (folderId: string, patch: { name: string; color?: string | null }) => {
      const folder = await updateChatFolder(folderId, patch)
      setFolders((prev) => prev.map((item) => (item.id === folderId ? folder : item)))
      return folder
    },
    [],
  )

  const removeFolder = useCallback(async (folderId: string) => {
    if (userId) {
      await deleteAllChatFolderFilesForFolder(userId, folderId)
    }
    await deleteChatFolder(folderId)
    setFolders((prev) => prev.filter((item) => item.id !== folderId))
    setFolderIdByThreadId((prev) => {
      const next = { ...prev }
      for (const [threadId, linkedFolderId] of Object.entries(next)) {
        if (linkedFolderId === folderId) {
          delete next[threadId]
        }
      }
      return next
    })
  }, [userId])

  const moveThreadToFolder = useCallback(
    async (threadId: string, folderId: string | null) => {
      if (!userId) {
        return
      }
      await setChatThreadFolder(userId, threadId, folderId)
      setFolderIdByThreadId((prev) => {
        const next = { ...prev }
        if (folderId === null) {
          delete next[threadId]
        } else {
          next[threadId] = folderId
        }
        return next
      })
    },
    [userId],
  )

  const getThreadFolderId = useCallback(
    (threadId: string) => folderIdByThreadId[threadId] ?? null,
    [folderIdByThreadId],
  )

  return {
    folders,
    folderIdByThreadId,
    threadsWithoutFolder,
    threadsByFolderId,
    isLoading,
    refreshFolders,
    createFolder,
    updateFolder,
    removeFolder,
    moveThreadToFolder,
    getThreadFolderId,
  }
}
