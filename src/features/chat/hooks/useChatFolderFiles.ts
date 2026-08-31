import { useCallback, useEffect, useState } from 'react'
import { extractLearningMaterialText } from '../../learn/utils/documentParser'
import { incrementMySubscriptionUsage } from '../../auth/services/subscription.service'
import type { ChatFolderFileRecord } from '../services/chat.folderFiles'
import {
  createChatFolderFile,
  deleteChatFolderFile,
  listChatFolderFiles,
} from '../services/chat.folderFiles'

type UseChatFolderFilesArgs = {
  userId: string | undefined
  folderId: string | null
  maxFiles: number | null
  usedFiles: number
}

export function useChatFolderFiles({ userId, folderId, maxFiles, usedFiles }: UseChatFolderFilesArgs) {
  const [files, setFiles] = useState<ChatFolderFileRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const refreshFiles = useCallback(async () => {
    if (!userId || !folderId) {
      setFiles([])
      return
    }
    setIsLoading(true)
    try {
      const next = await listChatFolderFiles(userId, folderId)
      setFiles(next)
    } finally {
      setIsLoading(false)
    }
  }, [folderId, userId])

  useEffect(() => {
    void refreshFiles()
  }, [refreshFiles])

  const uploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      if (!userId || !folderId) {
        throw new Error('Ordner nicht verfügbar.')
      }
      const incoming = Array.from(fileList)
      if (incoming.length === 0) {
        return
      }
      if (maxFiles !== null && usedFiles + incoming.length > maxFiles) {
        throw new Error('Du hast dein Abo-Limit für Dateien erreicht.')
      }

      setIsUploading(true)
      try {
        const uploaded: ChatFolderFileRecord[] = []
        for (const file of incoming) {
          const excerpt = await extractLearningMaterialText(file)
          const record = await createChatFolderFile({
            userId,
            folderId,
            file,
            excerpt,
            sortOrder: files.length + uploaded.length,
          })
          uploaded.push(record)
        }
        await incrementMySubscriptionUsage({ userId, usedFilesDelta: incoming.length })
        setFiles((prev) => [...prev, ...uploaded])
      } finally {
        setIsUploading(false)
      }
    },
    [files.length, folderId, maxFiles, usedFiles, userId],
  )

  const removeFile = useCallback(async (file: ChatFolderFileRecord) => {
    await deleteChatFolderFile(file)
    setFiles((prev) => prev.filter((entry) => entry.id !== file.id))
  }, [])

  return {
    files,
    isLoading,
    isUploading,
    refreshFiles,
    uploadFiles,
    removeFile,
  }
}
