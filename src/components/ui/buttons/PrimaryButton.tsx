import type { ButtonHTMLAttributes } from 'react'

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement>

export function PrimaryButton({ className, children, ...buttonProps }: PrimaryButtonProps) {
  const classes = ['ui-button', 'ui-button-primary', className ?? ''].filter(Boolean).join(' ')

  return (
    <button className={classes} {...buttonProps}>
      {children}
    </button>
  )
}
