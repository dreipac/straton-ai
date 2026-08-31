import { useEffect, useMemo, useRef, useState } from 'react'
import type { LearnFlashcard } from '../services/learn.persistence'

export type UseLearnFlashcardsDeckArgs = {
  isActive: boolean
  cards: LearnFlashcard[]
  focusCardId?: string | null
  reviewMode?: 'all' | 'due'
}

export function useLearnFlashcardsDeck(args: UseLearnFlashcardsDeckArgs) {
  const { isActive, cards, focusCardId, reviewMode = 'all' } = args
  const cardsKey = useMemo(
    () => cards.map((card) => `${card.id}::${card.nextReviewAt ?? ''}`).join('||'),
    [cards],
  )
  const [state, setState] = useState<{ index: number; isFlipped: boolean; cardsKey: string }>({
    index: 0,
    isFlipped: false,
    cardsKey,
  })

  const prevActiveRef = useRef(false)
  const prevFocusCardIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isActive) {
      prevActiveRef.current = false
      prevFocusCardIdRef.current = null
      return
    }

    const becameActive = !prevActiveRef.current
    prevActiveRef.current = true

    if (!focusCardId || cards.length === 0) {
      prevFocusCardIdRef.current = focusCardId ?? null
      return
    }

    const focusChanged = focusCardId !== prevFocusCardIdRef.current
    prevFocusCardIdRef.current = focusCardId

    if (!becameActive && !focusChanged) {
      return
    }

    const idx = cards.findIndex((c) => c.id === focusCardId)
    if (idx < 0) {
      return
    }
    setState({
      index: idx,
      isFlipped: false,
      cardsKey,
    })
  }, [isActive, focusCardId, cards, cardsKey])

  useEffect(() => {
    if (!isActive || reviewMode !== 'due' || cards.length === 0) {
      return
    }
    setState((prev) => {
      const nextIndex = Math.min(prev.index, cards.length - 1)
      if (prev.cardsKey === cardsKey && nextIndex === prev.index) {
        return prev
      }
      return { index: nextIndex, isFlipped: false, cardsKey }
    })
  }, [cards.length, cardsKey, isActive, reviewMode])

  const isSameDeck = state.cardsKey === cardsKey
  const index = isSameDeck ? state.index : 0
  const isFlipped = isSameDeck ? state.isFlipped : false
  const card = cards[index]
  const total = cards.length
  const canNavigate = total > 1

  function flipCard() {
    setState((prev) => ({
      index,
      cardsKey,
      isFlipped: prev.cardsKey === cardsKey ? !prev.isFlipped : true,
    }))
  }

  function goToPrev() {
    setState({
      index: Math.max(0, index - 1),
      isFlipped: false,
      cardsKey,
    })
  }

  function goToNext() {
    setState({
      index: Math.min(total - 1, index + 1),
      isFlipped: false,
      cardsKey,
    })
  }

  function resetFlipAfterRate() {
    setState((prev) => ({
      ...prev,
      isFlipped: false,
    }))
  }

  return {
    cardsKey,
    index,
    isFlipped,
    card,
    total,
    canNavigate,
    flipCard,
    goToPrev,
    goToNext,
    resetFlipAfterRate,
  }
}
