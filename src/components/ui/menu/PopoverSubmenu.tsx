import type { ReactNode } from 'react'
import { MaskIcon } from '../MaskIcon'

export type PopoverSubmenuProps = {
  /** Beschriftung der Zeile im übergeordneten Menü. */
  label: ReactNode
  /** Dezent rechts vor dem Pfeil — üblicherweise der aktuell gewählte Wert. */
  value?: ReactNode
  /** Einfarbige Vorlage links vor der Beschriftung; siehe `MaskIcon`. */
  iconSrc?: string
  ariaLabel: string
  children: ReactNode
  className?: string
}

/**
 * Eine Menüzeile, die rechts daneben ein weiteres Menü aufklappt. Das Öffnen übernimmt CSS über
 * `:hover`/`:focus-within` — es gibt also keinen Zustand und nichts zu schliessen. Ein unsichtbarer
 * Streifen zwischen Zeile und Untermenü hält den Weg mit der Maus offen.
 */
export function PopoverSubmenu({
  label,
  value,
  iconSrc,
  ariaLabel,
  children,
  className,
}: PopoverSubmenuProps) {
  return (
    <div className={['popover-submenu-wrap', className ?? ''].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="thread-menu-item popover-submenu-trigger"
        role="menuitem"
        aria-haspopup="menu"
      >
        {iconSrc ? <MaskIcon src={iconSrc} className="thread-menu-item-mask-icon" /> : null}
        <span className="popover-submenu-trigger-label">{label}</span>
        {value != null ? <span className="popover-submenu-trigger-value">{value}</span> : null}
        <span className="popover-submenu-chevron" aria-hidden="true" />
      </button>
      <div className="thread-menu popover-submenu" role="menu" aria-label={ariaLabel}>
        {children}
      </div>
    </div>
  )
}
