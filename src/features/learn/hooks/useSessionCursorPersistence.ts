import { useEffect, useRef } from 'react'
import { loadSessionState, saveSessionState } from '../services/learnSessionState.persistence'

type UseSessionCursorPersistenceArgs = {
  userId: string | null
  activePathId: string | null
  /** Ordinal des aktiven Themas (0-basiert) oder null (Landkarte). */
  activeTopicOrdinal: number | null
  /** Ordinal des aktiven Zwischenschritts (0-basiert) oder null (Themen-/Einstiegscheck-Ebene). */
  activeStepOrdinal: number | null
  /** Grobe Session-Phase (nur zur Diagnose persistiert). */
  phase: string
  /** true, sobald die Themen geladen sind → Restore darf laufen. */
  isReady: boolean
  /** true, wenn der Nutzer bereits in einen Arbeitsbereich navigiert ist (dann kein Auto-Restore). */
  hasNavigated: boolean
  /**
   * Stellt den gespeicherten Cursor wieder her, indem die BESTEHENDE Navigations-Logik aufgerufen wird
   * (damit alle gekoppelten Effekte laufen). Wird nur mit einem gueltigen Zwischenschritt-Cursor gerufen.
   */
  onRestore: (topicOrdinal: number, stepOrdinal: number) => void
}

/**
 * Session-Cursor-Persistenz (Schicht 7): speichert den aktiven Themen-/Schritt-Cursor je (User x Pfad)
 * und stellt ihn beim erneuten Oeffnen wieder her ("dort fortsetzen, wo unterbrochen wurde").
 *
 * Bewusst konservativ: automatisch wiederhergestellt wird nur ein Zwischenschritt-Cursor (die eigentliche
 * Arbeitsebene) — nie die Themen-/Einstiegscheck-Ebene, um kein unbeabsichtigtes KI-Generieren auszuloesen.
 * Gespeichert wird erst NACH dem Restore-Versuch eines Pfads, damit ein frischer Nullstand einen echten
 * Cursor nicht ueberschreibt. Degradiert still, wenn die Tabelle/Verbindung fehlt (Fehler nur geloggt).
 */
export function useSessionCursorPersistence(args: UseSessionCursorPersistenceArgs) {
  const restoredForPathRef = useRef<string | null>(null)
  const onRestoreRef = useRef(args.onRestore)
  const hasNavigatedRef = useRef(args.hasNavigated)

  // Refs nach jedem Render aktuell halten, ohne die anderen Effekt-Deps zu triggern.
  useEffect(() => {
    onRestoreRef.current = args.onRestore
    hasNavigatedRef.current = args.hasNavigated
  })

  const { userId, activePathId, activeTopicOrdinal, activeStepOrdinal, phase, isReady } = args

  // Restore: einmal je Pfad, sobald die Themen geladen sind und der Nutzer noch nicht navigiert hat.
  useEffect(() => {
    if (!userId || !activePathId || !isReady) {
      return
    }
    if (restoredForPathRef.current === activePathId) {
      return
    }
    restoredForPathRef.current = activePathId
    let cancelled = false

    void (async () => {
      try {
        const state = await loadSessionState(activePathId)
        if (cancelled || !state) {
          return
        }
        if (
          !hasNavigatedRef.current &&
          state.activeTopicOrdinal !== null &&
          state.activeStepOrdinal !== null
        ) {
          onRestoreRef.current(state.activeTopicOrdinal, state.activeStepOrdinal)
        }
      } catch (error) {
        console.error('Lernbereich: Session-Cursor konnte nicht geladen werden', error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId, activePathId, isReady])

  // Speichern: bei jeder Cursor-Aenderung — aber erst, nachdem der Restore-Versuch fuer diesen Pfad lief.
  useEffect(() => {
    if (!userId || !activePathId) {
      return
    }
    if (restoredForPathRef.current !== activePathId) {
      return
    }
    void saveSessionState(userId, activePathId, {
      activeTopicOrdinal,
      activeStepOrdinal,
      phase,
      position: 0,
      lastActivityAt: null,
    }).catch((error) => {
      console.error('Lernbereich: Session-Cursor konnte nicht gespeichert werden', error)
    })
  }, [userId, activePathId, activeTopicOrdinal, activeStepOrdinal, phase])
}
