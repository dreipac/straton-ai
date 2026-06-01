import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { hapticLightImpact } from '../../../utils/haptics'
import type { AssistantSectionReference } from '../utils/assistantSectionReply'
import {
  requestRevealComposerAboveKeyboard,
  requestVisualKeyboardInsetSync,
  waitForVisualKeyboardReady,
} from './useVisualKeyboardInset'

export type UseChatComposerSectionReplyArgs = {
  isMobileComposer: boolean
  inputRef: RefObject<HTMLTextAreaElement | null>
  messagesScrollRef: RefObject<HTMLDivElement | null>
  composerSectionReply: AssistantSectionReference | null
  setComposerSectionReply: (ref: AssistantSectionReference | null) => void
}

export function useChatComposerSectionReply({
  isMobileComposer,
  inputRef,
  messagesScrollRef,
  setComposerSectionReply,
}: UseChatComposerSectionReplyArgs) {
  const sectionReplyEmbedCancelRef = useRef<(() => void) | null>(null)

  const clearSectionReplyEmbedSchedule = useCallback(() => {
    sectionReplyEmbedCancelRef.current?.()
    sectionReplyEmbedCancelRef.current = null
  }, [])

  const ensureMobileComposerVisible = useCallback(() => {
    if (!isMobileComposer) {
      return
    }
    requestRevealComposerAboveKeyboard()
  }, [isMobileComposer])

  const prepareComposerViewportBeforeKeyboard = useCallback(() => {
    if (!isMobileComposer) {
      return
    }
    const scrollEl = messagesScrollRef.current
    if (scrollEl) {
      scrollEl.scrollTop = scrollEl.scrollHeight
    }
    const stack = document.querySelector('.chat-composer-stack')
    if (stack instanceof HTMLElement) {
      stack.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'auto' })
    }
  }, [isMobileComposer, messagesScrollRef])

  const focusComposerForSectionReply = useCallback(
    (options?: { allowScroll?: boolean }) => {
      const input = inputRef.current
      if (!input) {
        return false
      }
      input.focus({ preventScroll: options?.allowScroll !== true })
      if (isMobileComposer) {
        requestVisualKeyboardInsetSync()
      }
      return true
    },
    [inputRef, isMobileComposer],
  )

  const syncComposerLayoutAfterSectionReplyEmbed = useCallback(() => {
    prepareComposerViewportBeforeKeyboard()
    requestVisualKeyboardInsetSync()
    ensureMobileComposerVisible()
    requestAnimationFrame(() => {
      ensureMobileComposerVisible()
      requestVisualKeyboardInsetSync()
    })
  }, [ensureMobileComposerVisible, prepareComposerViewportBeforeKeyboard])

  const handleSectionReplyEmbedSettled = useCallback(() => {
    syncComposerLayoutAfterSectionReplyEmbed()
  }, [syncComposerLayoutAfterSectionReplyEmbed])

  const beginSectionReplyFromSwipe = useCallback(
    (ref: AssistantSectionReference) => {
      hapticLightImpact()
      clearSectionReplyEmbedSchedule()

      if (!isMobileComposer) {
        setComposerSectionReply(ref)
        focusComposerForSectionReply({ allowScroll: false })
        return
      }

      flushSync(() => {
        setComposerSectionReply(ref)
      })

      focusComposerForSectionReply({ allowScroll: true })

      sectionReplyEmbedCancelRef.current = waitForVisualKeyboardReady(() => {
        sectionReplyEmbedCancelRef.current = null
        syncComposerLayoutAfterSectionReplyEmbed()
      })
    },
    [
      clearSectionReplyEmbedSchedule,
      focusComposerForSectionReply,
      isMobileComposer,
      setComposerSectionReply,
      syncComposerLayoutAfterSectionReplyEmbed,
    ],
  )

  useEffect(() => () => clearSectionReplyEmbedSchedule(), [clearSectionReplyEmbedSchedule])

  return {
    clearSectionReplyEmbedSchedule,
    beginSectionReplyFromSwipe,
    handleSectionReplyEmbedSettled,
  }
}
