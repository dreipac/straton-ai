import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
  type TransitionEvent,
} from 'react'

/** Feste Bildschirmkoordinate — für Menüs, die dort aufgehen, wo geklickt wurde (Rechtsklick, Longpress). */
export type PopoverMenuPoint = { x: number; y: number }

/** Etwas mehr als die Ausblenddauer in `menus.css`; greift nur, wenn kein `transitionend` kommt. */
const CLOSE_FALLBACK_MS = 260

export type PopoverMenuProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Mit Koordinate steht das Menü fest im Viewport, ohne hängt es am umgebenden Element. */
  position?: PopoverMenuPoint | null
  /** Klappt nach oben statt nach unten auf — für Auslöser am unteren Bildschirmrand. */
  direction?: 'down' | 'up'
  /** Bündig zum linken (`start`) oder rechten (`end`) Rand des Auslösers. Nur ohne `position`. */
  align?: 'start' | 'end'
  /** `listbox` für Auswahlmenüs, deren Einträge `role="option"` tragen. */
  role?: 'menu' | 'listbox'
  ariaLabel?: string
  className?: string
  style?: CSSProperties
  /**
   * Bereich, in dem Klicks das Menü nicht schliessen — üblicherweise der öffnende Knopf oder dessen
   * Umhüllung. Ohne diese Angabe würde ein Klick auf den Knopf erst schliessen und der folgende
   * `click` sofort wieder öffnen.
   */
  anchorRef?: RefObject<HTMLElement | null>
}

/**
 * Das Aufklappmenü der App — eine Hülle für alle Fälle: Rechtsklick-Menüs, die Dropdowns in der
 * Composer-Leiste und die Auswahlfelder in den Einstellungen. Sie bringt die Einblend-Animation,
 * das Schliessen per Klick daneben oder Escape und das verzögerte Aushängen aus dem DOM mit, damit
 * die Ausblend-Animation noch zu Ende läuft.
 *
 * Der weitergereichte Ref zeigt auf das Menü selbst; einige Aufrufer prüfen damit von aussen, ob ein
 * Klick im Menü lag.
 */
export const PopoverMenu = forwardRef<HTMLDivElement, PopoverMenuProps>(function PopoverMenu(
  {
    open,
    onClose,
    children,
    position,
    direction = 'down',
    align = 'start',
    role = 'menu',
    ariaLabel = 'Kontextmenü',
    className,
    style,
    anchorRef,
  },
  ref,
) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menuVisible, setMenuVisible] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  /* Koordinatenmenüs brauchen die Position, Ankermenüs nicht — deshalb hier beides zusammenfassen. */
  const isPlaced = position === undefined || position !== null
  const shouldOpen = open && isPlaced

  /* Umschlagen wird noch im selben Rendern verarbeitet statt in einem Effekt: Beim Schliessen bleibt
     das Menü eingehängt, bis die Ausblendung durch ist. */
  const [wasOpen, setWasOpen] = useState(shouldOpen)
  if (wasOpen !== shouldOpen) {
    setWasOpen(shouldOpen)
    setMenuVisible(false)
    setIsClosing(wasOpen)
  }

  /* Erst einhängen, dann im nächsten Frame sichtbar schalten — sonst startet der Übergang nicht,
     weil Anfangs- und Endzustand im selben Frame gesetzt würden. */
  useEffect(() => {
    if (!shouldOpen) {
      return
    }
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setMenuVisible(true))
    })
    return () => cancelAnimationFrame(frame)
  }, [shouldOpen])

  /* Normalerweise hängt `transitionend` das Menü aus. Ist die Animation abgeschaltet
     (`prefers-reduced-motion`), feuert kein Übergang — dann räumt diese Frist auf. */
  useEffect(() => {
    if (!isClosing) {
      return
    }
    const timer = window.setTimeout(() => setIsClosing(false), CLOSE_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [isClosing])

  useEffect(() => {
    if (!open) {
      return
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (menuRef.current?.contains(target) ?? false) {
        return
      }
      if (anchorRef?.current?.contains(target) ?? false) {
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
  }, [anchorRef, onClose, open])

  function setNode(node: HTMLDivElement | null) {
    menuRef.current = node
    if (typeof ref === 'function') {
      ref(node)
    } else if (ref) {
      ;(ref as MutableRefObject<HTMLDivElement | null>).current = node
    }
  }

  function handleTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.currentTarget !== event.target) {
      return
    }
    if (event.propertyName !== 'opacity' && event.propertyName !== 'transform') {
      return
    }
    if (!menuVisible) {
      setIsClosing(false)
    }
  }

  /* Ohne Platzierung gibt es nichts zu zeigen — auch nicht als Ausblendung. */
  if (!isPlaced || (!shouldOpen && !isClosing)) {
    return null
  }

  const classes = [
    'thread-menu',
    'popover-menu',
    position ? 'popover-menu--fixed' : 'popover-menu--anchored',
    position ? '' : `popover-menu--${align}`,
    `popover-menu--${direction}`,
    menuVisible ? 'is-visible' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={setNode}
      className={classes}
      style={position ? { left: position.x, top: position.y, ...style } : style}
      role={role}
      aria-label={ariaLabel}
      onTransitionEnd={handleTransitionEnd}
    >
      {children}
    </div>
  )
})
