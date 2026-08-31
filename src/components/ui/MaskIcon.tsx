import type { CSSProperties } from 'react'
import { cssUrl } from '../../utils/assetUrl'

export type MaskIconProps = {
  src: string
  /** Fläche des Zeichens; ohne Angabe die Textfarbe des Umfelds. */
  color?: string
  className?: string
}

/**
 * Einfarbiges Zeichen, das als Maske statt als Bild eingebunden wird: die Vorlage gibt nur die Form
 * vor, die Farbe kommt aus dem CSS. So folgt ein Zeichen der Textfarbe seines Umfelds — über alle
 * Themes und Zustände hinweg — statt in jedem Theme eine eigene Datei zu brauchen.
 *
 * Setzt eine einfarbige Vorlage mit Transparenz voraus; mehrfarbige Bilder verlieren hier ihre
 * Farben und gehören als `<img class="ui-icon">` eingebunden.
 */
export function MaskIcon({ src, color, className }: MaskIconProps) {
  return (
    <span
      className={['mask-icon', className ?? ''].filter(Boolean).join(' ')}
      style={
        {
          '--mask-icon-src': cssUrl(src),
          ...(color ? { '--mask-icon-color': color } : null),
        } as CSSProperties
      }
      aria-hidden="true"
    />
  )
}
