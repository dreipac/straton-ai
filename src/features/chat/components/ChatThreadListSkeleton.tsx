import type { CSSProperties, TransitionEvent } from 'react'

const SKELETON_BAR_WIDTHS = [68, 42, 74, 36, 58, 82, 44, 70, 38, 62] as const

type ChatThreadListSkeletonProps = {
  rowCount?: number
  exiting?: boolean
  onExitTransitionEnd?: (event: TransitionEvent<HTMLDivElement>) => void
}

export function ChatThreadListSkeleton({
  rowCount = 9,
  exiting = false,
  onExitTransitionEnd,
}: ChatThreadListSkeletonProps) {
  function handleTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.currentTarget !== event.target) {
      return
    }
    if (event.propertyName !== 'opacity') {
      return
    }
    onExitTransitionEnd?.(event)
  }

  return (
    <div
      className={`chat-thread-list-skeleton${exiting ? ' is-exiting' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy={!exiting}
      aria-label="Chats werden geladen"
      onTransitionEnd={handleTransitionEnd}
    >
      {Array.from({ length: rowCount }, (_, index) => (
        <div
          key={index}
          className="chat-thread-list-skeleton-row"
          style={
            {
              '--chat-skeleton-enter-index': index,
            } as CSSProperties
          }
        >
          <span
            className="chat-thread-list-skeleton-bar"
            style={{ width: `${SKELETON_BAR_WIDTHS[index % SKELETON_BAR_WIDTHS.length]}%` }}
            aria-hidden="true"
          />
        </div>
      ))}
    </div>
  )
}
