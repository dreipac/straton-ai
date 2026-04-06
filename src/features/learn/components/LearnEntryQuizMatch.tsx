import { useCallback, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'

type LearnEntryQuizMatchProps = {
  questionId: string
  matchLeft: string[]
  matchRight: string[]
  value: string
  disabled: boolean
  onChange: (next: string) => void
}

function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministische Mischung der Pool-Reihenfolge (gleiche Frage = gleiche Anordnung). */
function shuffleIndices(n: number, seed: string): number[] {
  const arr = Array.from({ length: n }, (_, i) => i)
  let state = hashSeed(seed)
  for (let i = n - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) >>> 0
    const j = state % (i + 1)
    const t = arr[i]
    arr[i] = arr[j]!
    arr[j] = t!
  }
  return arr
}

/**
 * Komma-getrennt, genau n Felder: Index der rechten Karte pro Zeile oder leer = noch nicht zugeordnet.
 * Beispiel n=4: "0,,2," = nur Zeile 0 und 2 belegt (Teilstand muss angezeigt werden können).
 */
function parseAssignment(value: string, n: number): (number | null)[] {
  const trimmed = value.trim()
  if (!trimmed) {
    return Array.from({ length: n }, () => null)
  }
  const rawParts = trimmed.split(',').map((s) => s.trim())
  const parts: string[] = []
  for (let i = 0; i < n; i += 1) {
    parts.push(rawParts[i] ?? '')
  }
  const out: (number | null)[] = []
  for (let i = 0; i < n; i += 1) {
    const p = parts[i]!
    if (p === '') {
      out.push(null)
      continue
    }
    const num = Number.parseInt(p, 10)
    if (Number.isNaN(num) || num < 0 || num >= n) {
      return Array.from({ length: n }, () => null)
    }
    out.push(num)
  }
  const used = out.filter((x): x is number => x !== null)
  if (new Set(used).size !== used.length) {
    return Array.from({ length: n }, () => null)
  }
  return out
}

export function LearnEntryQuizMatch(props: LearnEntryQuizMatchProps) {
  const { questionId, matchLeft, matchRight, value, disabled, onChange } = props
  const n = matchLeft.length
  const assignments = useMemo(() => parseAssignment(value, n), [value, n])
  /** Tap: erst Definition wählen, dann leere Zeile antippen (Touch / Fallback ohne natives DnD). */
  const [tapPick, setTapPick] = useState<number | null>(null)
  const suppressPoolClickRef = useRef(false)

  const poolOrder = useMemo(() => shuffleIndices(n, `${questionId}-pool`), [n, questionId])

  const emit = useCallback(
    (next: (number | null)[]) => {
      onChange(next.map((x) => (x === null ? '' : String(x))).join(','))
    },
    [onChange],
  )

  const usedIndices = useMemo(() => new Set(assignments.filter((x): x is number => x !== null)), [assignments])

  const poolOriginalIndices = useMemo(() => {
    const all = Array.from({ length: n }, (_, i) => i).filter((i) => !usedIndices.has(i))
    const orderSet = new Set(poolOrder)
    return [...all].sort((a, b) => {
      const pa = orderSet.has(a) ? poolOrder.indexOf(a) : 999
      const pb = orderSet.has(b) ? poolOrder.indexOf(b) : 999
      return pa - pb
    })
  }, [n, usedIndices, poolOrder])

  const handleDragStart = (originalIndex: number) => (event: DragEvent) => {
    const s = String(originalIndex)
    // text/plain ist in Safari/Chrome zuverlässiger als nur Custom-MIME-Typen
    event.dataTransfer.setData('text/plain', s)
    event.dataTransfer.setData('application/x-match-idx', s)
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    suppressPoolClickRef.current = true
    window.setTimeout(() => {
      suppressPoolClickRef.current = false
    }, 120)
  }

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const assignToRow = useCallback(
    (rowIndex: number, originalIndex: number) => {
      if (disabled) {
        return
      }
      if (Number.isNaN(originalIndex) || originalIndex < 0 || originalIndex >= n) {
        return
      }
      const next = assignments.map((v) => (v === originalIndex ? null : v))
      next[rowIndex] = originalIndex
      emit(next)
      setTapPick(null)
    },
    [assignments, disabled, emit, n],
  )

  const handleDropOnRow =
    (rowIndex: number) => (event: DragEvent) => {
      event.preventDefault()
      const raw = event.dataTransfer.getData('application/x-match-idx') || event.dataTransfer.getData('text/plain')
      const originalIndex = Number.parseInt(raw, 10)
      assignToRow(rowIndex, originalIndex)
    }

  const handleDropOnPool = (event: DragEvent) => {
    event.preventDefault()
    if (disabled) {
      return
    }
    const raw = event.dataTransfer.getData('application/x-match-idx') || event.dataTransfer.getData('text/plain')
    const originalIndex = Number.parseInt(raw, 10)
    if (Number.isNaN(originalIndex) || originalIndex < 0 || originalIndex >= n) {
      return
    }
    const next = assignments.map((v) => (v === originalIndex ? null : v))
    emit(next)
    setTapPick(null)
  }

  const clearRow = (rowIndex: number) => {
    if (disabled) {
      return
    }
    const next = [...assignments]
    next[rowIndex] = null
    emit(next)
    setTapPick(null)
  }

  const handlePoolCardClick = (origIdx: number) => {
    if (disabled || suppressPoolClickRef.current) {
      return
    }
    setTapPick((prev) => (prev === origIdx ? null : origIdx))
  }

  const handleEmptyDropClick = (rowIndex: number) => {
    if (disabled || tapPick === null) {
      return
    }
    assignToRow(rowIndex, tapPick)
  }

  const complete = assignments.every((x) => x !== null)

  return (
    <div className="learn-entry-test-match" data-complete={complete ? 'true' : 'false'}>
      <p className="learn-entry-test-match-hint">
        Ziehe die rechten Karten auf die passende Zeile — oder tippe eine Definition an, dann die leere «Hier ablegen»-Fläche
        (Touch / ohne Drag).
      </p>
      <div className="learn-entry-test-match-layout">
        <div className="learn-entry-test-match-column learn-entry-test-match-column--left" aria-label="Begriffe">
          {matchLeft.map((label, rowIndex) => (
            <div key={`L-${rowIndex}`} className="learn-entry-test-match-row">
              <div className="learn-entry-test-match-left-label">
                <span className="learn-entry-test-match-left-index">{rowIndex + 1}.</span>
                <span>{label}</span>
              </div>
              <div
                className={`learn-entry-test-match-drop ${assignments[rowIndex] !== null ? 'is-filled' : ''} ${
                  assignments[rowIndex] === null && tapPick !== null ? 'is-tap-target' : ''
                }`}
                onDragOver={handleDragOver}
                onDrop={handleDropOnRow(rowIndex)}
                onClick={() => assignments[rowIndex] === null && handleEmptyDropClick(rowIndex)}
                onKeyDown={(e) => {
                  if (assignments[rowIndex] !== null) {
                    return
                  }
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleEmptyDropClick(rowIndex)
                  }
                }}
                role={assignments[rowIndex] === null && tapPick !== null ? 'button' : undefined}
                tabIndex={assignments[rowIndex] === null && tapPick !== null ? 0 : undefined}
              >
                {assignments[rowIndex] !== null ? (
                  <div
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    className="learn-entry-test-match-card learn-entry-test-match-card--assigned"
                    draggable={!disabled}
                    onDragStart={handleDragStart(assignments[rowIndex]!)}
                    onDragEnd={handleDragEnd}
                    onClick={() => clearRow(rowIndex)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        clearRow(rowIndex)
                      }
                    }}
                  >
                    {matchRight[assignments[rowIndex]!]}
                  </div>
                ) : (
                  <span className="learn-entry-test-match-placeholder">Hier ablegen</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div
          className="learn-entry-test-match-column learn-entry-test-match-column--pool"
          onDragOver={handleDragOver}
          onDrop={handleDropOnPool}
          aria-label="Definitionen zum Zuordnen"
        >
          <span className="learn-entry-test-match-pool-title">Definitionen</span>
          <div className="learn-entry-test-match-pool-cards">
            {poolOriginalIndices.map((origIdx) => (
              <div
                key={`p-${origIdx}`}
                role="button"
                tabIndex={disabled ? -1 : 0}
                className={`learn-entry-test-match-card learn-entry-test-match-card--pool ${
                  tapPick === origIdx ? 'is-tap-picked' : ''
                }`}
                draggable={!disabled}
                onDragStart={handleDragStart(origIdx)}
                onDragEnd={handleDragEnd}
                onClick={() => handlePoolCardClick(origIdx)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handlePoolCardClick(origIdx)
                  }
                }}
              >
                {matchRight[origIdx]}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
