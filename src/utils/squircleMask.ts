export interface SquircleMaskOptions {
  /** Corner radius in px. */
  radius?: number
  /** Superellipse exponent — higher = flatter/more "squircle" (iOS icons ≈ 5), 2 = plain circle. */
  smoothing?: number
  /** Straight-line samples per corner quarter; higher = smoother curve. */
  steps?: number
}

const DEFAULT_RADIUS = 25
const DEFAULT_SMOOTHING = 5
const DEFAULT_STEPS = 10

/**
 * Builds a squircle outline for a `width`×`height` box as an SVG path.
 * Each corner is a superellipse quarter (not a circular arc) anchored so the
 * radius stays exactly `radius`px regardless of the box's aspect ratio —
 * unlike a stretched `mask-size: 100% 100%` image, corners never distort.
 */
function buildSquirclePathData(
  width: number,
  height: number,
  radius: number,
  smoothing: number,
  steps: number,
): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  if (r < 0.5) {
    return `M0 0H${width}V${height}H0Z`
  }
  const exp = 2 / smoothing
  const points: string[] = []

  const corner = (ox: number, oy: number, e1x: number, e1y: number, e2x: number, e2y: number) => {
    for (let i = 1; i < steps; i++) {
      const t = (i / steps) * (Math.PI / 2)
      const c = Math.cos(t) ** exp * r
      const s = Math.sin(t) ** exp * r
      const x = ox + e1x * c + e2x * s
      const y = oy + e1y * c + e2y * s
      points.push(`${x.toFixed(2)} ${y.toFixed(2)}`)
    }
  }

  points.push(`${r.toFixed(2)} 0`, `${(width - r).toFixed(2)} 0`)
  corner(width, 0, -1, 0, 0, 1)
  points.push(`${width.toFixed(2)} ${r.toFixed(2)}`, `${width.toFixed(2)} ${(height - r).toFixed(2)}`)
  corner(width, height, 0, -1, -1, 0)
  points.push(`${(width - r).toFixed(2)} ${height.toFixed(2)}`, `${r.toFixed(2)} ${height.toFixed(2)}`)
  corner(0, height, 1, 0, 0, -1)
  points.push(`0 ${(height - r).toFixed(2)}`, `0 ${r.toFixed(2)}`)
  corner(0, 0, 0, 1, 1, 0)

  return `M${points.join('L')}Z`
}

function buildSquircleMaskUrl(width: number, height: number, options: SquircleMaskOptions): string {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const d = buildSquirclePathData(
    w,
    h,
    options.radius ?? DEFAULT_RADIUS,
    options.smoothing ?? DEFAULT_SMOOTHING,
    options.steps ?? DEFAULT_STEPS,
  )
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><path d="${d}" fill="#fff"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/**
 * Applies a per-element squircle mask sized to its actual box (via the caller's
 * ResizeObserver measurement) — real superellipse curves, fixed px corner radius,
 * no non-uniform stretching. Works cross-browser (CSS `mask-image`), unlike the
 * Chromium-only `corner-shape` property.
 */
export function applySquircleMask(
  el: HTMLElement,
  width: number,
  height: number,
  options: SquircleMaskOptions = {},
): void {
  if (width <= 0 || height <= 0) return
  const value = `url("${buildSquircleMaskUrl(width, height, options)}")`
  el.style.setProperty('mask-image', value)
  el.style.setProperty('-webkit-mask-image', value)
  el.style.setProperty('mask-size', '100% 100%')
  el.style.setProperty('-webkit-mask-size', '100% 100%')
  el.style.setProperty('mask-repeat', 'no-repeat')
  el.style.setProperty('-webkit-mask-repeat', 'no-repeat')
}
