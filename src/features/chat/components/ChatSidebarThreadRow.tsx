import type { CSSProperties, ReactNode, TouchEvent as ReactTouchEvent } from 'react'
import type { ChatThread } from '../types'
import { ChatThreadSwipeRow } from './ChatThreadSwipeRow'

export type ChatSidebarThreadRowProps = {
  thread: ChatThread
  threadIndex: number
  activeThreadId: string | null
  openMenuThreadId: string | null
  swipeOpenThreadId: string | null
  pressingThreadId: string | null
  canSwipeDeleteThread: boolean
  longPressHandlers: {
    onTouchStart: (event: ReactTouchEvent<HTMLElement>) => void
    onTouchMove: (event: ReactTouchEvent<HTMLElement>) => void
    onTouchEnd: (event: ReactTouchEvent<HTMLElement>) => void
    onTouchCancel: (event: ReactTouchEvent<HTMLElement>) => void
  }
  onContextMenu: (event: React.MouseEvent, threadId: string) => void
  onSwipeOpen: (threadId: string) => void
  onSwipeClose: (threadId: string) => void
  onSelect: (threadId: string) => void
  onSwipeDeleteStart: () => void
  onDelete: (threadId: string) => void
  onSwipeGestureStart: () => void
}

export function ChatSidebarThreadRow({
  thread,
  threadIndex,
  activeThreadId,
  openMenuThreadId,
  swipeOpenThreadId,
  pressingThreadId,
  canSwipeDeleteThread,
  longPressHandlers,
  onContextMenu,
  onSwipeOpen,
  onSwipeClose,
  onSelect,
  onSwipeDeleteStart,
  onDelete,
  onSwipeGestureStart,
}: ChatSidebarThreadRowProps) {
  return (
    <div
      style={{ '--chat-thread-enter-index': threadIndex } as CSSProperties}
      className={`chat-thread-row ${thread.id === activeThreadId ? 'is-active' : ''} ${
        openMenuThreadId === thread.id ? 'has-open-menu' : ''
      } ${pressingThreadId === thread.id ? 'is-long-press-active' : ''} ${
        swipeOpenThreadId === thread.id ? 'has-swipe-open' : ''
      } ${thread.isTemporary ? 'is-temporary' : ''} ${thread.isRemoving ? 'is-removing' : ''}`}
      onContextMenu={(event) => onContextMenu(event, thread.id)}
      {...(canSwipeDeleteThread ? {} : longPressHandlers)}
    >
      <ChatThreadSwipeRow
        enabled={canSwipeDeleteThread}
        isSwipeOpen={swipeOpenThreadId === thread.id}
        isActive={thread.id === activeThreadId}
        isRemoving={thread.isRemoving}
        onSwipeOpen={() => onSwipeOpen(thread.id)}
        onSwipeClose={() => onSwipeClose(thread.id)}
        onSelect={() => onSelect(thread.id)}
        onSwipeDeleteStart={onSwipeDeleteStart}
        onDelete={() => onDelete(thread.id)}
        onSwipeGestureStart={onSwipeGestureStart}
        onContextMenu={(event) => onContextMenu(event, thread.id)}
        longPressTouchHandlers={canSwipeDeleteThread ? longPressHandlers : undefined}
      >
        <span className="chat-thread-title">{thread.title}</span>
      </ChatThreadSwipeRow>
    </div>
  )
}

export type RenderChatSidebarThreadRow = (thread: ChatThread, threadIndex: number) => ReactNode
