import type { ReactNode } from 'react'

type ModalShellProps = {
  isOpen: boolean
  children: ReactNode
  className?: string
  onRequestClose?: () => void
  closeOnOverlayClick?: boolean
}

export function ModalShell({
  isOpen,
  children,
  className,
  onRequestClose,
  closeOnOverlayClick = true,
}: ModalShellProps) {
  const classes = ['settings-overlay', 'modal-fade', isOpen ? 'is-open' : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      onClick={(event) => {
        if (!closeOnOverlayClick) {
          return
        }
        if (!onRequestClose) {
          return
        }
        if (event.target !== event.currentTarget) {
          return
        }
        onRequestClose()
      }}
    >
      {children}
    </div>
  )
}
