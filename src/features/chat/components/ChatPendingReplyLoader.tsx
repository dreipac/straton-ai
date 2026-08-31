import { useEffect, useMemo, useState } from 'react'
import type { ChatSendPhaseState } from '../constants/chatSendPhase'
import { getChatSendPhaseStatus } from '../constants/chatSendPhase'

type ChatPendingReplyLoaderProps = {
  statusLabel?: string
  sendPhase?: ChatSendPhaseState
}

/** Timing des Schreibmaschinen-Effekts. Hold absichtlich lang, damit der Text gut lesbar stehen bleibt. */
const TYPE_IN_MS = 34
const TYPE_OUT_MS = 20
const HOLD_MS = 2600
const GAP_MS = 280

/** Trennzeichen zum Zusammenfassen der Phrasen in einen React-Dependency-String. Bewusst kein
 *  Leerzeichen: Phrasen sind mehrwortig («Antwort wird generiert»); ein Leerzeichen als Trenner
 *  wuerde `split` dazu bringen, jedes einzelne Wort als eigene Phrase zu behandeln. Ein NUL-Byte
 *  kommt in echtem Text nicht vor und eignet sich deshalb als sicherer, kollisionsfreier Trenner. */
const PHRASE_SEP = '\u0000'

/** Fisher-Yates — Reihenfolge variiert pro Generierung, fühlt sich «lebendiger» an als die starre Listenfolge. */
function shuffle<T>(input: T[]): T[] {
  const out = input.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * Einzelne Statuszeile, die nacheinander durch die Phrasen tippt: tippend einblenden → halten →
 * tippend ausblenden → nächste Phrase. Reihenfolge wird gemischt, damit es nicht stur wiederholt.
 */
function useTypewriterCycle(phrases: string[], resetKey: string): string {
  const [text, setText] = useState('')
  const phrasesKey = phrases.join(PHRASE_SEP)

  useEffect(() => {
    const pool = phrasesKey ? phrasesKey.split(PHRASE_SEP) : []
    if (pool.length === 0) {
      setText('')
      return
    }

    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    let order = shuffle(pool)
    let idx = 0

    const schedule = (fn: () => void, ms: number) => {
      timers.push(
        setTimeout(() => {
          if (!cancelled) fn()
        }, ms),
      )
    }

    const typeOut = (phrase: string) => {
      let i = phrase.length
      const step = () => {
        i -= 1
        setText(phrase.slice(0, Math.max(0, i)))
        if (i > 0) schedule(step, TYPE_OUT_MS)
        else schedule(nextPhrase, GAP_MS)
      }
      step()
    }

    const typeIn = (phrase: string) => {
      let i = 0
      const step = () => {
        i += 1
        setText(phrase.slice(0, i))
        if (i < phrase.length) schedule(step, TYPE_IN_MS)
        else schedule(() => typeOut(phrase), HOLD_MS)
      }
      step()
    }

    function nextPhrase() {
      if (idx >= order.length) {
        order = pool.length > 1 ? shuffle(pool) : pool
        idx = 0
      }
      const phrase = order[idx]!
      idx += 1
      typeIn(phrase)
    }

    nextPhrase()

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [resetKey, phrasesKey])

  return text
}

/** Ladeanzeige während eine KI-Textantwort generiert wird: Straton-Logoform als Maske, dahinter
 *  ein rotierender Farbverlauf in den Markenfarben — nur innerhalb der Logoform sichtbar, die Form
 *  selbst steht still — daneben eine einzeilige, tippende Statuszeile mit dezentem Schimmer. */
export function ChatPendingReplyLoader({ statusLabel, sendPhase }: ChatPendingReplyLoaderProps) {
  const status =
    getChatSendPhaseStatus(sendPhase, statusLabel) ??
    (statusLabel?.trim() ? getChatSendPhaseStatus(null, statusLabel) : undefined)
  const mainLabel = status?.mainLabel ?? 'Antwort wird generiert'
  const subSteps = status?.subSteps ?? []
  const subStepsKey = subSteps.join(PHRASE_SEP)
  const phrases = useMemo(
    () => [mainLabel, ...(subStepsKey ? subStepsKey.split(PHRASE_SEP) : [])],
    [mainLabel, subStepsKey],
  )
  const resetKey = sendPhase ?? mainLabel
  const text = useTypewriterCycle(phrases, resetKey)

  return (
    <div className="chat-pending-orbit-wrap">
      <div className="chat-pending-logo-loader" role="status" aria-label={mainLabel}>
        <span className="chat-pending-logo-loader-sweep" aria-hidden="true" />
      </div>
      <div className="chat-pending-status-stack" role="status" aria-live="polite">
        <p className="chat-pending-status chat-pending-status-main chat-pending-status-typed">
          <span className="chat-pending-typed-text">{text}</span>
        </p>
      </div>
    </div>
  )
}
