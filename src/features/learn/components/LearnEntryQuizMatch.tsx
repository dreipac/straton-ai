import { useCallback, useMemo } from 'react'
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

function parseAssignment(value: string, n: number): (number | null)[] {
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (parts.length !== n) {
    return Array.from({ length: n }, () => null)
  }
  const nums = parts.map((p) => Number.parseInt(p, 10))
  if (nums.some((x) => Number.isNaN(x) || x < 0 || x >= n) || new Set(nums).size !== n) {
    return Array.from({ length: n }, () => null)
  }
  return nums
}

export function LearnEntryQuizMatch(props: LearnEntryQuizMatchProps) {
  const { questionId, matchLeft, matchRight, value, disabled, onChange } = props
  const n = matchLeft.length
  const assignments = useMemo(() => parseAssignment(value, n), [value, n])

  const poolOrder = useMemo(() => shuffleIndices(n, `${questionId}-pool`), [n, questionId])

  const emit = useCallback(
    (next: (number | null)[]) => {
      if (next.every((x) => x !== null)) {
        onChange(next.map((x) => String(x)).join(','))
      } else {
        onChange('')
      }
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
    event.dataTransfer.setData('application/x-match-idx', String(originalIndex))
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const handleDropOnRow =
    (rowIndex: number) => (event: DragEvent) => {
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
      next[rowIndex] = originalIndex
      emit(next)
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
  }

  const clearRow = (rowIndex: number) => {
    if (disabled) {
      return
    }
    const next = [...assignments]
    next[rowIndex] = null
    emit(next)
  }

  const complete = assignments.every((x) => x !== null)

  return (
    <div className="learn-entry-test-match" data-complete={complete ? 'true' : 'false'}>
      <p className="learn-entry-test-match-hint">Ziehe die rechten Karten per Drag-and-Drop auf die passende Zeile links.</p>
      <div className="learn-entry-test-match-layout">
        <div className="learn-entry-test-match-column learn-entry-test-match-column--left" aria-label="Begriffe">
          {matchLeft.map((label, rowIndex) => (
            <div key={`L-${rowIndex}`} className="learn-entry-test-match-row">
              <div className="learn-entry-test-match-left-label">
                <span className="learn-entry-test-match-left-index">{rowIndex + 1}.</span>
                <span>{label}</span>
              </div>
              <div
                className={`learn-entry-test-match-drop ${assignments[rowIndex] !== null ? 'is-filled' : ''}`}
                onDragOver={handleDragOver}
                onDrop={handleDropOnRow(rowIndex)}
              >
                {assignments[rowIndex] !== null ? (
                  <button
                    type="button"
                    className="learn-entry-test-match-card learn-entry-test-match-card--assigned"
                    draggable={!disabled}
                    onDragStart={handleDragStart(assignments[rowIndex]!)}
                    onClick={() => clearRow(rowIndex)}
                    disabled={disabled}
                  >
                    {matchRight[assignments[rowIndex]!]}
                  </button>
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
              <button
                key={`p-${origIdx}`}
                type="button"
                className="learn-entry-test-match-card learn-entry-test-match-card--pool"
                draggable={!disabled}
                onDragStart={handleDragStart(origIdx)}
                disabled={disabled}
              >
                {matchRight[origIdx]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
