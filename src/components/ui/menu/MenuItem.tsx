import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { MaskIcon } from '../MaskIcon'

type MenuItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  iconSrc?: string
  danger?: boolean
}

export function MenuItem({ iconSrc, danger = false, className, children, ...buttonProps }: MenuItemProps) {
  const classes = ['thread-menu-item', danger ? 'is-danger' : '', className ?? ''].filter(Boolean).join(' ')

  return (
    <button type="button" className={classes} {...buttonProps}>
      {iconSrc ? <img className="ui-icon thread-menu-item-icon" src={iconSrc} alt="" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

type MenuRadioItemProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  checked: boolean
  /** Einfarbige Vorlage links vor der Beschriftung; siehe `MaskIcon`. */
  iconSrc?: string
  /** Eigene Farbe für das Zeichen, etwa eine Markenfarbe; ohne Angabe die Textfarbe der Zeile. */
  iconColor?: string
  children: ReactNode
}

/**
 * Eintrag einer Auswahl innerhalb eines Menüs: Zeichen und Beschriftung stehen links, der Haken des
 * gewählten Eintrags rechts aussen. Die Beschriftung nimmt den Platz dazwischen ein, damit die
 * Zeilen ohne Haken genauso stehen wie die gewählte.
 */
export function MenuRadioItem({
  checked,
  iconSrc,
  iconColor,
  className,
  children,
  ...buttonProps
}: MenuRadioItemProps) {
  const classes = ['thread-menu-item', checked ? 'is-selected' : '', className ?? ''].filter(Boolean).join(' ')

  return (
    <button type="button" role="menuitemradio" aria-checked={checked} className={classes} {...buttonProps}>
      {iconSrc ? <MaskIcon src={iconSrc} color={iconColor} className="thread-menu-item-mask-icon" /> : null}
      <span className="thread-menu-item-label">{children}</span>
      {checked ? <span className="thread-menu-item-check" aria-hidden="true" /> : null}
    </button>
  )
}
