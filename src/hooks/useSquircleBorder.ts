import { useEffect } from 'react'
import { applySquircleClip, applySquircleShape } from '../utils/squircleShape'

const SQUIRCLE_SELECTOR = '.squircle'
const SQUIRCLE_CLIP_SELECTOR = '.squircle-clip'
const COMBINED_SELECTOR = `${SQUIRCLE_SELECTOR}, ${SQUIRCLE_CLIP_SELECTOR}`

/**
 * Applies the squircle shape (squircleShape.ts) to every element carrying a `squircle` /
 * `squircle-clip` class, anywhere in the document. Mount once at the app root (AppProviders) —
 * any component then opts in just by adding the class and the relevant `--squircle-*` custom
 * properties in CSS, no per-feature ResizeObserver wiring needed.
 *
 * Two modes, picked per element by which class it carries:
 * - `.squircle` — paints fill + border on the element's own background (`applySquircleShape`).
 *   For simple elements where the element itself is the visible surface (e.g. a chat bubble).
 * - `.squircle-clip` — masks the element *and its children* to the silhouette (`applySquircleClip`).
 *   For containers whose children already paint the surface edge-to-edge (e.g. a modal with an
 *   opaque sidebar/content layout) — `.squircle`'s fill would be invisible behind them.
 *
 * ResizeObserver repaints on size change (text reflow, viewport resize), MutationObserver picks
 * up newly rendered squircle elements, and a second MutationObserver repaints all of them when
 * the theme changes (`data-theme` / `data-theme-variant` on `<html>`) — colors are resolved once
 * into the SVG at paint time, so they don't follow CSS var changes the way `background-color` would.
 */
export function useSquircleBorder(): void {
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') {
      return
    }
    const root = document.body

    const paint = (el: HTMLElement, width = el.offsetWidth, height = el.offsetHeight) => {
      if (el.classList.contains('squircle-clip')) {
        applySquircleClip(el, width, height)
      } else {
        applySquircleShape(el, width, height)
      }
    }

    const observed = new WeakSet<Element>()
    const observe = (el: HTMLElement) => {
      if (observed.has(el)) return
      observed.add(el)
      resizeObserver.observe(el)
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement
        const box = entry.borderBoxSize?.[0]
        paint(
          el,
          box ? box.inlineSize : entry.contentRect.width,
          box ? box.blockSize : entry.contentRect.height,
        )
      }
    })

    const scanForNewSquircles = (node: ParentNode) => {
      node.querySelectorAll<HTMLElement>(COMBINED_SELECTOR).forEach(observe)
    }

    scanForNewSquircles(root)
    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return
          if (node.matches(COMBINED_SELECTOR)) observe(node)
          scanForNewSquircles(node)
        })
      }
    })
    mutationObserver.observe(root, { childList: true, subtree: true })

    const themeObserver = new MutationObserver(() => {
      root.querySelectorAll<HTMLElement>(COMBINED_SELECTOR).forEach((el) => paint(el))
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-theme-variant'],
    })

    return () => {
      mutationObserver.disconnect()
      resizeObserver.disconnect()
      themeObserver.disconnect()
    }
  }, [])
}
