export const SETTINGS_SECTION_IDS = [
  'general',
  'straton',
  'introduction',
  'personalize',
  'feedback',
  'account',
  'billing',
  'security',
] as const

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number]

export type SettingsSection = {
  id: SettingsSectionId
  label: string
  title: string
  icon?: string
  /** Gefüllte Variante für Hover und aktiven Eintrag; ohne Angabe bleibt `icon` in allen Zuständen. */
  iconActive?: string
}
