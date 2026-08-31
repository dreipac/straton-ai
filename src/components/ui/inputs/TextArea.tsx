import { forwardRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

/**
 * Globale mehrzeilige Eingabe — nutzt `.ui-textarea` (theme-tokens in ui.css).
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className, ...props },
  ref,
) {
  const classes = ['ui-textarea', className].filter(Boolean).join(' ')
  return <textarea ref={ref} className={classes} {...props} />
})
