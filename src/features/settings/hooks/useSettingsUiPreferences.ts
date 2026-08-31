import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { UserProfile } from '../../auth/services/auth.service'
import {
  readMobileComposerCompact,
  writeMobileComposerCompact,
} from '../../chat/constants/mobileComposerCompact'
import {
  readDesktopFoldersInSidebar,
  writeDesktopFoldersInSidebar,
} from '../../chat/constants/desktopFoldersInSidebar'
import {
  applySidebarPreferenceToDocument,
  persistSidebarPreferenceToStorage,
  themeModeToDatasetVariant,
  type ThemeMode,
  type UiSettingsV1,
} from '../constants/uiSettings'
import { syncThemeColorMeta } from '../../../utils/themeColorMeta'
import { ACCENT_STORAGE_KEY, applyAccentPalette, DEFAULT_ACCENT_PALETTE_ID } from '../constants/accentPalettes'

type UseSettingsUiPreferencesArgs = {
  user: User | null
  profile: UserProfile | null
  /** Sidebar-Skalierung wird auf schmalen Layouts nicht persistiert (dort ist sie fix), siehe unten. */
  isNarrowSettings: boolean
  updateUiSettings: (settings: UiSettingsV1) => Promise<void>
  /** Zeigt den dezenten "Gespeichert"-Hinweis im Header. */
  onSaved: () => void
}

/**
 * Design-/Verhaltens-Einstellungen (Theme, Sidebar-Skalierung, Chat-Hintergrund, Akzentfarbe,
 * kompakter Mobile-Composer, Ordner in der Desktop-Sidebar) — aus `SettingsPage.tsx` ausgelagert.
 * Der komplexeste Teil ist die Synchronisation mit `profile.ui_settings`: Beim ersten Laden eines
 * Profils wird lokal genau einmal auf den Server-Stand "hydriert" (per Nutzer-Id verfolgt statt bei
 * jedem Profil-Refetch erneut); danach schreibt jede lokale Änderung debounced zurück — mit einem
 * Skip-Flag für genau den einen Zyklus direkt nach der Hydration, damit das Zurückschreiben nicht den
 * gerade erst gelesenen Stand für einen (harmlosen, aber unnötigen) Server-Roundtrip erneut sendet.
 */
export function useSettingsUiPreferences({
  user,
  profile,
  isNarrowSettings,
  updateUiSettings,
  onSaved,
}: UseSettingsUiPreferencesArgs) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const persistedTheme = window.localStorage.getItem('straton-theme')
    return persistedTheme === 'light' ||
      persistedTheme === 'dark' ||
      persistedTheme === 'pink-glass' ||
      persistedTheme === 'black'
      ? (persistedTheme as ThemeMode)
      : 'light'
  })
  const [sidebarScale, setSidebarScale] = useState<'100' | '75'>(() => {
    const persistedScale = window.localStorage.getItem('straton-sidebar-scale')
    return persistedScale === '100' ? '100' : '75'
  })
  const [chatBackground, setChatBackground] = useState<'space-dark' | 'space-stars'>(() => {
    const persisted = window.localStorage.getItem('straton-chat-background')
    return persisted === 'space-stars' ? 'space-stars' : 'space-dark'
  })
  const [accentPaletteId, setAccentPaletteId] = useState(() => {
    const persistedAccent = window.localStorage.getItem(ACCENT_STORAGE_KEY)
    return applyAccentPalette(persistedAccent ?? DEFAULT_ACCENT_PALETTE_ID)
  })
  const [mobileComposerCompact, setMobileComposerCompact] = useState(() => readMobileComposerCompact())
  const [desktopFoldersInSidebar, setDesktopFoldersInSidebar] = useState(() => readDesktopFoldersInSidebar())
  const [uiSettingsHydrated, setUiSettingsHydrated] = useState(false)
  const skipNextUiPersistRef = useRef(false)

  /* Hydration während des Renderns statt in einem Effekt (react-hooks/set-state-in-effect,
     gleiches Muster wie `useLearnGamification`): `hydrationKey` ist `null`, solange kein Profil da
     ist, sonst die Nutzer-Id — ändert sie sich, war es entweder ein Login/Logout oder ein echter
     Nutzerwechsel, beides Anlass zum (Re-)Hydrieren. Ein reiner Profil-Refetch desselben Nutzers
     ändert den Key nicht, überschreibt also keine gerade erst getippten lokalen Änderungen. */
  const hydrationKey = user && profile ? user.id : null
  const [trackedHydrationKey, setTrackedHydrationKey] = useState(hydrationKey)
  if (trackedHydrationKey !== hydrationKey) {
    setTrackedHydrationKey(hydrationKey)
    if (hydrationKey === null) {
      setUiSettingsHydrated(false)
    } else if (profile) {
      const s = profile.ui_settings
      setThemeMode(s.theme)
      setSidebarScale(s.sidebarScale)
      setChatBackground(s.chatBackground)
      setAccentPaletteId(applyAccentPalette(s.accentPaletteId))
      setMobileComposerCompact(s.mobileComposerCompact)
      setDesktopFoldersInSidebar(s.desktopFoldersInSidebar)
      setUiSettingsHydrated(true)
    }
  }

  /* Refs dürfen nicht während des Renderns geschrieben werden (react-hooks/refs) — deshalb hier als
     eigener Effekt statt direkt im Hydrations-Block oben. Läuft dank gleicher Dependency und
     Deklarationsreihenfolge im selben Commit *vor* dem Persist-Effekt darunter, setzt das Flag also
     rechtzeitig, bevor dieser das erste Mal prüft. */
  useEffect(() => {
    if (uiSettingsHydrated) {
      skipNextUiPersistRef.current = true
    }
  }, [uiSettingsHydrated])

  useEffect(() => {
    if (!user || !uiSettingsHydrated) {
      return
    }
    if (skipNextUiPersistRef.current) {
      skipNextUiPersistRef.current = false
      return
    }
    const snapshot: UiSettingsV1 = {
      theme: themeMode,
      sidebarScale,
      chatBackground,
      accentPaletteId,
      mobileComposerCompact,
      desktopFoldersInSidebar,
    }
    const timerId = window.setTimeout(() => {
      void updateUiSettings(snapshot)
    }, 450)
    return () => {
      window.clearTimeout(timerId)
    }
  }, [
    user,
    uiSettingsHydrated,
    themeMode,
    sidebarScale,
    chatBackground,
    accentPaletteId,
    mobileComposerCompact,
    desktopFoldersInSidebar,
    updateUiSettings,
  ])

  useEffect(() => {
    writeMobileComposerCompact(mobileComposerCompact)
  }, [mobileComposerCompact])

  useEffect(() => {
    writeDesktopFoldersInSidebar(desktopFoldersInSidebar)
  }, [desktopFoldersInSidebar])

  useEffect(() => {
    const baseTheme = themeMode === 'light' ? 'light' : 'dark'
    document.documentElement.dataset.theme = baseTheme
    document.documentElement.dataset.themeVariant = themeModeToDatasetVariant(themeMode)
    window.localStorage.setItem('straton-theme', themeMode)
    syncThemeColorMeta()
  }, [themeMode])

  useEffect(() => {
    applySidebarPreferenceToDocument(sidebarScale)
    if (!isNarrowSettings) {
      persistSidebarPreferenceToStorage(sidebarScale)
    }
  }, [sidebarScale, isNarrowSettings])

  useEffect(() => {
    document.documentElement.dataset.chatBackground = chatBackground
    window.localStorage.setItem('straton-chat-background', chatBackground)
  }, [chatBackground])

  /* Normalisierung (z. B. eine inzwischen entfernte Palette-Id) während des Renderns statt in einem
     Effekt — gleicher Grund wie bei der Hydration oben. Das eigentliche Persistieren bleibt ein
     Effekt, sieht dadurch aber immer schon den normalisierten Wert. */
  const [trackedAccentPaletteId, setTrackedAccentPaletteId] = useState(accentPaletteId)
  if (trackedAccentPaletteId !== accentPaletteId) {
    setTrackedAccentPaletteId(accentPaletteId)
    const appliedAccentId = applyAccentPalette(accentPaletteId)
    if (appliedAccentId !== accentPaletteId) {
      setAccentPaletteId(appliedAccentId)
    }
  }

  useEffect(() => {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, accentPaletteId)
  }, [accentPaletteId])

  function handleChangeThemeMode(nextThemeMode: ThemeMode) {
    setThemeMode(nextThemeMode)
    onSaved()
  }

  function handleChangeSidebarScale(nextScale: '100' | '75') {
    setSidebarScale(nextScale)
    onSaved()
  }

  function handleChangeChatBackground(nextBackground: 'space-dark' | 'space-stars') {
    setChatBackground(nextBackground)
    onSaved()
  }

  function handleChangeAccentPalette(nextPaletteId: string) {
    setAccentPaletteId(nextPaletteId)
    onSaved()
  }

  function handleChangeMobileComposerCompact(nextCompact: boolean) {
    setMobileComposerCompact(nextCompact)
    onSaved()
  }

  function handleToggleDesktopFoldersInSidebar() {
    setDesktopFoldersInSidebar((v) => !v)
  }

  return {
    themeMode,
    sidebarScale,
    chatBackground,
    accentPaletteId,
    mobileComposerCompact,
    desktopFoldersInSidebar,
    handleChangeThemeMode,
    handleChangeSidebarScale,
    handleChangeChatBackground,
    handleChangeAccentPalette,
    handleChangeMobileComposerCompact,
    handleToggleDesktopFoldersInSidebar,
  }
}
