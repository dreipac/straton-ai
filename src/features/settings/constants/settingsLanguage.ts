/**
 * Sprachcode-Union, bislang an 11 Stellen im Projekt als roher `'de' | 'en' | 'hr' | 'it' | 'sq' |
 * 'es-PE'`-Literal dupliziert. Hier für die Settings-Seite/-Komponenten einmal benannt; `auth.service.ts`
 * / `AuthContext.ts` / `AuthProvider.tsx` (dort liegt `profile.language`, die eigentliche Quelle)
 * haben absichtlich noch ihre eigene Kopie — Vereinheitlichung dorthin ist eine grössere,
 * auth-übergreifende Änderung und bewusst nicht Teil dieses Settings-Aufräumens.
 */
export const SUPPORTED_SETTINGS_LANGUAGES = ['de', 'en', 'hr', 'it', 'sq', 'es-PE'] as const

export type SettingsLanguage = (typeof SUPPORTED_SETTINGS_LANGUAGES)[number]
