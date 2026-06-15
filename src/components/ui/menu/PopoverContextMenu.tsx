import {
  forwardRef,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
  type TransitionEvent,
} from 'react'

type PopoverContextMenuProps = {
  open: boolean
  position: { x: number; y: number } | null
  onClose: () => void
  children: ReactNode
  className?: string
  style?: CSSProperties
  ariaLabel?: string
}

export const PopoverContextMenu = forwardRef<HTMLDivElement, PopoverContextMenuProps>(
  function PopoverContextMenu(
    { open, position, onClose, children, className, style, ariaLabel = 'Kontextmenü' },
    ref,
  ) {
    const [menuInDom, setMenuInDom] = useState(false)
    const [menuVisible, setMenuVisible] = useState(false)

    useEffect(() => {
      if (open && position) {
        setMenuInDom(true)
        const frame = requestAnimationFrame(() => {
          requestAnimationFrame(() => setMenuVisible(true))
        })
        return () => cancelAnimationFrame(frame)
      }
      setMenuVisible(false)
    }, [open, position])

    useEffect(() => {
      if (!open) {
        return
      }
      function handlePointerDown(event: MouseEvent) {
        const menu = ref && 'current' in ref ? ref.current : null
        if (menu?.contains(event.target as Node)) {
          return
        }
        onClose()
      }
      function handleKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
          onClose()
        }
      }
      document.addEventListener('mousedown', handlePointerDown)
      document.addEventListener('keydown', handleKeyDown)
      return () => {
        document.removeEventListener('mousedown', handlePointerDown)
        document.removeEventListener('keydown', handleKeyDown)
      }
    }, [onClose, open, ref])

    function handleTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
      if (event.currentTarget !== event.target) {
        return
      }
      if (event.propertyName !== 'opacity' && event.propertyName !== 'transform') {
        return
      }
      if (!menuVisible && menuInDom) {
        setMenuInDom(false)
      }
    }

    if (!menuInDom || !position) {
      return null
    }

    const classes = [
      'thread-menu',
      'thread-menu-popover',
      'thread-menu-context-global',
      menuVisible ? 'is-visible' : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div
        ref={ref}
        className={classes}
        style={{ left: position.x, top: position.y, ...style }}
        role="menu"
        aria-label={ariaLabel}
        onTransitionEnd={handleTransitionEnd}
      >
        {children}
      </div>
    )
  },
)
