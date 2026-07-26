import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConceptGraphSnapshot } from './useConceptIngestion'
import type { LearnerCardState } from '../engine/types'
import { initialCardState, isCardDue, reviewCard } from '../engine/reviewScheduler'
import { normalizeConceptTag } from '../utils/conceptTag'
import {
  loadCardStates,
  loadLearnCards,
  syncPathLearnCards,
  type NewLearnCard,
} from '../services/learnCards.persistence'
import { reviewCardState } from '../services/learnConceptGraph.persistence'

/** Minimal-Sicht einer generierten Lernkarte, wie sie im Blob-Modell vorliegt. */
export type FlashcardInput = {
  question: string
  answer: string
  skillTag?: string
}

export type UseLearnCardStoreArgs = {
  pathId: string | null
  userId: string | null | undefined
  conceptGraph: ConceptGraphSnapshot
  /** Aktuell im Pfad vorhandene Karten (aus dem Blob-Modell, memoisiert). */
  flashcards: FlashcardInput[]
  /** Vergessens-Rate je Konzept-id (aus dem Lerner-Modell) fuer das SR-Verfall-Tuning. */
  conceptDecayById: Map<string, number>
  /** Nur aktiv, wenn ein Konzept-Netz existiert (sonst reines Legacy-Verhalten, keine DB-Aktion). */
  enabled: boolean
}

export type LearnCardStore = {
  /** SR-Update fuer die Karte mit dieser Frage (fire-and-forget). Persistiert ueber learn_review_card. */
  reviewByQuestion: (question: string, correct: boolean) => void
  /** Vergessens-Rate des Leitkonzepts einer Karte (fuer Verfall-Tuning), oder undefined. */
  decayRateForQuestion: (question: string) => number | undefined
  /** Anzahl faelliger (bereits bewerteter) Karten — fuer die SR-Faelligkeit im Ueben-Tab. */
  dueCount: number
  masteredCardCount: number
  totalCardCount: number
}

function questionKey(question: string): string {
  return question.trim().toLowerCase()
}

/**
 * Persistenter Karten-Store der neuen Architektur (Schicht 5 + Entscheidung 5).
 *
 * Bruecke zwischen dem bestehenden Blob-Karten-Modell und den normalisierten `learn_cards` /
 * `learner_card_states`: generierte Karten werden idempotent (insert-if-new, ohne SR-Verlust) in
 * `learn_cards` gespiegelt und konzept-getaggt; jede Selbstbewertung schreibt einen SM-2-artigen
 * SR-Zustand (`reviewScheduler` → RPC `learn_review_card`). Ohne Konzept-Netz komplett inaktiv.
 */
export function useLearnCardStore(args: UseLearnCardStoreArgs): LearnCardStore {
  const { pathId, userId, conceptGraph, flashcards, conceptDecayById, enabled } = args

  const [cards, setCards] = useState<Array<{ id: string; question: string; conceptIds: string[] }>>([])
  const [statesByCardId, setStatesByCardId] = useState<Map<string, LearnerCardState>>(new Map())
  const lastSyncedKeyRef = useRef<string>('')

  const slugToConcept = useMemo(
    () => new Map(conceptGraph.concepts.map((c) => [c.slug, c])),
    [conceptGraph.concepts],
  )
  const decayByConceptId = conceptDecayById

  // Karten + SR-Zustaende beim Pfadwechsel laden (Reset im async-Pfad, damit kein setState synchron
  // im Effect-Body steht).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!enabled || !pathId) {
        if (!cancelled) {
          setCards([])
          setStatesByCardId(new Map())
          lastSyncedKeyRef.current = ''
        }
        return
      }
      try {
        const loaded = await loadLearnCards(pathId)
        if (cancelled) return
        setCards(loaded.map((c) => ({ id: c.id, question: c.question, conceptIds: c.conceptIds })))
        const states = await loadCardStates(loaded.map((c) => c.id))
        if (cancelled) return
        setStatesByCardId(new Map(states.map((s) => [s.cardId, s])))
      } catch (err) {
        console.error('Lernbereich: Karten/SR-Zustaende konnten nicht geladen werden', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, pathId])

  // Neue Karten idempotent nach learn_cards spiegeln (konzept-getaggt).
  useEffect(() => {
    if (!enabled || !pathId || flashcards.length === 0) {
      return
    }
    const news: NewLearnCard[] = flashcards.map((fc) => {
      const slug = normalizeConceptTag(fc.skillTag)
      const concept = slug ? slugToConcept.get(slug) : undefined
      return {
        pathId,
        conceptIds: concept ? [concept.id] : [],
        question: fc.question,
        answer: fc.answer,
        difficulty: concept?.difficulty ?? 3,
        cardType: 'knowledge',
      }
    })
    const key = news
      .map((n) => questionKey(n.question))
      .filter(Boolean)
      .sort()
      .join('|')
    if (!key || key === lastSyncedKeyRef.current) {
      return
    }
    lastSyncedKeyRef.current = key
    let cancelled = false
    void (async () => {
      try {
        const synced = await syncPathLearnCards(pathId, news)
        if (!cancelled) {
          setCards(synced.map((c) => ({ id: c.id, question: c.question, conceptIds: c.conceptIds })))
        }
      } catch (err) {
        console.error('Lernbereich: Karten konnten nicht persistiert werden', err)
        lastSyncedKeyRef.current = '' // erneuten Versuch beim naechsten Lauf erlauben
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, pathId, flashcards, slugToConcept])

  const cardByQuestion = useMemo(() => {
    const m = new Map<string, { id: string; conceptIds: string[] }>()
    for (const c of cards) {
      m.set(questionKey(c.question), { id: c.id, conceptIds: c.conceptIds })
    }
    return m
  }, [cards])

  const reviewByQuestion = useCallback<LearnCardStore['reviewByQuestion']>(
    (question, correct) => {
      if (!enabled || !userId) {
        return
      }
      const card = cardByQuestion.get(questionKey(question))
      if (!card) {
        return
      }
      const nowIso = new Date().toISOString()
      const conceptDecayRate = card.conceptIds
        .map((id) => decayByConceptId.get(id))
        .find((v): v is number => typeof v === 'number')
      setStatesByCardId((prev) => {
        const current = prev.get(card.id) ?? initialCardState(card.id)
        const next = reviewCard(current, { correct, conceptDecayRate }, nowIso)
        void reviewCardState(userId, next).catch((err) =>
          console.error('Lernbereich: SR-Zustand konnte nicht gespeichert werden', err),
        )
        const m = new Map(prev)
        m.set(card.id, next)
        return m
      })
    },
    [enabled, userId, cardByQuestion, decayByConceptId],
  )

  const decayRateForQuestion = useCallback<LearnCardStore['decayRateForQuestion']>(
    (question) => {
      const card = cardByQuestion.get(questionKey(question))
      if (!card) {
        return undefined
      }
      return card.conceptIds.map((id) => decayByConceptId.get(id)).find((v): v is number => typeof v === 'number')
    },
    [cardByQuestion, decayByConceptId],
  )

  const { dueCount, masteredCardCount } = useMemo(() => {
    const nowIso = new Date().toISOString()
    let due = 0
    let mastered = 0
    for (const s of statesByCardId.values()) {
      if (s.status === 'mastered') {
        mastered += 1
      }
      if (isCardDue(s, nowIso)) {
        due += 1
      }
    }
    return { dueCount: due, masteredCardCount: mastered }
  }, [statesByCardId])

  return {
    reviewByQuestion,
    decayRateForQuestion,
    dueCount,
    masteredCardCount,
    totalCardCount: cards.length,
  }
}
