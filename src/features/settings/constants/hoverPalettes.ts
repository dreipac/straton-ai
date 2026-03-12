export const HOVER_STORAGE_KEY = 'straton-hover-palette'

export type HoverPalette = {
  id: string
  label: string
  preview: string
  lightBg: string
  lightBorder: string
  lightText: string
  darkBg: string
  darkBorder: string
  darkText: string
}

const LIGHT_ALPHA_BG = 0.12
const LIGHT_ALPHA_BORDER = 0.34
const DARK_ALPHA_BG = 0.22
const DARK_ALPHA_BORDER = 0.42

function rgba(rgb: string, alpha: number) {
  return `rgba(${rgb}, ${alpha})`
}

export const HOVER_PALETTES: HoverPalette[] = [
  {
    id: 'standard',
    label: 'Standard',
    preview: 'linear-gradient(135deg, #d5deea 0%, #f8fafc 100%)',
    lightBg: '#f8fafc',
    lightBorder: '#d5deea',
    lightText: '#0f172a',
    darkBg: '#252b35',
    darkBorder: '#3a424f',
    darkText: '#f9fafb',
  },
  {
    id: 'sky',
    label: 'Sky',
    preview: 'linear-gradient(135deg, #dbeafe 0%, #93c5fd 100%)',
    lightBg: rgba('59, 130, 246', LIGHT_ALPHA_BG),
    lightBorder: rgba('59, 130, 246', LIGHT_ALPHA_BORDER),
    lightText: '#0f172a',
    darkBg: rgba('96, 165, 250', DARK_ALPHA_BG),
    darkBorder: rgba('96, 165, 250', DARK_ALPHA_BORDER),
    darkText: '#f9fafb',
  },
  {
    id: 'violet',
    label: 'Violet',
    preview: 'linear-gradient(135deg, #ede9fe 0%, #a78bfa 100%)',
    lightBg: rgba('139, 92, 246', LIGHT_ALPHA_BG),
    lightBorder: rgba('139, 92, 246', LIGHT_ALPHA_BORDER),
    lightText: '#0f172a',
    darkBg: rgba('167, 139, 250', DARK_ALPHA_BG),
    darkBorder: rgba('167, 139, 250', DARK_ALPHA_BORDER),
    darkText: '#f9fafb',
  },
  {
    id: 'mint',
    label: 'Mint',
    preview: 'linear-gradient(135deg, #ccfbf1 0%, #5eead4 100%)',
    lightBg: rgba('20, 184, 166', LIGHT_ALPHA_BG),
    lightBorder: rgba('20, 184, 166', LIGHT_ALPHA_BORDER),
    lightText: '#0f172a',
    darkBg: rgba('45, 212, 191', DARK_ALPHA_BG),
    darkBorder: rgba('45, 212, 191', DARK_ALPHA_BORDER),
    darkText: '#f9fafb',
  },
  {
    id: 'rose',
    label: 'Rose',
    preview: 'linear-gradient(135deg, #ffe4e6 0%, #fb7185 100%)',
    lightBg: rgba('244, 63, 94', LIGHT_ALPHA_BG),
    lightBorder: rgba('244, 63, 94', LIGHT_ALPHA_BORDER),
    lightText: '#0f172a',
    darkBg: rgba('251, 113, 133', DARK_ALPHA_BG),
    darkBorder: rgba('251, 113, 133', DARK_ALPHA_BORDER),
    darkText: '#f9fafb',
  },
  {
    id: 'amber',
    label: 'Amber',
    preview: 'linear-gradient(135deg, #fef3c7 0%, #fbbf24 100%)',
    lightBg: rgba('245, 158, 11', LIGHT_ALPHA_BG),
    lightBorder: rgba('245, 158, 11', LIGHT_ALPHA_BORDER),
    lightText: '#0f172a',
    darkBg: rgba('251, 191, 36', DARK_ALPHA_BG),
    darkBorder: rgba('251, 191, 36', DARK_ALPHA_BORDER),
    darkText: '#f9fafb',
  },
  {
    id: 'lime',
    label: 'Lime',
    preview: 'linear-gradient(135deg, #ecfccb 0%, #84cc16 100%)',
    lightBg: rgba('132, 204, 22', LIGHT_ALPHA_BG),
    lightBorder: rgba('132, 204, 22', LIGHT_ALPHA_BORDER),
    lightText: '#0f172a',
    darkBg: rgba('163, 230, 53', DARK_ALPHA_BG),
    darkBorder: rgba('163, 230, 53', DARK_ALPHA_BORDER),
    darkText: '#f9fafb',
  },
  {
    id: 'mono',
    label: 'Mono',
    preview: 'linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%)',
    lightBg: rgba('100, 116, 139', LIGHT_ALPHA_BG),
    lightBorder: rgba('100, 116, 139', LIGHT_ALPHA_BORDER),
    lightText: '#0f172a',
    darkBg: rgba('148, 163, 184', DARK_ALPHA_BG),
    darkBorder: rgba('148, 163, 184', DARK_ALPHA_BORDER),
    darkText: '#f9fafb',
  },
]

export const DEFAULT_HOVER_PALETTE_ID = HOVER_PALETTES[0].id

export function getHoverPaletteById(hoverId: string | null | undefined): HoverPalette {
  return HOVER_PALETTES.find((palette) => palette.id === hoverId) ?? HOVER_PALETTES[0]
}

export function applyHoverPalette(hoverId: string | null | undefined) {
  const palette = getHoverPaletteById(hoverId)
  document.documentElement.dataset.hoverPalette = palette.id
  document.documentElement.style.setProperty('--interactive-hover-bg', palette.lightBg)
  document.documentElement.style.setProperty('--interactive-hover-border', palette.lightBorder)
  document.documentElement.style.setProperty('--interactive-hover-text', palette.lightText)
  document.documentElement.style.setProperty('--interactive-hover-bg-dark', palette.darkBg)
  document.documentElement.style.setProperty('--interactive-hover-border-dark', palette.darkBorder)
  document.documentElement.style.setProperty('--interactive-hover-text-dark', palette.darkText)
  return palette.id
}
