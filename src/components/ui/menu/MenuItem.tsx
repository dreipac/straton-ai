import type { ButtonHTMLAttributes } from 'react'

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
