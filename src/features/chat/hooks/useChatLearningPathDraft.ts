import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ChatMessage } from '../types'
import {
  summarizeChatForLearningPath,
  type ChatLearnDraftContext,
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
  const [learningPathDraftProficiency, setLearningPathDraftProficiency] = useState<ChatLearnProficiency | ''>('')
  const [learningPathDraftName, setLearningPathDraftName] = useState('Neuer Lernpfad')
  const [learnFeatureInfoVisible, setLearnFeatureInfoVisible] = useState(false)

  useEffect(() => {
    if (learningPathDraftTimerRef.current !== null) {
      window.clearTimeout(learningPathDraftTimerRef.current)
      learningPathDraftTimerRef.current = null
    }
    setLearningPathDraftOpen(false)
    setLearningPathDraftLoading(false)
    setLearningPathDraftStep('proficiency')
    setLearningPathDraftContext(null)
    setLearningPathDraftFiles([])
    setLearningPathDraftImages(0)
    setLearningPathDraftProficiency('')
    setLearningPathDraftName('Neuer Lernpfad')
  }, [activeThreadId])

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

  const openLearningPathDraft = useCallback(() => {
    if (isLearnPathCreateButtonDisabled) {
      showLearnFeatureUnavailableInfo()
      return
    }
    if (!activeThreadId) {
      pushToast('Bitte zuerst einen Chat auswählen.')
      return
    }
    const snapshot = summarizeChatForLearningPath(messages)
    setLearningPathDraftOpen(true)
    setLearningPathDraftLoading(true)
    setLearningPathDraftStep('proficiency')
    setLearningPathDraftContext(null)
    setLearningPathDraftFiles([])
    setLearningPathDraftImages(0)
    setLearningPathDraftName('Neuer Lernpfad')
    if (learningPathDraftTimerRef.current !== null) {
      window.clearTimeout(learningPathDraftTimerRef.current)
      learningPathDraftTimerRef.current = null
    }
    learningPathDraftTimerRef.current = window.setTimeout(() => {
      setLearningPathDraftContext(snapshot)
      setLearningPathDraftFiles(snapshot.fileNames)
      setLearningPathDraftImages(snapshot.imageCount)
      setLearningPathDraftLoading(false)
      learningPathDraftTimerRef.current = null
    }, 1300)
  }, [activeThreadId, isLearnPathCreateButtonDisabled, messages, pushToast, showLearnFeatureUnavailableInfo])

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
    navigate('/learn', {
      state: {
        fromChatLearningDraft: {
          name,
          proficiency: learningPathDraftProficiency,
          context: learningPathDraftContext,
          sourceThreadId: activeThreadId,
          createdAt: new Date().toISOString(),
        },
      },
    })
  }, [
    activeThreadId,
    learningPathDraftContext,
    learningPathDraftName,
    learningPathDraftProficiency,
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
    proceedToLearnPageFromChatDraft,
  }
}
