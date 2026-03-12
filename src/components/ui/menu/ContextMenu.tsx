import { forwardRef, type CSSProperties, type ReactNode } from 'react'

type ContextMenuProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

export const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(function ContextMenu(
  { children, className, style },
  ref,
) {
  const classes = ['thread-menu', className ?? ''].filter(Boolean).join(' ')

  return (
    <div ref={ref} className={classes} style={style}>
      {children}
    </div>
  )
})
