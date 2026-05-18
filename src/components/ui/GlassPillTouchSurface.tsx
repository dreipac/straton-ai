import type { ComponentPropsWithoutRef, ElementType, ReactElement } from 'react'
import { glassPillTouchClass, useGlassPillTouchFeedback } from '../../hooks/useGlassPillTouchFeedback'

type GlassPillTouchVariant = 'default' | 'composer-shell'

type GlassPillTouchSurfaceProps<T extends ElementType> = {
  as?: T
  className?: string
  glassVariant?: GlassPillTouchVariant
} & ComponentPropsWithoutRef<T>

export function GlassPillTouchSurface<T extends ElementType = 'button'>({
  as,
  className,
  glassVariant = 'default',
  ...props
}: GlassPillTouchSurfaceProps<T>): ReactElement {
  const Component = (as ?? 'button') as ElementType
  const touch = useGlassPillTouchFeedback()
  const variantClass = glassVariant === 'composer-shell' ? 'glass-pill-touch--composer-shell' : ''
  const isButton = Component === 'button'

  return (
    <Component
      {...(isButton ? { type: 'button' as const } : {})}
      {...props}
      {...touch.touchHandlers}
      className={glassPillTouchClass(touch, variantClass, className)}
    />
  )
}
