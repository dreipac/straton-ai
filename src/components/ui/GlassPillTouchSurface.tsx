import type { ComponentPropsWithoutRef, ElementType, MouseEvent, ReactElement } from 'react'
import {
  glassPillTouchClass,
  useGlassPillTouchFeedback,
  type GlassPillTouchFeedbackOptions,
} from '../../hooks/useGlassPillTouchFeedback'

type GlassPillTouchVariant = 'default' | 'composer-shell'

type GlassPillTouchSurfaceProps<T extends ElementType> = {
  as?: T
  className?: string
  glassVariant?: GlassPillTouchVariant
  /** false = keine Feder-/Hold-Animation. */
  touchFeedback?: boolean
} & GlassPillTouchFeedbackOptions &
  ComponentPropsWithoutRef<T>

function joinClasses(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

function GlassPillTouchSurfaceWithFeedback<T extends ElementType>({
  Component,
  isButton,
  className,
  variantClass,
  touchFeedbackOptions,
  onClick,
  ...props
}: {
  Component: ElementType
  isButton: boolean
  className?: string
  variantClass: string
  touchFeedbackOptions: GlassPillTouchFeedbackOptions
  onClick?: (event: MouseEvent<HTMLElement>) => void
} & Record<string, unknown>): ReactElement {
  const touch = useGlassPillTouchFeedback(touchFeedbackOptions)

  return (
    <Component
      {...(isButton ? { type: 'button' as const } : {})}
      {...props}
      {...touch.touchHandlers}
      onClick={(event: MouseEvent<HTMLElement>) => {
        if (touch.consumeScrollGestureClick()) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        onClick?.(event)
      }}
      className={glassPillTouchClass(touch, variantClass, className)}
    />
  )
}

export function GlassPillTouchSurface<T extends ElementType = 'button'>({
  as,
  className,
  glassVariant = 'default',
  touchFeedback = true,
  cancelOnVerticalDrag,
  onClick,
  ...props
}: GlassPillTouchSurfaceProps<T>): ReactElement {
  const Component = (as ?? 'button') as ElementType
  const variantClass = glassVariant === 'composer-shell' ? 'glass-pill-touch--composer-shell' : ''
  const isButton = Component === 'button'
  const touchFeedbackOptions: GlassPillTouchFeedbackOptions = { cancelOnVerticalDrag }

  if (!touchFeedback) {
    return (
      <Component
        {...(isButton ? { type: 'button' as const } : {})}
        {...props}
        onClick={onClick}
        className={joinClasses('glass-pill-touch', variantClass, className)}
      />
    )
  }

  return (
    <GlassPillTouchSurfaceWithFeedback
      Component={Component}
      isButton={isButton}
      className={className}
      variantClass={variantClass}
      touchFeedbackOptions={touchFeedbackOptions}
      onClick={onClick}
      {...props}
    />
  )
}
