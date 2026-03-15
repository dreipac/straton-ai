export const MESSAGE_BOX_STORAGE_KEY = 'straton-message-box-palette'

export type MessageBoxPalette = {
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

const LIGHT_BG_ALPHA = 0.12
const LIGHT_BORDER_ALPHA = 0.3
const DARK_BG_ALPHA = 0.3
const DARK_BORDER_ALPHA = 0.45

function rgba(rgb: string, alpha: number) {
  return `rgba(${rgb}, ${alpha})`
}

export const MESSAGE_BOX_PALETTES: MessageBoxPalette[] = [
  {
    id: 'slate',
    label: 'Slate',
    preview: 'linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%)',
    lightBg: '#eef2f7',
    lightBorder: '#d9e1ec',
    lightText: '#0f172a',
    darkBg: '#2a303a',
    darkBorder: '#4a5261',
    darkText: '#f8fafc',
  },
  {
    id: 'sky',
    label: 'Sky',
    preview: 'linear-gradient(135deg, #dbeafe 0%, #60a5fa 100%)',
    lightBg: rgba('59, 130, 246', LIGHT_BG_ALPHA),
    lightBorder: rgba('59, 130, 246', LIGHT_BORDER_ALPHA),
    lightText: '#0f172a',
    darkBg: rgba('96, 165, 250', DARK_BG_ALPHA),
    darkBorder: rgba('96, 165, 250', DARK_BORDER_ALPHA),
    darkText: '#eff6ff',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    preview: 'linear-gradient(135deg, #bae6fd 0%, #06b6d4 100%)',
    lightBg: rgba('6, 182, 212', LIGHT_BG_ALPHA),
    lightBorder: rgba('6, 182, 212', LIGHT_BORDER_ALPHA),
    lightText: '#0f172a',
    darkBg: rgba('34, 211, 238', DARK_BG_ALPHA),
    darkBorder: rgba('34, 211, 238', DARK_BORDER_ALPHA),
    darkText: '#ecfeff',
  },
  {
    id: 'mint',
    label: 'Mint',
    preview: 'linear-gradient(135deg, #ccfbf1 0%, #10b981 100%)',
    lightBg: rgba('16, 185, 129', LIGHT_BG_ALPHA),
    lightBorder: rgba('16, 185, 129', LIGHT_BORDER_ALPHA),
    lightText: '#0f172a',
    darkBg: rgba('16, 185, 129', DARK_BG_ALPHA),
    darkBorder: rgba('52, 211, 153', DARK_BORDER_ALPHA),
    darkText: '#ecfdf5',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    preview: 'linear-gradient(135deg, #d1fae5 0%, #22c55e 100%)',
    lightBg: rgba('34, 197, 94', LIGHT_BG_ALPHA),
    lightBorder: rgba('34, 197, 94', LIGHT_BORDER_ALPHA),
    lightText: '#0f172a',
    darkBg: rgba('34, 197, 94', DARK_BG_ALPHA),
    darkBorder: rgba('74, 222, 128', DARK_BORDER_ALPHA),
    darkText: '#f0fdf4',
  },
  {
    id: 'lime',
    label: 'Lime',
    preview: 'linear-gradient(135deg, #ecfccb 0%, #84cc16 100%)',
    lightBg: rgba('132, 204, 22', LIGHT_BG_ALPHA),
    lightBorder: rgba('132, 204, 22', LIGHT_BORDER_ALPHA),
    lightText: '#1a2e05',
    darkBg: rgba('132, 204, 22', DARK_BG_ALPHA),
    darkBorder: rgba('163, 230, 53', DARK_BORDER_ALPHA),
    darkText: '#f7fee7',
  },
  {
    id: 'amber',
    label: 'Amber',
    preview: 'linear-gradient(135deg, #fef3c7 0%, #f59e0b 100%)',
    lightBg: rgba('245, 158, 11', LIGHT_BG_ALPHA),
    lightBorder: rgba('245, 158, 11', LIGHT_BORDER_ALPHA),
    lightText: '#422006',
    darkBg: rgba('245, 158, 11', DARK_BG_ALPHA),
    darkBorder: rgba('251, 191, 36', DARK_BORDER_ALPHA),
    darkText: '#fffbeb',
  },
  {
    id: 'peach',
    label: 'Peach',
    preview: 'linear-gradient(135deg, #ffedd5 0%, #fb7185 100%)',
    lightBg: rgba('251, 146, 60', LIGHT_BG_ALPHA),
    lightBorder: rgba('249, 115, 22', LIGHT_BORDER_ALPHA),
    lightText: '#431407',
    darkBg: rgba('249, 115, 22', DARK_BG_ALPHA),
    darkBorder: rgba('251, 146, 60', DARK_BORDER_ALPHA),
    darkText: '#fff7ed',
  },
  {
    id: 'coral',
    label: 'Coral',
    preview: 'linear-gradient(135deg, #ffe4e6 0%, #f43f5e 100%)',
    lightBg: rgba('244, 63, 94', LIGHT_BG_ALPHA),
    lightBorder: rgba('244, 63, 94', LIGHT_BORDER_ALPHA),
    lightText: '#3f0f1b',
    darkBg: rgba('244, 63, 94', DARK_BG_ALPHA),
    darkBorder: rgba('251, 113, 133', DARK_BORDER_ALPHA),
    darkText: '#fff1f2',
  },
  {
    id: 'rose',
    label: 'Rose',
    preview: 'linear-gradient(135deg, #fce7f3 0%, #ec4899 100%)',
    lightBg: rgba('236, 72, 153', LIGHT_BG_ALPHA),
    lightBorder: rgba('236, 72, 153', LIGHT_BORDER_ALPHA),
    lightText: '#3d0f2b',
    darkBg: rgba('236, 72, 153', DARK_BG_ALPHA),
    darkBorder: rgba('244, 114, 182', DARK_BORDER_ALPHA),
    darkText: '#fdf2f8',
  },
  {
    id: 'violet',
    label: 'Violet',
    preview: 'linear-gradient(135deg, #ede9fe 0%, #8b5cf6 100%)',
    lightBg: rgba('139, 92, 246', LIGHT_BG_ALPHA),
    lightBorder: rgba('139, 92, 246', LIGHT_BORDER_ALPHA),
    lightText: '#1f1240',
    darkBg: rgba('139, 92, 246', DARK_BG_ALPHA),
    darkBorder: rgba('167, 139, 250', DARK_BORDER_ALPHA),
    darkText: '#f5f3ff',
  },
  {
    id: 'indigo',
    label: 'Indigo',
    preview: 'linear-gradient(135deg, #e0e7ff 0%, #6366f1 100%)',
    lightBg: rgba('99, 102, 241', LIGHT_BG_ALPHA),
    lightBorder: rgba('99, 102, 241', LIGHT_BORDER_ALPHA),
    lightText: '#1e1b4b',
    darkBg: rgba('99, 102, 241', DARK_BG_ALPHA),
    darkBorder: rgba('129, 140, 248', DARK_BORDER_ALPHA),
    darkText: '#eef2ff',
  },
  {
    id: 'cyan',
    label: 'Cyan',
    preview: 'linear-gradient(135deg, #cffafe 0%, #22d3ee 100%)',
    lightBg: rgba('34, 211, 238', LIGHT_BG_ALPHA),
    lightBorder: rgba('34, 211, 238', LIGHT_BORDER_ALPHA),
    lightText: '#083344',
    darkBg: rgba('34, 211, 238', DARK_BG_ALPHA),
    darkBorder: rgba('103, 232, 249', DARK_BORDER_ALPHA),
    darkText: '#ecfeff',
  },
  {
    id: 'steel',
    label: 'Steel',
    preview: 'linear-gradient(135deg, #dbe4ef 0%, #64748b 100%)',
    lightBg: rgba('71, 85, 105', LIGHT_BG_ALPHA),
    lightBorder: rgba('71, 85, 105', LIGHT_BORDER_ALPHA),
    lightText: '#0f172a',
    darkBg: rgba('71, 85, 105', DARK_BG_ALPHA),
    darkBorder: rgba('100, 116, 139', DARK_BORDER_ALPHA),
    darkText: '#f1f5f9',
  },
  {
    id: 'mono',
    label: 'Mono',
    preview: 'linear-gradient(135deg, #e5e7eb 0%, #9ca3af 100%)',
    lightBg: rgba('107, 114, 128', LIGHT_BG_ALPHA),
    lightBorder: rgba('107, 114, 128', LIGHT_BORDER_ALPHA),
    lightText: '#111827',
    darkBg: rgba('107, 114, 128', DARK_BG_ALPHA),
    darkBorder: rgba('156, 163, 175', DARK_BORDER_ALPHA),
    darkText: '#f9fafb',
  },
]

export const DEFAULT_MESSAGE_BOX_PALETTE_ID = MESSAGE_BOX_PALETTES[0].id

export function getMessageBoxPaletteById(messageBoxId: string | null | undefined): MessageBoxPalette {
  return MESSAGE_BOX_PALETTES.find((palette) => palette.id === messageBoxId) ?? MESSAGE_BOX_PALETTES[0]
}

export function applyMessageBoxPalette(messageBoxId: string | null | undefined) {
  const palette = getMessageBoxPaletteById(messageBoxId)
  document.documentElement.dataset.messageBoxPalette = palette.id
  document.documentElement.style.setProperty('--chat-user-bubble-bg', palette.lightBg)
  document.documentElement.style.setProperty('--chat-user-bubble-border', palette.lightBorder)
  document.documentElement.style.setProperty('--chat-user-bubble-text', palette.lightText)
  document.documentElement.style.setProperty('--chat-user-bubble-bg-dark', palette.darkBg)
  document.documentElement.style.setProperty('--chat-user-bubble-border-dark', palette.darkBorder)
  document.documentElement.style.setProperty('--chat-user-bubble-text-dark', palette.darkText)
  return palette.id
}
