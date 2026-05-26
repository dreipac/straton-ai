import { memo, useRef, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react'
import deleteIcon from '../../../assets/icons/delete.svg'
import { useChatThreadSwipeDelete } from '../hooks/useChatThreadSwipeDelete'

export type ChatThreadSwipeRowProps = {
  enabled: boolean
  isSwipeOpen: boolean
  isActive: boolean
  isRemoving?: boolean
  onSwipeOpen: () => void
  onSwipeClose: () => void
  onSelect: () => void
  onSwipeDeleteStart: () => void
  onDelete: () => void
  onSwipeGestureStart?: () => void
  onContextMenu?: (event: React.MouseEvent) => void
  longPressTouchHandlers?: {
    onTouchStart?: (event: ReactTouchEvent<HTMLElement>) => void
    onTouchMove?: (event: ReactTouchEvent<HTMLElement>) => void
    onTouchEnd?: (event: ReactTouchEvent<HTMLElement>) => void
    onTouchCancel?: (event: ReactTouchEvent<HTMLElement>) => void
  }
  children: ReactNode
}

export const ChatThreadSwipeRow = memo(function ChatThreadSwipeRow({
  enabled,
  isSwipeOpen,
  isActive,
  isRemoving,
  onSwipeOpen,
  onSwipeClose,
  onSelect,
  onSwipeDeleteStart,
  onDelete,
  onSwipeGestureStart,
  onContextMenu,
  longPressTouchHandlers,
  children,
}: ChatThreadSwipeRowProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const swipe = useChatThreadSwipeDelete({
    enabled,
    isOpen: isSwipeOpen,
    hostRef,
    panelRef,
    onOpen: onSwipeOpen,
    onClose: onSwipeClose,
    onSwipeDeleteStart,
    onDeleteTap: onDelete,
    onDeleteFullSwipe: onDelete,
    onSwipeGestureStart,
  })

  if (!enabled) {
    return (
      <div
        className={`chat-thread-item ${isActive ? 'is-active' : ''}`}
        onClick={onSelect}
        onContextMenu={onContextMenu}
        {...longPressTouchHandlers}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      ref={hostRef}
      className={[
        'chat-thread-swipe-host',
        isRemoving ? 'is-removing-panel' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--thread-swipe-offset': '0px',
          '--thread-swipe-progress': '0',
          '--thread-swipe-underlay-scale': '0',
        } as React.CSSProperties
      }
    >
      <div className="chat-thread-swipe-underlay" aria-hidden="true" />
      <button
        type="button"
        className="chat-thread-swipe-delete-btn"
        aria-label="Chat löschen"
        onClick={(event) => {
          event.stopPropagation()
          swipe.onDeleteButtonClick()
        }}
      >
        <img className="ui-icon chat-thread-swipe-delete-icon" src={deleteIcon} alt="" />
      </button>
      <div
        ref={panelRef}
        className="chat-thread-swipe-panel"
        onClick={() => {
          if (swipe.getOffsetPx() > 6) {
            swipe.snapClosed()
            return
          }
          onSelect()
        }}
        onContextMenu={onContextMenu}
        onTouchStart={(event) => longPressTouchHandlers?.onTouchStart?.(event)}
        onTouchMove={(event) => longPressTouchHandlers?.onTouchMove?.(event)}
        onTouchEnd={(event) => longPressTouchHandlers?.onTouchEnd?.(event)}
        onTouchCancel={(event) => longPressTouchHandlers?.onTouchCancel?.(event)}
      >
        <div className={`chat-thread-item ${isActive ? 'is-active' : ''}`}>{children}</div>
      </div>
    </div>
  )
})
