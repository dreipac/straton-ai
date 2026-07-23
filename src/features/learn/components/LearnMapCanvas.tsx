import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { SyllabusEntry, TopicSession } from '../services/learn.persistence'
import { buildTopicMapList, type LearnMapTopicItem } from '../utils/learnMapLayout'

export type LearnMapCanvasProps = {
  syllabus: SyllabusEntry[]
  topicSessions: TopicSession[]
  effectiveTopic: string
  /** Themen-Index, zu dem beim Öffnen einmalig gescrollt wird. */
  focusTopicIndex: number
  onOpenTopic: (topicIndex: number) => void
}

const HIGHLIGHT_MS = 1400

function substepKey(topicIndex: number, substepIndex: number): string {
  return `${topicIndex}-${substepIndex}`
}

/** Vorherigen Status je Thema/Teilschritt einsammeln — Basis für den Übergangs-Diff (siehe unten). */
function snapshotStatuses(topics: LearnMapTopicItem[]) {
  const topicStatus = new Map<number, string>()
  const substepStatus = new Map<string, string>()
  for (const topic of topics) {
    topicStatus.set(topic.topicIndex, topic.status)
    for (const substep of topic.substeps) {
      substepStatus.set(substepKey(topic.topicIndex, substep.index), substep.status)
    }
  }
  return { topicStatus, substepStatus }
}

/** Flache Zeilenliste für die Darstellung: Themen UND Teilschritte teilen sich EINE durchgehende
 *  Schiene (Linie + Punkt), sonst zentriert sich der Themen-Punkt über den ganzen (wachsenden)
 *  Block aus Name + Teilschritten statt exakt auf Höhe des Themennamens zu bleiben. */
type LearnMapRow =
  | { kind: 'topic'; topic: LearnMapTopicItem }
  | { kind: 'substep'; topicIndex: number; substep: LearnMapTopicItem['substeps'][number] }

function buildRows(topics: LearnMapTopicItem[]): LearnMapRow[] {
  const rows: LearnMapRow[] = []
  for (const topic of topics) {
    rows.push({ kind: 'topic', topic })
    for (const substep of topic.substeps) {
      rows.push({ kind: 'substep', topicIndex: topic.topicIndex, substep })
    }
  }
  return rows
}

type LearnMapRowStatus = 'done' | 'current' | 'upcoming'

function rowStatus(row: LearnMapRow): LearnMapRowStatus {
  if (row.kind === 'substep') {
    return row.substep.status
  }
  return row.topic.status === 'mastered' ? 'done' : row.topic.status === 'active' ? 'current' : 'upcoming'
}

/** "Erreicht" = der Weg bis hierhin wurde schon zurückgelegt (fertig oder gerade aktiv). */
function isReached(status: LearnMapRowStatus): boolean {
  return status !== 'upcoming'
}

/** Landkarte: schlichte, vertikal scrollende Themen-Zeitleiste (kein Canvas/Pan/Zoom mehr). */
export function LearnMapCanvas(props: LearnMapCanvasProps) {
  const { syllabus, topicSessions, effectiveTopic, focusTopicIndex, onOpenTopic } = props

  const topics = useMemo(
    () => buildTopicMapList(syllabus, topicSessions, effectiveTopic),
    [syllabus, topicSessions, effectiveTopic],
  )
  const rows = useMemo(() => buildRows(topics), [topics])

  const itemRefs = useRef(new Map<number, HTMLLIElement>())
  const hasScrolledRef = useRef(false)

  useEffect(() => {
    const element = itemRefs.current.get(focusTopicIndex)
    if (!element) {
      return
    }
    element.scrollIntoView({ block: 'center', behavior: hasScrolledRef.current ? 'smooth' : 'auto' })
    hasScrolledRef.current = true
  }, [focusTopicIndex])

  // --- Leichte Hervorhebung bei echten Statuswechseln (gesperrt→aktiv, aktiv→gemeistert,
  // offen→aktuell/fertig) — reiner Status-Diff, keine Kamera-/Timing-Choreografie mehr.
  // Der Diff läuft bewusst direkt im Render als „Zustand anpassen, wenn sich Props ändern"
  // (vorheriger Stand in useState, nicht in einem Ref — Effekte dürfen hier keine Refs während
  // des Renderns lesen/schreiben und kein setState synchron im Effekt-Rumpf aufrufen). Nur das
  // verzögerte Zurücksetzen nach HIGHLIGHT_MS läuft als echter Effekt (setState im
  // setTimeout-Callback, nicht direkt im Effekt-Rumpf). ---
  const [prevTopics, setPrevTopics] = useState<LearnMapTopicItem[] | null>(null)
  const [highlightedTopics, setHighlightedTopics] = useState<Set<number>>(new Set())
  const [highlightedSubsteps, setHighlightedSubsteps] = useState<Set<string>>(new Set())
  const [pendingClear, setPendingClear] = useState<{ topics: Set<number>; substeps: Set<string> } | null>(null)

  if (topics !== prevTopics) {
    const previousTopics = prevTopics
    setPrevTopics(topics)
    if (previousTopics) {
      const prevSnapshot = snapshotStatuses(previousTopics)
      const nextSnapshot = snapshotStatuses(topics)
      const changedTopics = new Set<number>()
      nextSnapshot.topicStatus.forEach((status, topicIndex) => {
        const before = prevSnapshot.topicStatus.get(topicIndex)
        if (before !== undefined && before !== status) {
          changedTopics.add(topicIndex)
        }
      })
      const changedSubsteps = new Set<string>()
      nextSnapshot.substepStatus.forEach((status, key) => {
        const before = prevSnapshot.substepStatus.get(key)
        if (before !== undefined && before !== status) {
          changedSubsteps.add(key)
        }
      })
      if (changedTopics.size > 0 || changedSubsteps.size > 0) {
        setHighlightedTopics((current) => new Set([...current, ...changedTopics]))
        setHighlightedSubsteps((current) => new Set([...current, ...changedSubsteps]))
        setPendingClear({ topics: changedTopics, substeps: changedSubsteps })
      }
    }
  }

  // Jedes Highlight-Ereignis bekommt einen eigenen, unabhängigen Timer (kein Effekt-Cleanup, das
  // an das nächste Ereignis gekoppelt ist) — sonst würde ein neuer Statuswechsel den Timer eines
  // noch laufenden älteren Highlights abbrechen und dieses bliebe dauerhaft hervorgehoben.
  const activeTimeoutsRef = useRef<number[]>([])

  useEffect(() => {
    if (!pendingClear) {
      return
    }
    const timeout = window.setTimeout(() => {
      setHighlightedTopics((current) => {
        const next = new Set(current)
        pendingClear.topics.forEach((index) => next.delete(index))
        return next
      })
      setHighlightedSubsteps((current) => {
        const next = new Set(current)
        pendingClear.substeps.forEach((key) => next.delete(key))
        return next
      })
    }, HIGHLIGHT_MS)
    activeTimeoutsRef.current.push(timeout)
  }, [pendingClear])

  useEffect(() => {
    const timeouts = activeTimeoutsRef.current
    return () => {
      timeouts.forEach((timeout) => window.clearTimeout(timeout))
    }
  }, [])

  return (
    <div className="learn-map-canvas">
      <ol className="learn-map-plan">
        {rows.map((row, listIndex) => {
          const isFirst = listIndex === 0
          const isLast = listIndex === rows.length - 1
          const rowStyle = { '--lm-row-index': Math.min(listIndex, 16) } as CSSProperties
          // Ein Segment ist gefüllt, sobald der Weg bis DAHIN zurückgelegt ist — die obere Hälfte
          // richtet sich nach dieser Zeile selbst, die untere nach der NÄCHSTEN (sonst entsteht ein
          // Farbbruch genau an der Nahtstelle, z. B. Thema noch „aktuell", aber Teilschritt 1
          // darunter schon „fertig" — dort muss die Linie durchgehend gefüllt sein).
          const thisReached = isReached(rowStatus(row))
          const nextRow = rows[listIndex + 1]
          const nextReached = nextRow ? isReached(rowStatus(nextRow)) : thisReached
          const lineFillClass = `${thisReached ? ' is-line-top-filled' : ''}${
            nextReached ? ' is-line-bottom-filled' : ''
          }`

          if (row.kind === 'substep') {
            const { topicIndex, substep } = row
            const key = substepKey(topicIndex, substep.index)
            const isSubstepClickable = substep.status === 'done' || substep.status === 'current'
            const isHighlighted = highlightedSubsteps.has(key)

            return (
              <li
                key={`substep-${key}`}
                className={`learn-map-plan-item learn-map-plan-item--substep is-${substep.status}${
                  isFirst ? ' is-first' : ''
                }${isLast ? ' is-last' : ''}${isHighlighted ? ' is-highlighted' : ''}${lineFillClass}`}
                style={rowStyle}
              >
                <span className="learn-map-plan-rail" aria-hidden="true">
                  <span className="learn-map-plan-line learn-map-plan-line--top" />
                  <span className={`learn-map-plan-dot learn-map-plan-dot--substep is-${substep.status}`} />
                  <span className="learn-map-plan-line learn-map-plan-line--bottom" />
                </span>
                <div className="learn-map-plan-body">
                  {isSubstepClickable ? (
                    <button
                      type="button"
                      className="learn-map-plan-name learn-map-plan-name--substep"
                      onClick={() => onOpenTopic(topicIndex)}
                    >
                      <span className="learn-map-plan-name-title">{substep.title}</span>
                    </button>
                  ) : (
                    <span className="learn-map-plan-name learn-map-plan-name--substep is-static">
                      <span className="learn-map-plan-name-title">{substep.title}</span>
                    </span>
                  )}
                </div>
              </li>
            )
          }

          const { topic } = row
          const isCurrent = topic.status === 'active'
          const isClickable = topic.status !== 'locked'
          const isHighlighted = highlightedTopics.has(topic.topicIndex)
          const dotStatus = rowStatus(row)

          return (
            <li
              key={`topic-${topic.topicIndex}`}
              ref={(el) => {
                if (el) {
                  itemRefs.current.set(topic.topicIndex, el)
                } else {
                  itemRefs.current.delete(topic.topicIndex)
                }
              }}
              className={`learn-map-plan-item is-${dotStatus}${isFirst ? ' is-first' : ''}${
                isLast ? ' is-last' : ''
              }${isHighlighted ? ' is-highlighted' : ''}${lineFillClass}`}
              style={rowStyle}
            >
              <span className="learn-map-plan-rail" aria-hidden="true">
                <span className="learn-map-plan-line learn-map-plan-line--top" />
                <span className={`learn-map-plan-dot is-${dotStatus}`}>{dotStatus === 'done' ? '✓' : ''}</span>
                <span className="learn-map-plan-line learn-map-plan-line--bottom" />
              </span>
              <div className="learn-map-plan-body">
                {isCurrent ? (
                  <button
                    type="button"
                    className="learn-map-plan-current-card"
                    onClick={() => onOpenTopic(topic.topicIndex)}
                    aria-label={`Kapitel öffnen: ${topic.title}`}
                  >
                    <span className="learn-map-plan-current-copy">
                      <span className="learn-map-plan-current-title">{topic.title}</span>
                      {topic.scorePercent !== null ? (
                        <span className="learn-map-plan-score">Ø {topic.scorePercent}%</span>
                      ) : null}
                    </span>
                    <span className="learn-map-plan-current-arrow" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="learn-map-plan-name"
                    disabled={!isClickable}
                    onClick={() => isClickable && onOpenTopic(topic.topicIndex)}
                  >
                    <span className="learn-map-plan-name-title">{topic.title}</span>
                    {topic.scorePercent !== null ? (
                      <span className="learn-map-plan-score">Ø {topic.scorePercent}%</span>
                    ) : null}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
