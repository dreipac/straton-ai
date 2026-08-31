import { getSvgPath } from 'figma-squircle'

export interface SquircleShapeOptions {
  /** Corner radius in px. Falls back to the `--squircle-radius` custom property. */
  radius?: number
  /** Corner smoothing 0–1 (figma-squircle scale); higher = flatter/more "squircle" (iOS ≈ 0.6).
   *  Falls back to `--squircle-smoothing`. */
  smoothing?: number
  /** Border thickness in px, drawn as an SVG stroke inset so it stays fully inside the box.
   *  Falls back to `--squircle-border-width`. */
  borderWidth?: number
}

const FILL_VAR = '--squircle-fill'
const STROKE_VAR = '--squircle-stroke'
const RADIUS_VAR = '--squircle-radius'
const SMOOTHING_VAR = '--squircle-smoothing'
const BORDER_WIDTH_VAR = '--squircle-border-width'

const FALLBACK_RADIUS = 16
const FALLBACK_SMOOTHING = 0.6
const FALLBACK_BORDER_WIDTH = 0

function readNumericVar(styles: CSSStyleDeclaration, prop: string, fallback: number): number {
  const parsed = parseFloat(styles.getPropertyValue(prop))
  return Number.isFinite(parsed) ? parsed : fallback
}

function isTransparent(color: string): boolean {
  if (!color || color === 'transparent') return true
  const match = color.match(/rgba?\([^)]*[,/]\s*([\d.]+)\s*\)/i)
  return match ? parseFloat(match[1]) === 0 : false
}

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

function readShapeGeometry(
  styles: CSSStyleDeclaration,
  options: Pick<SquircleShapeOptions, 'radius' | 'smoothing'>,
): { radius: number; smoothing: number } {
  return {
    radius: options.radius ?? readNumericVar(styles, RADIUS_VAR, FALLBACK_RADIUS),
    smoothing: options.smoothing ?? readNumericVar(styles, SMOOTHING_VAR, FALLBACK_SMOOTHING),
  }
}

function buildSquircleBackgroundValue(
  width: number,
  height: number,
  fill: string,
  stroke: string,
  radius: number,
  smoothing: number,
  borderWidth: number,
): string {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const bw = stroke ? Math.max(0, borderWidth) : 0

  /*
   * An SVG stroke straddles its path (half in, half out), so the path is generated for a box
   * shrunk by one full border width and then shifted by half of it — that way the stroke's outer
   * edge lands exactly on the element's edge instead of being clipped away.
   */
  const inset = bw / 2
  const innerW = Math.max(1, w - bw)
  const innerH = Math.max(1, h - bw)
  const cornerRadius = Math.max(0, Math.min(radius - inset, innerW / 2, innerH / 2))
  const d = getSvgPath({ width: innerW, height: innerH, cornerRadius, cornerSmoothing: smoothing })

  const strokeAttrs = bw ? ` stroke="${escapeXmlAttr(stroke)}" stroke-width="${bw}"` : ''
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<path d="${d}" transform="translate(${inset},${inset})" fill="${escapeXmlAttr(fill)}"${strokeAttrs}/>` +
    `</svg>`
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
}

/**
 * Paints an element's fill *and* border as one squircle-shaped SVG `background-image`, sized
 * to its actual box (via the caller's ResizeObserver measurement). Global, reusable: any
 * element can opt in via the `.squircle` class (squircle.css) plus `--squircle-fill` /
 * `--squircle-stroke` — see `useSquircleBorder`, which applies this to every `.squircle`
 * element in the document automatically.
 *
 * A CSS `border` cannot be used here: it always strokes the rectangular `border-radius`
 * contour, which at the corners runs outside the flatter superellipse — so it gets clipped
 * away exactly there. Drawing fill and stroke on the *same* figma-squircle path makes the
 * border follow the curve into the corners by construction.
 *
 * Colors come from the `--squircle-fill` / `--squircle-stroke` custom properties, which must
 * be registered via `@property` with `syntax: '<color>'` (done once in squircle.css) so they
 * resolve to concrete colors — theme values may be nested `var()`s or `color-mix()`, which SVG
 * attributes cannot parse.
 */
export function applySquircleShape(
  el: HTMLElement,
  width: number,
  height: number,
  options: SquircleShapeOptions = {},
): void {
  if (width <= 0 || height <= 0) return
  const styles = getComputedStyle(el)
  const fill = styles.getPropertyValue(FILL_VAR).trim()
  const stroke = styles.getPropertyValue(STROKE_VAR).trim()
  if (isTransparent(fill) && isTransparent(stroke)) return

  const { radius, smoothing } = readShapeGeometry(styles, options)
  const borderWidth = options.borderWidth ?? readNumericVar(styles, BORDER_WIDTH_VAR, FALLBACK_BORDER_WIDTH)

  el.style.setProperty(
    'background-image',
    buildSquircleBackgroundValue(width, height, fill, stroke, radius, smoothing, borderWidth),
  )
  el.style.setProperty('background-size', '100% 100%')
  el.style.setProperty('background-repeat', 'no-repeat')
  el.style.setProperty('background-origin', 'border-box')
}

/**
 * Clips an element — including all its descendants — to a squircle silhouette via `mask-image`,
 * instead of drawing fill+stroke onto its own background. Use this for containers whose children
 * already paint the visible surface edge-to-edge (e.g. a modal with an opaque sidebar/content
 * layout): {@link applySquircleShape}'s fill would be invisible behind them anyway, since
 * `background-image` only paints the element's own background layer, not its children.
 *
 * The existing CSS `border` (if any) is kept as-is here rather than redrawn as a stroke — at this
 * scale (large containers, subtle low-contrast border colors) the sliver clipped away at the very
 * corner tip is not perceptible, and avoids needing a second layer purely for the border color.
 */
export function applySquircleClip(
  el: HTMLElement,
  width: number,
  height: number,
  options: Pick<SquircleShapeOptions, 'radius' | 'smoothing'> = {},
): void {
  if (width <= 0 || height <= 0) return
  const styles = getComputedStyle(el)
  const { radius, smoothing } = readShapeGeometry(styles, options)

  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const cornerRadius = Math.max(0, Math.min(radius, w / 2, h / 2))
  const d = getSvgPath({ width: w, height: h, cornerRadius, cornerSmoothing: smoothing })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><path d="${d}" fill="#fff"/></svg>`
  const value = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`

  el.style.setProperty('mask-image', value)
  el.style.setProperty('-webkit-mask-image', value)
  el.style.setProperty('mask-size', '100% 100%')
  el.style.setProperty('-webkit-mask-size', '100% 100%')
  el.style.setProperty('mask-repeat', 'no-repeat')
  el.style.setProperty('-webkit-mask-repeat', 'no-repeat')
}
