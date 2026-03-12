import type { ReactNode } from 'react'

type ModalShellProps = {
  isOpen: boolean
  children: ReactNode
  className?: string
}

export function ModalShell({ isOpen, children, className }: ModalShellProps) {
  const classes = ['settings-overlay', 'modal-fade', isOpen ? 'is-open' : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  return <div className={classes}>{children}</div>
}
