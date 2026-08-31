/**
 * On-Device-Overlay: Viewport- und Layout-Maße (PWA / iOS). Kein Dauer-UI.
 *
 * Aktivieren (eine reicht, Seite neu laden):
 * - URL: `?viewportDebug=1` (oder `&viewportDebug=1`)
 * - Oder: `localStorage.setItem('straton-viewport-debug', '1')` in der Remote-Console
 * Deaktivieren: `localStorage.removeItem('straton-viewport-debug')` + URL-Param entfernen
 */
const FLAG_KEY = 'straton-viewport-debug'
const PARAM = 'viewportDebug'

function isEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  try {
    const urlOn = new URLSearchParams(window.location.search).get(PARAM)
    if (urlOn === '1' || urlOn === 'true') {
      return true
    }
  } catch {
    /* ignore */
  }
  try {
    return window.localStorage.getItem(FLAG_KEY) === '1'
  } catch {
    return false
  }
}

function readSafeAreaBottomPx(): number {
  const probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText =
    'position:fixed;left:-9999px;bottom:0;width:1px;height:1px;padding-bottom:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;'
  document.body.appendChild(probe)
  const pb = parseFloat(window.getComputedStyle(probe).paddingBottom || '0')
  probe.remove()
  return Number.isFinite(pb) ? pb : 0
}

export function initViewportDebug(): void {
  if (!isEnabled()) {
    return
  }

  const el = document.createElement('div')
  el.id = 'straton-viewport-debug'
  el.style.cssText = [
    'position:fixed',
    'left:6px',
    'right:6px',
    'bottom:max(8px, env(safe-area-inset-bottom, 8px))',
    'max-height:42vh',
    'overflow:auto',
    'z-index:2147483646',
    'pointer-events:none',
    'padding:8px 10px',
    'border-radius:10px',
    'font:11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace',
    'color:#e2e8f0',
    'background:rgba(15,23,42,0.92)',
    'border:1px solid rgba(148,163,184,0.35)',
    'box-shadow:0 8px 28px rgba(0,0,0,0.45)',
    '-webkit-font-smoothing:antialiased',
    'text-align:left',
    'white-space:pre-wrap',
    'word-break:break-all',
  ].join(';')

  document.body.appendChild(el)

  const tick = () => {
    const vv = window.visualViewport
    const root = document.documentElement
    const cs = window.getComputedStyle(root)
    const varHeight = cs.getPropertyValue('--straton-app-height').trim()
    const safeB = readSafeAreaBottomPx()

    const lines = [
      'viewport-debug (Straton)',
      `innerHeight … ${window.innerHeight}`,
      `outerHeight … ${window.outerHeight}`,
      `visualViewport.height … ${vv ? Math.round(vv.height * 100) / 100 : 'n/a'}`,
      `visualViewport.width … ${vv ? Math.round(vv.width * 100) / 100 : 'n/a'}`,
      `visualViewport.offsetTop … ${vv ? Math.round(vv.offsetTop * 100) / 100 : 'n/a'}`,
      `visualViewport.scale … ${vv ? vv.scale : 'n/a'}`,
      `documentElement.clientHeight … ${root.clientHeight}`,
      `documentElement.clientWidth … ${root.clientWidth}`,
      `--straton-app-height … ${varHeight || '(unset)'}`,
      `env safe-area-bottom (parsed) … ${Math.round(safeB * 100) / 100}px`,
      `diff inner − vv … ${vv ? window.innerHeight - vv.height : 'n/a'}`,
      '',
      'Hinweis: inner≈vv aber Balken → oft WK unterhalb Layout-Viewport.',
      'diff groß ohne Tastatur → Mess-/Inset-Thema.',
    ]

    el.textContent = lines.join('\n')
  }

  tick()
  window.addEventListener('resize', tick)
  window.visualViewport?.addEventListener('resize', tick)
  window.visualViewport?.addEventListener('scroll', tick)
  window.addEventListener('orientationchange', tick)
  window.setInterval(tick, 400)
}
