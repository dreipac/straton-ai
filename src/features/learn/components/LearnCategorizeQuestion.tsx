import { useCallback, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'

type LearnCategorizeQuestionProps = {
  questionId: string
  categories: string[]
  items: string[]
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
 * Komma-getrennt, genau itemCount Felder: Kategorie-Index pro Begriff oder leer = noch nicht einsortiert.
 * Beispiel itemCount=4: "0,,1," = nur Begriff 0 und 2 einsortiert (Teilstand muss anzeigbar sein).
 */
function parseAssignment(value: string, itemCount: number, categoryCount: number): (number | null)[] {
  const trimmed = value.trim()
  if (!trimmed) {
    return Array.from({ length: itemCount }, () => null)
  }
  const rawParts = trimmed.split(',').map((s) => s.trim())
  const out: (number | null)[] = []
  for (let i = 0; i < itemCount; i += 1) {
    const p = rawParts[i] ?? ''
    if (p === '') {
      out.push(null)
      continue
    }
    const num = Number.parseInt(p, 10)
    if (Number.isNaN(num) || num < 0 || num >= categoryCount) {
      out.push(null)
      continue
    }
    out.push(num)
  }
  return out
}

export function LearnCategorizeQuestion(props: LearnCategorizeQuestionProps) {
  const { questionId, categories, items, value, disabled, onChange } = props
  const itemCount = items.length
  const categoryCount = categories.length
  const assignments = useMemo(
    () => parseAssignment(value, itemCount, categoryCount),
    [value, itemCount, categoryCount],
  )
  /** Tap: erst Begriff wählen, dann Kategorie antippen (Touch / Fallback ohne natives DnD). */
  const [tapPick, setTapPick] = useState<number | null>(null)
  const suppressPoolClickRef = useRef(false)

  const poolOrder = useMemo(() => shuffleIndices(itemCount, `${questionId}-cat-pool`), [itemCount, questionId])

  const emit = useCallback(
    (next: (number | null)[]) => {
      onChange(next.map((x) => (x === null ? '' : String(x))).join(','))
    },
    [onChange],
  )

  const unassignedOrdered = useMemo(() => {
    const unassigned = Array.from({ length: itemCount }, (_, i) => i).filter((i) => assignments[i] === null)
    return [...unassigned].sort((a, b) => poolOrder.indexOf(a) - poolOrder.indexOf(b))
  }, [itemCount, assignments, poolOrder])

  const itemsByCategory = useMemo(() => {
    const map: number[][] = Array.from({ length: categoryCount }, () => [])
    for (let i = 0; i < itemCount; i += 1) {
      const cat = assignments[i]
      if (cat !== null && cat >= 0 && cat < categoryCount) {
        map[cat]!.push(i)
      }
    }
    return map
  }, [assignments, categoryCount, itemCount])

  const handleDragStart = (itemIndex: number) => (event: DragEvent) => {
    const s = String(itemIndex)
    event.dataTransfer.setData('text/plain', s)
    event.dataTransfer.setData('application/x-categorize-idx', s)
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

  const assignToCategory = useCallback(
    (categoryIndex: number, itemIndex: number) => {
      if (disabled) {
        return
      }
      if (Number.isNaN(itemIndex) || itemIndex < 0 || itemIndex >= itemCount) {
        return
      }
      const next = [...assignments]
      next[itemIndex] = categoryIndex
      emit(next)
      setTapPick(null)
    },
    [assignments, disabled, emit, itemCount],
  )

  const readDraggedIndex = (event: DragEvent): number => {
    const raw =
      event.dataTransfer.getData('application/x-categorize-idx') || event.dataTransfer.getData('text/plain')
    return Number.parseInt(raw, 10)
  }

  const handleDropOnCategory = (categoryIndex: number) => (event: DragEvent) => {
    event.preventDefault()
    assignToCategory(categoryIndex, readDraggedIndex(event))
  }

  const handleDropOnPool = (event: DragEvent) => {
    event.preventDefault()
    if (disabled) {
      return
    }
    const itemIndex = readDraggedIndex(event)
    if (Number.isNaN(itemIndex) || itemIndex < 0 || itemIndex >= itemCount) {
      return
    }
    const next = [...assignments]
    next[itemIndex] = null
    emit(next)
    setTapPick(null)
  }

  const sendToPool = (itemIndex: number) => {
    if (disabled) {
      return
    }
    const next = [...assignments]
    next[itemIndex] = null
    emit(next)
    setTapPick(null)
  }

  const handlePoolCardClick = (itemIndex: number) => {
    if (disabled || suppressPoolClickRef.current) {
      return
    }
    setTapPick((prev) => (prev === itemIndex ? null : itemIndex))
  }

  const handleCategoryClick = (categoryIndex: number) => {
    if (disabled || tapPick === null) {
      return
    }
    assignToCategory(categoryIndex, tapPick)
  }

  const complete = assignments.every((x) => x !== null)

  return (
    <div className="learn-categorize" data-complete={complete ? 'true' : 'false'}>
      <p className="learn-categorize-hint">
        Ziehe jeden Begriff in die passende Kategorie — oder tippe einen Begriff an und dann die Kategorie (Touch /
        ohne Drag). Mehrere Begriffe pro Kategorie sind erlaubt.
      </p>

      <div
        className="learn-categorize-pool"
        onDragOver={handleDragOver}
        onDrop={handleDropOnPool}
        aria-label="Noch nicht einsortierte Begriffe"
      >
        <span className="learn-categorize-pool-title">Begriffe</span>
        <div className="learn-categorize-pool-cards">
          {unassignedOrdered.length === 0 ? (
            <span className="learn-categorize-pool-empty">Alle Begriffe einsortiert</span>
          ) : (
            unassignedOrdered.map((itemIndex) => (
              <div
                key={`c-${itemIndex}`}
                role="button"
                tabIndex={disabled ? -1 : 0}
                className={`learn-categorize-card learn-categorize-card--pool ${
                  tapPick === itemIndex ? 'is-tap-picked' : ''
                }`}
                draggable={!disabled}
                onDragStart={handleDragStart(itemIndex)}
                onDragEnd={handleDragEnd}
                onClick={() => handlePoolCardClick(itemIndex)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handlePoolCardClick(itemIndex)
                  }
                }}
              >
                {items[itemIndex]}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="learn-categorize-columns">
        {categories.map((category, categoryIndex) => (
          <div
            key={`cat-${categoryIndex}`}
            className={`learn-categorize-column ${tapPick !== null ? 'is-tap-target' : ''}`}
            onDragOver={handleDragOver}
            onDrop={handleDropOnCategory(categoryIndex)}
            onClick={() => handleCategoryClick(categoryIndex)}
            onKeyDown={(e) => {
              if (tapPick !== null && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                handleCategoryClick(categoryIndex)
              }
            }}
            role={tapPick !== null ? 'button' : undefined}
            tabIndex={tapPick !== null && !disabled ? 0 : undefined}
          >
            <span className="learn-categorize-column-title">{category}</span>
            <div className="learn-categorize-column-cards">
              {itemsByCategory[categoryIndex]!.length === 0 ? (
                <span className="learn-categorize-column-placeholder">Hier ablegen</span>
              ) : (
                itemsByCategory[categoryIndex]!.map((itemIndex) => (
                  <div
                    key={`a-${itemIndex}`}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    className="learn-categorize-card learn-categorize-card--assigned"
                    draggable={!disabled}
                    onDragStart={handleDragStart(itemIndex)}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => {
                      e.stopPropagation()
                      sendToPool(itemIndex)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        sendToPool(itemIndex)
                      }
                    }}
                  >
                    {items[itemIndex]}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
