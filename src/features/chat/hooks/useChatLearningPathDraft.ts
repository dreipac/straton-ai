import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listMessagesByThreadIds } from '../services/chat.persistence'
import type { ChatFolderFileRecord } from '../services/chat.folderFiles'
import type { ChatMessage, ChatThread } from '../types'
import {
  summarizeChatForLearningPath,
  summarizeFolderForLearningPath,
  type ChatLearnDraftContext,
  type ChatLearnDraftMaterial,
  type ChatLearnDraftStep,
  type ChatLearnProficiency,
} from '../components/chat-page/chatPageLearnDraft'

type UseChatLearningPathDraftArgs = {
  activeThreadId: string | null
  messages: ChatMessage[]
  isLearnPathCreateButtonDisabled: boolean
  pushToast: (message: string) => void
}

export function useChatLearningPathDraft({
  activeThreadId,
  messages,
  isLearnPathCreateButtonDisabled,
  pushToast,
}: UseChatLearningPathDraftArgs) {
  const navigate = useNavigate()
  const learningPathDraftTimerRef = useRef<number | null>(null)
  const learnFeatureInfoTimerRef = useRef<number | null>(null)

  const [learningPathDraftOpen, setLearningPathDraftOpen] = useState(false)
  const [learningPathDraftLoading, setLearningPathDraftLoading] = useState(false)
  const [learningPathDraftStep, setLearningPathDraftStep] = useState<ChatLearnDraftStep>('proficiency')
  const [learningPathDraftContext, setLearningPathDraftContext] = useState<ChatLearnDraftContext | null>(null)
  const [learningPathDraftFiles, setLearningPathDraftFiles] = useState<string[]>([])
  const [learningPathDraftImages, setLearningPathDraftImages] = useState(0)
  const [learningPathDraftMaterials, setLearningPathDraftMaterials] = useState<ChatLearnDraftMaterial[]>([])
  const [learningPathDraftSourceFolderId, setLearningPathDraftSourceFolderId] = useState<string | null>(null)
  const [learningPathDraftSourceThreadId, setLearningPathDraftSourceThreadId] = useState<string | null>(null)
  const [learningPathDraftProficiency, setLearningPathDraftProficiency] = useState<ChatLearnProficiency | ''>('')
  const [learningPathDraftName, setLearningPathDraftName] = useState('Neuer Lernpfad')
  const [learnFeatureInfoVisible, setLearnFeatureInfoVisible] = useState(false)

  const resetDraftState = useCallback(() => {
    setLearningPathDraftOpen(false)
    setLearningPathDraftLoading(false)
    setLearningPathDraftStep('proficiency')
    setLearningPathDraftContext(null)
    setLearningPathDraftFiles([])
    setLearningPathDraftImages(0)
    setLearningPathDraftMaterials([])
    setLearningPathDraftSourceFolderId(null)
    setLearningPathDraftSourceThreadId(null)
    setLearningPathDraftProficiency('')
    setLearningPathDraftName('Neuer Lernpfad')
  }, [])

  useEffect(() => {
    if (learningPathDraftTimerRef.current !== null) {
      window.clearTimeout(learningPathDraftTimerRef.current)
      learningPathDraftTimerRef.current = null
    }
    if (learningPathDraftSourceFolderId) {
      return
    }
    resetDraftState()
  }, [activeThreadId, learningPathDraftSourceFolderId, resetDraftState])

  useEffect(() => {
    return () => {
      if (learningPathDraftTimerRef.current !== null) {
        window.clearTimeout(learningPathDraftTimerRef.current)
        learningPathDraftTimerRef.current = null
      }
      if (learnFeatureInfoTimerRef.current !== null) {
        window.clearTimeout(learnFeatureInfoTimerRef.current)
      }
    }
  }, [])

  const showLearnFeatureUnavailableInfo = useCallback(() => {
    setLearnFeatureInfoVisible(true)
    if (learnFeatureInfoTimerRef.current !== null) {
      window.clearTimeout(learnFeatureInfoTimerRef.current)
    }
    learnFeatureInfoTimerRef.current = window.setTimeout(() => {
      setLearnFeatureInfoVisible(false)
      learnFeatureInfoTimerRef.current = null
    }, 2200)
  }, [])

  const beginDraftLoading = useCallback(
    (applySnapshot: () => void, defaultName: string) => {
      setLearningPathDraftOpen(true)
      setLearningPathDraftLoading(true)
      setLearningPathDraftStep('proficiency')
      setLearningPathDraftContext(null)
      setLearningPathDraftFiles([])
      setLearningPathDraftImages(0)
      setLearningPathDraftMaterials([])
      setLearningPathDraftProficiency('')
      setLearningPathDraftName(defaultName)
      if (learningPathDraftTimerRef.current !== null) {
        window.clearTimeout(learningPathDraftTimerRef.current)
        learningPathDraftTimerRef.current = null
      }
      learningPathDraftTimerRef.current = window.setTimeout(() => {
        applySnapshot()
        setLearningPathDraftLoading(false)
        learningPathDraftTimerRef.current = null
      }, 1300)
    },
    [],
  )

  const openLearningPathDraft = useCallback(() => {
    if (isLearnPathCreateButtonDisabled) {
      showLearnFeatureUnavailableInfo()
      return
    }
    if (!activeThreadId) {
      pushToast('Bitte zuerst einen Chat auswählen.')
      return
    }
    setLearningPathDraftSourceFolderId(null)
    setLearningPathDraftSourceThreadId(activeThreadId)
    beginDraftLoading(() => {
      const snapshot = summarizeChatForLearningPath(messages)
      setLearningPathDraftContext(snapshot)
      setLearningPathDraftFiles(snapshot.fileNames)
      setLearningPathDraftImages(snapshot.imageCount)
      setLearningPathDraftMaterials([])
    }, 'Neuer Lernpfad')
  }, [
    activeThreadId,
    beginDraftLoading,
    isLearnPathCreateButtonDisabled,
    messages,
    pushToast,
    showLearnFeatureUnavailableInfo,
  ])

  const openFolderLearningPathDraft = useCallback(
    async (args: { folderId: string; folderName: string; threads: ChatThread[]; folderFiles: ChatFolderFileRecord[] }) => {
      if (isLearnPathCreateButtonDisabled) {
        showLearnFeatureUnavailableInfo()
        return
      }
      if (args.threads.length === 0 && args.folderFiles.length === 0) {
        pushToast('Ordner enthält noch keine Chats oder Dateien.')
        return
      }

      setLearningPathDraftSourceFolderId(args.folderId)
      setLearningPathDraftSourceThreadId(null)
      setLearningPathDraftOpen(true)
      setLearningPathDraftLoading(true)
      setLearningPathDraftStep('proficiency')
      setLearningPathDraftContext(null)
      setLearningPathDraftFiles([])
      setLearningPathDraftImages(0)
      setLearningPathDraftMaterials([])
      setLearningPathDraftProficiency('')
      setLearningPathDraftName(`${args.folderName} Lernpfad`)

      try {
        const threadIds = args.threads.map((thread) => thread.id)
        const [allMessages] = await Promise.all([
          threadIds.length > 0 ? listMessagesByThreadIds(threadIds) : Promise.resolve([]),
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, 900)
          }),
        ])
        const materials: ChatLearnDraftMaterial[] = args.folderFiles.map((file) => ({
          id: file.id,
          name: file.name,
          size: file.sizeBytes,
          excerpt: file.excerpt,
        }))
        const summary = summarizeFolderForLearningPath({
          folderName: args.folderName,
          messages: allMessages,
          folderFiles: materials,
          chatCount: args.threads.length,
        })
        setLearningPathDraftContext(summary.context)
        setLearningPathDraftFiles(summary.context.fileNames)
        setLearningPathDraftImages(summary.context.imageCount)
        setLearningPathDraftMaterials(summary.materials)
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Ordner-Inhalte konnten nicht analysiert werden.')
        resetDraftState()
      } finally {
        setLearningPathDraftLoading(false)
      }
    },
    [
      isLearnPathCreateButtonDisabled,
      pushToast,
      resetDraftState,
      showLearnFeatureUnavailableInfo,
    ],
  )

  const proceedToLearnPageFromChatDraft = useCallback(() => {
    const name = learningPathDraftName.trim()
    if (!name) {
      pushToast('Bitte gib einen Namen für den Lernpfad ein.')
      return
    }
    if (!learningPathDraftProficiency) {
      pushToast('Bitte wähle zuerst deine Selbsteinschätzung.')
      return
    }
    navigate('/chat?learn=1', {
      state: {
        fromChatLearningDraft: {
          name,
          proficiency: learningPathDraftProficiency,
          context: learningPathDraftContext,
          materials: learningPathDraftMaterials,
          sourceThreadId: learningPathDraftSourceThreadId,
          sourceFolderId: learningPathDraftSourceFolderId,
          createdAt: new Date().toISOString(),
        },
      },
    })
  }, [
    learningPathDraftContext,
    learningPathDraftMaterials,
    learningPathDraftName,
    learningPathDraftProficiency,
    learningPathDraftSourceFolderId,
    learningPathDraftSourceThreadId,
    navigate,
    pushToast,
  ])

  return {
    learningPathDraftOpen,
    setLearningPathDraftOpen,
    learningPathDraftLoading,
    learningPathDraftStep,
    learningPathDraftContext,
    learningPathDraftFiles,
    learningPathDraftImages,
    learningPathDraftProficiency,
    setLearningPathDraftProficiency,
    learningPathDraftName,
    setLearningPathDraftName,
    setLearningPathDraftStep,
    learnFeatureInfoVisible,
    showLearnFeatureUnavailableInfo,
    openLearningPathDraft,
    openFolderLearningPathDraft,
    proceedToLearnPageFromChatDraft,
  }
}
