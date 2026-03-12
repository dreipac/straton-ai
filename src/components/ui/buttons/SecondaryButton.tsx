import type { ButtonHTMLAttributes } from 'react'

type SecondaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement>

export function SecondaryButton({ className, children, ...buttonProps }: SecondaryButtonProps) {
  const classes = ['ui-button', 'ui-button-secondary', className ?? ''].filter(Boolean).join(' ')

  return (
    <button className={classes} {...buttonProps}>
      {children}
    </button>
  )
}
