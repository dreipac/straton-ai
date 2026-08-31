import { useCallback, useEffect, useRef, useState } from 'react'
import { PrimaryButton } from './ui/buttons/PrimaryButton'
import { SecondaryButton } from './ui/buttons/SecondaryButton'
import { ContentBottomSheet, type ContentBottomSheetHandle } from './ui/bottom-sheet/ContentBottomSheet'
import { ModalShell } from './ui/modal/ModalShell'
import { useIsMobileViewport } from '../hooks/useIsMobileViewport'

const STORAGE_KEY = 'straton-deploy-build-id'
/** Nach „Später“: Wert = dieselbe `buildId` — nächster Check erzwingt dann nur noch Aktualisieren. */
const SESSION_DEFERRED_BUILD_KEY = 'straton-deploy-deferred-build'

/** Alle 60 s `version.json` prüfen (kleine Datei; pausiert wenn Tab/App im Hintergrund). */
const VERSION_POLL_MS = 60_000

type VersionPayload = {
  buildId?: string
}

async function fetchServerBuildId(): Promise<string | null> {
  try {
    const url = new URL('version.json', window.location.href)
    const res = await fetch(url.toString(), { cache: 'no-store' })
    if (!res.ok) {
      return null
    }
    const data = (await res.json()) as VersionPayload
    const id = typeof data.buildId === 'string' && data.buildId.length > 0 ? data.buildId : null
    return id
  } catch {
    return null
  }
}

/**
 * Nach neuem Deploy: Hinweis mit Neu-Laden — kein Service Worker nötig.
 * `version.json` wird pro Build von Vite erzeugt.
 */
export function DeployUpdatePrompt() {
  const isMobile = useIsMobileViewport()
  const [open, setOpen] = useState(false)
  const [pendingBuildId, setPendingBuildId] = useState<string | null>(null)
  /** Nach einmal „Später“ für diese Server-Build-ID: nur noch Primäraktion. */
  const [updateMandatory, setUpdateMandatory] = useState(false)
  const sheetRef = useRef<ContentBottomSheetHandle | null>(null)

  const evaluate = useCallback(async () => {
    const serverBuildId = await fetchServerBuildId()
    if (!serverBuildId) {
      return
    }

    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(STORAGE_KEY)
    } catch {
      return
    }

    if (stored === null) {
      try {
        window.localStorage.setItem(STORAGE_KEY, serverBuildId)
      } catch {
        /* ignore */
      }
      return
    }

    if (stored === serverBuildId) {
      return
    }

    let deferredForThisBuild = false
    try {
      deferredForThisBuild =
        window.sessionStorage.getItem(SESSION_DEFERRED_BUILD_KEY) === serverBuildId
    } catch {
      /* ignore */
    }

    setUpdateMandatory(deferredForThisBuild)
    setPendingBuildId(serverBuildId)
    setOpen(true)
  }, [])

  useEffect(() => {
    void evaluate()
  }, [evaluate])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') {
        void evaluate()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [evaluate])

  /** Periodischer Check nur bei sichtbarem Tab/PWA — spart Requests im Hintergrund. */
  useEffect(() => {
    let intervalId: number | null = null

    function stopPoll() {
      if (intervalId !== null) {
        window.clearInterval(intervalId)
        intervalId = null
      }
    }

    function syncPoll() {
      if (document.visibilityState !== 'visible') {
        stopPoll()
        return
      }
      stopPoll()
      intervalId = window.setInterval(() => void evaluate(), VERSION_POLL_MS)
    }

    syncPoll()
    document.addEventListener('visibilitychange', syncPoll)
    return () => {
      stopPoll()
      document.removeEventListener('visibilitychange', syncPoll)
    }
  }, [evaluate])

  function handleReload() {
    const id = pendingBuildId
    if (id) {
      try {
        window.localStorage.setItem(STORAGE_KEY, id)
      } catch {
        /* ignore */
      }
    }
    window.location.reload()
  }

  function handleDismiss() {
    if (updateMandatory) {
      return
    }
    if (pendingBuildId) {
      try {
        window.sessionStorage.setItem(SESSION_DEFERRED_BUILD_KEY, pendingBuildId)
      } catch {
        /* ignore */
      }
    }
    if (isMobile) {
      sheetRef.current?.requestClose()
    } else {
      setOpen(false)
    }
  }

  const body = (
    <>
      <p className="deploy-update-copy">
        {updateMandatory
          ? 'Bitte aktualisiere jetzt — eine neuere Version ist bereit.'
          : 'Es ist eine neue Version verfügbar. Bitte lade die App neu, um alle Änderungen zu nutzen.'}
      </p>
      <div className="deploy-update-actions">
        <PrimaryButton type="button" onClick={() => handleReload()}>
          Jetzt aktualisieren
        </PrimaryButton>
        {!updateMandatory ? (
          <SecondaryButton type="button" onClick={() => handleDismiss()}>
            Später
          </SecondaryButton>
        ) : null}
      </div>
    </>
  )

  if (!open || !pendingBuildId) {
    return null
  }

  if (isMobile) {
    return (
      <ContentBottomSheet
        ref={sheetRef}
        open={open}
        onExitComplete={() => setOpen(false)}
        title={updateMandatory ? 'Update erforderlich' : 'Neue Version'}
        closeOnBackdrop={false}
        allowEscape={false}
        showCloseButton={false}
        showHandle
        panelClassName="deploy-update-sheet-panel"
        bodyClassName="deploy-update-sheet-body"
      >
        {body}
      </ContentBottomSheet>
    )
  }

  return (
    <ModalShell
      isOpen={open}
      onRequestClose={updateMandatory ? undefined : () => handleDismiss()}
      closeOnOverlayClick={false}
    >
      <section
        className="rename-modal deploy-update-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deploy-update-heading"
      >
        <h3 id="deploy-update-heading" className="deploy-update-desktop-title">
          {updateMandatory ? 'Update erforderlich' : 'Neue Version'}
        </h3>
        {body}
      </section>
    </ModalShell>
  )
}
