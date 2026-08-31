export const CHAT_FOLDER_COLOR_IDS = [
  'blue',
  'teal',
  'green',
  'yellow',
  'orange',
  'red',
  'purple',
  'pink',
  'slate',
] as const

export type ChatFolderColorId = (typeof CHAT_FOLDER_COLOR_IDS)[number]

export type ChatFolderColorOption = {
  id: ChatFolderColorId
  label: string
  swatch: string
}

export const CHAT_FOLDER_COLOR_OPTIONS: ChatFolderColorOption[] = [
  { id: 'blue', label: 'Blau', swatch: '#3b82f6' },
  { id: 'teal', label: 'Türkis', swatch: '#14b8a6' },
  { id: 'green', label: 'Grün', swatch: '#22c55e' },
  { id: 'yellow', label: 'Gelb', swatch: '#eab308' },
  { id: 'orange', label: 'Orange', swatch: '#f97316' },
  { id: 'red', label: 'Rot', swatch: '#ef4444' },
  { id: 'purple', label: 'Lila', swatch: '#a855f7' },
  { id: 'pink', label: 'Pink', swatch: '#ec4899' },
  { id: 'slate', label: 'Grau', swatch: '#64748b' },
]

export function isChatFolderColorId(value: string | null | undefined): value is ChatFolderColorId {
  if (!value) {
    return false
  }
  return (CHAT_FOLDER_COLOR_IDS as readonly string[]).includes(value)
}

export function getChatFolderColorSwatch(colorId: string | null | undefined): string | null {
  if (!isChatFolderColorId(colorId)) {
    return null
  }
  return CHAT_FOLDER_COLOR_OPTIONS.find((option) => option.id === colorId)?.swatch ?? null
}

export const CHAT_FOLDER_DEFAULT_COLOR = 'var(--color-accent, var(--accent-ring-base, #6366f1))'

export function getChatFolderIconStyle(
  colorId: string | null | undefined,
): { backgroundColor: string; color: string } {
  const swatch = getChatFolderColorSwatch(colorId) ?? CHAT_FOLDER_DEFAULT_COLOR
  return { backgroundColor: swatch, color: swatch }
}
