export const ACCENT_STORAGE_KEY = 'straton-accent-palette'

export type AccentPalette = {
  id: string
  label: string
  gradient: string
  lineGradient: string
}

export const ACCENT_PALETTES: AccentPalette[] = [
  {
    id: 'solid-blue',
    label: 'Blau',
    gradient: '#2563eb',
    lineGradient: 'linear-gradient(90deg, rgba(37, 99, 235, 0), #2563eb 50%, rgba(37, 99, 235, 0))',
  },
  {
    id: 'solid-violet',
    label: 'Violett',
    gradient: '#8b5cf6',
    lineGradient: 'linear-gradient(90deg, rgba(139, 92, 246, 0), #8b5cf6 50%, rgba(139, 92, 246, 0))',
  },
  {
    id: 'solid-emerald',
    label: 'Grün',
    gradient: '#16a34a',
    lineGradient: 'linear-gradient(90deg, rgba(22, 163, 74, 0), #16a34a 50%, rgba(22, 163, 74, 0))',
  },
  {
    id: 'solid-rose',
    label: 'Rose',
    gradient: '#f43f5e',
    lineGradient: 'linear-gradient(90deg, rgba(244, 63, 94, 0), #f43f5e 50%, rgba(244, 63, 94, 0))',
  },
  {
    id: 'solid-amber',
    label: 'Orange',
    gradient: '#ea580c',
    lineGradient: 'linear-gradient(90deg, rgba(234, 88, 12, 0), #ea580c 50%, rgba(234, 88, 12, 0))',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    gradient: 'linear-gradient(135deg, #2563eb 0%, #14b8a6 52%, #0ea5e9 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(37, 99, 235, 0), #2563eb 18%, #14b8a6 58%, rgba(14, 165, 233, 0))',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    gradient: 'linear-gradient(135deg, #f97316 0%, #ef4444 55%, #ec4899 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(249, 115, 22, 0), #f97316 18%, #ef4444 58%, rgba(236, 72, 153, 0))',
  },
  {
    id: 'aura',
    label: 'Aura',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 45%, #06b6d4 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(139, 92, 246, 0), #8b5cf6 18%, #6366f1 58%, rgba(6, 182, 212, 0))',
  },
]

export const DEFAULT_ACCENT_PALETTE_ID = ACCENT_PALETTES[0].id

/**
 * FAB «Chat» unter der Sidebar: Icon + Text auf `--accent-gradient`.
 * Sehr helle Verläufe → dunkle Schrift für Kontrast, sonst weiss.
 * (Das gedeckte Orange von `solid-amber` ist dunkel genug für weisse Schrift, deshalb kein Eintrag
 * mehr hier — anders als das vormals helle Amber.)
 */
export const ACCENT_FAB_FOREGROUND: Record<string, string> = {}

export function getAccentPaletteById(accentId: string | null | undefined): AccentPalette {
  return ACCENT_PALETTES.find((palette) => palette.id === accentId) ?? ACCENT_PALETTES[0]
}

/** Erstes Hex aus Gradient oder Solid — für CSS-Ringe/Schatten (kein `<color>` aus Verlauf möglich). */
export function accentRingBaseHexFromPaletteGradient(gradient: string): string {
  const m = gradient.match(/#[0-9a-fA-F]{6}/)
  return m ? m[0].toLowerCase() : '#6366f1'
}

function hexToRgbTriplet(hex: string): string {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex)
  if (!m) {
    return '99, 102, 241'
  }
  return [m[1], m[2], m[3]].map((part) => parseInt(part, 16)).join(', ')
}

/**
 * Message-Box-Farbton (User-Bubble) wird nicht mehr separat gewählt, sondern aus der Akzentfarbe
 * abgeleitet: gleiche Alpha-Formel wie vormals in `messageBoxPalettes.ts`, nur auf Basis von
 * `--accent-ring-base` statt einer eigenen Palette.
 */
function applyMessageBoxColorsFromAccent(ringBaseHex: string): void {
  const rgb = hexToRgbTriplet(ringBaseHex)
  document.documentElement.style.setProperty('--chat-user-bubble-bg', `rgba(${rgb}, 0.12)`)
  document.documentElement.style.setProperty('--chat-user-bubble-border', `rgba(${rgb}, 0.3)`)
  document.documentElement.style.setProperty('--chat-user-bubble-text', '#0f172a')
  document.documentElement.style.setProperty('--chat-user-bubble-bg-dark', `rgba(${rgb}, 0.3)`)
  document.documentElement.style.setProperty('--chat-user-bubble-border-dark', `rgba(${rgb}, 0.45)`)
  document.documentElement.style.setProperty('--chat-user-bubble-text-dark', '#f8fafc')
}

export function applyAccentPalette(accentId: string | null | undefined) {
  const palette = getAccentPaletteById(accentId)
  document.documentElement.dataset.accent = palette.id
  document.documentElement.style.setProperty('--accent-gradient', palette.gradient)
  document.documentElement.style.setProperty('--accent-gradient-line', palette.lineGradient)
  const fabFg = ACCENT_FAB_FOREGROUND[palette.id] ?? '#ffffff'
  document.documentElement.style.setProperty('--accent-fab-fg', fabFg)
  const ringBase = accentRingBaseHexFromPaletteGradient(palette.gradient)
  document.documentElement.style.setProperty('--accent-ring-base', ringBase)
  document.documentElement.style.setProperty('--color-accent', ringBase)
  applyMessageBoxColorsFromAccent(ringBase)
  /** Monochrom-SVG auf Senden: weiss bei dunklem FAB-Vordergrund, sonst wie UI-Icons (--icon-filter). */
  document.documentElement.style.setProperty(
    '--composer-send-icon-filter',
    ACCENT_FAB_FOREGROUND[palette.id] ? 'var(--icon-filter)' : 'brightness(0) invert(1)',
  )
  return palette.id
}
