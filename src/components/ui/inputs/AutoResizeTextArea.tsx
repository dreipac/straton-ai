import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ChangeEventHandler,
} from 'react'
import { TextArea, type TextAreaProps } from './TextArea'

type AutoResizeTextAreaProps = TextAreaProps & {
  /** Optional: danach intern scrollen statt weiter wachsen. */
  maxHeightPx?: number
}

function adjustAutoResizeTextArea(el: HTMLTextAreaElement, maxHeightPx?: number) {
  el.style.height = '0px'
  const contentHeight = el.scrollHeight
  const nextHeight = maxHeightPx != null ? Math.min(contentHeight, maxHeightPx) : contentHeight
  el.style.height = `${nextHeight}px`
  el.style.overflowY = maxHeightPx != null && contentHeight > maxHeightPx ? 'auto' : 'hidden'
}

export const AutoResizeTextArea = forwardRef<HTMLTextAreaElement, AutoResizeTextAreaProps>(
  function AutoResizeTextArea(
    { maxHeightPx, className, value, onChange, ...props },
    forwardedRef,
  ) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null)

    useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement)

    const syncHeight = useCallback(() => {
      const el = innerRef.current
      if (!el) {
        return
      }
      adjustAutoResizeTextArea(el, maxHeightPx)
    }, [maxHeightPx])

    useLayoutEffect(() => {
      syncHeight()
    }, [syncHeight, value])

    useLayoutEffect(() => {
      const el = innerRef.current
      if (!el || typeof ResizeObserver === 'undefined') {
        return
      }
      const observer = new ResizeObserver(() => {
        syncHeight()
      })
      observer.observe(el)
      return () => observer.disconnect()
    }, [syncHeight])

    const handleChange: ChangeEventHandler<HTMLTextAreaElement> = (event) => {
      onChange?.(event)
      adjustAutoResizeTextArea(event.currentTarget, maxHeightPx)
    }

    const classes = ['ui-textarea--auto-grow', className].filter(Boolean).join(' ')

    return (
      <TextArea
        ref={innerRef}
        className={classes}
        rows={1}
        value={value}
        onChange={handleChange}
        {...props}
      />
    )
  },
)
