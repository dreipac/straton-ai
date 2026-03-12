export const ACCENT_STORAGE_KEY = 'straton-accent-palette'

export type AccentPalette = {
  id: string
  label: string
  gradient: string
  lineGradient: string
}

export const ACCENT_PALETTES: AccentPalette[] = [
  {
    id: 'ocean',
    label: 'Ocean',
    gradient: 'linear-gradient(135deg, #2563eb 0%, #14b8a6 52%, #0ea5e9 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(37, 99, 235, 0), #2563eb 18%, #14b8a6 58%, rgba(14, 165, 233, 0))',
  },
  {
    id: 'violet',
    label: 'Violet',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(99, 102, 241, 0), #6366f1 18%, #c026d3 58%, rgba(217, 70, 239, 0))',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    gradient: 'linear-gradient(135deg, #f97316 0%, #ef4444 55%, #ec4899 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(249, 115, 22, 0), #f97316 18%, #ef4444 58%, rgba(236, 72, 153, 0))',
  },
  {
    id: 'mint',
    label: 'Mint',
    gradient: 'linear-gradient(135deg, #10b981 0%, #22c55e 45%, #14b8a6 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(16, 185, 129, 0), #10b981 18%, #22c55e 58%, rgba(20, 184, 166, 0))',
  },
  {
    id: 'berry',
    label: 'Berry',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 48%, #f43f5e 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(124, 58, 237, 0), #7c3aed 18%, #a855f7 58%, rgba(244, 63, 94, 0))',
  },
  {
    id: 'sky',
    label: 'Sky',
    gradient: 'linear-gradient(135deg, #0284c7 0%, #0ea5e9 52%, #22d3ee 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(2, 132, 199, 0), #0284c7 18%, #0ea5e9 58%, rgba(34, 211, 238, 0))',
  },
  {
    id: 'ember',
    label: 'Ember',
    gradient: 'linear-gradient(135deg, #dc2626 0%, #f97316 52%, #f59e0b 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(220, 38, 38, 0), #dc2626 18%, #f97316 58%, rgba(245, 158, 11, 0))',
  },
  {
    id: 'lime',
    label: 'Lime',
    gradient: 'linear-gradient(135deg, #65a30d 0%, #84cc16 48%, #22c55e 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(101, 163, 13, 0), #65a30d 18%, #84cc16 58%, rgba(34, 197, 94, 0))',
  },
  {
    id: 'rose',
    label: 'Rose',
    gradient: 'linear-gradient(135deg, #e11d48 0%, #f43f5e 48%, #fb7185 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(225, 29, 72, 0), #e11d48 18%, #f43f5e 58%, rgba(251, 113, 133, 0))',
  },
  {
    id: 'indigo',
    label: 'Indigo',
    gradient: 'linear-gradient(135deg, #4338ca 0%, #4f46e5 48%, #818cf8 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(67, 56, 202, 0), #4338ca 18%, #4f46e5 58%, rgba(129, 140, 248, 0))',
  },
  {
    id: 'neon',
    label: 'Neon',
    gradient: 'linear-gradient(135deg, #06b6d4 0%, #22d3ee 38%, #a3e635 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(6, 182, 212, 0), #06b6d4 18%, #22d3ee 58%, rgba(163, 230, 53, 0))',
  },
  {
    id: 'aura',
    label: 'Aura',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 45%, #06b6d4 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(139, 92, 246, 0), #8b5cf6 18%, #6366f1 58%, rgba(6, 182, 212, 0))',
  },
  {
    id: 'plasma',
    label: 'Plasma',
    gradient: 'linear-gradient(135deg, #f43f5e 0%, #e879f9 48%, #8b5cf6 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(244, 63, 94, 0), #f43f5e 18%, #e879f9 58%, rgba(139, 92, 246, 0))',
  },
  {
    id: 'copper',
    label: 'Copper',
    gradient: 'linear-gradient(135deg, #b45309 0%, #ea580c 48%, #f97316 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(180, 83, 9, 0), #b45309 18%, #ea580c 58%, rgba(249, 115, 22, 0))',
  },
  {
    id: 'lagoon',
    label: 'Lagoon',
    gradient: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 52%, #2dd4bf 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(15, 118, 110, 0), #0f766e 18%, #14b8a6 58%, rgba(45, 212, 191, 0))',
  },
  {
    id: 'grape',
    label: 'Grape',
    gradient: 'linear-gradient(135deg, #6d28d9 0%, #9333ea 48%, #c084fc 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(109, 40, 217, 0), #6d28d9 18%, #9333ea 58%, rgba(192, 132, 252, 0))',
  },
  {
    id: 'peach',
    label: 'Peach',
    gradient: 'linear-gradient(135deg, #fb7185 0%, #fb923c 48%, #facc15 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(251, 113, 133, 0), #fb7185 18%, #fb923c 58%, rgba(250, 204, 21, 0))',
  },
  {
    id: 'frost',
    label: 'Frost',
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 48%, #a5f3fc 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(14, 165, 233, 0), #0ea5e9 18%, #38bdf8 58%, rgba(165, 243, 252, 0))',
  },
  {
    id: 'forest',
    label: 'Forest',
    gradient: 'linear-gradient(135deg, #166534 0%, #16a34a 48%, #4ade80 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(22, 101, 52, 0), #166534 18%, #16a34a 58%, rgba(74, 222, 128, 0))',
  },
  {
    id: 'mono',
    label: 'Mono',
    gradient: 'linear-gradient(135deg, #334155 0%, #475569 48%, #64748b 100%)',
    lineGradient:
      'linear-gradient(90deg, rgba(51, 65, 85, 0), #334155 18%, #475569 58%, rgba(100, 116, 139, 0))',
  },
]

export const DEFAULT_ACCENT_PALETTE_ID = ACCENT_PALETTES[0].id

export function getAccentPaletteById(accentId: string | null | undefined): AccentPalette {
  return ACCENT_PALETTES.find((palette) => palette.id === accentId) ?? ACCENT_PALETTES[0]
}

export function applyAccentPalette(accentId: string | null | undefined) {
  const palette = getAccentPaletteById(accentId)
  document.documentElement.dataset.accent = palette.id
  document.documentElement.style.setProperty('--accent-gradient', palette.gradient)
  document.documentElement.style.setProperty('--accent-gradient-line', palette.lineGradient)
  return palette.id
}
