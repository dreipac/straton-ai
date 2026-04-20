import { useEffect, useState } from 'react'

type ErrorStatusSettingsSectionProps = {
  language: 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE'
  isConfigured: boolean
  isAuthLoading: boolean
  appError: string | null
  hasUser: boolean
}

export function ErrorStatusSettingsSection({
  language,
  isConfigured,
  isAuthLoading,
  appError,
  hasUser,
}: ErrorStatusSettingsSectionProps) {
  const [isOnline, setIsOnline] = useState(window.navigator.onLine)
  const [lastCheckedAt, setLastCheckedAt] = useState(() => new Date())

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
      setLastCheckedAt(new Date())
    }

    function handleOffline() {
      setIsOnline(false)
      setLastCheckedAt(new Date())
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const i18n = {
    heading:
      language === 'en'
        ? 'System status and errors'
        : language === 'hr'
          ? 'Status sustava i pogreške'
          : language === 'it'
            ? 'Stato del sistema ed errori'
            : language === 'sq'
              ? 'Statusi i sistemit dhe gabimet'
              : language === 'es-PE'
                ? 'Estado del sistema y errores'
                : 'Systemstatus und Fehler',
    subtitle:
      language === 'en'
        ? 'Here you can see technical status signals and the latest error message.'
        : language === 'hr'
          ? 'Ovdje možeš vidjeti tehničke statuse i zadnju poruku o pogrešci.'
          : language === 'it'
            ? 'Qui puoi vedere i segnali di stato tecnici e l ultimo messaggio di errore.'
            : language === 'sq'
              ? 'Këtu mund të shohësh sinjalet teknike të statusit dhe gabimin e fundit.'
              : language === 'es-PE'
                ? 'Aquí puedes ver señales técnicas de estado y el último error.'
                : 'Hier siehst du technische Statussignale und die letzte Fehlermeldung.',
    statusOnline: language === 'en' ? 'Browser online' : language === 'es-PE' ? 'Navegador en línea' : 'Browser online',
    statusSupabase:
      language === 'en'
        ? 'Supabase configured'
        : language === 'it'
          ? 'Supabase configurato'
          : language === 'es-PE'
            ? 'Supabase configurado'
            : 'Supabase konfiguriert',
    statusAuth:
      language === 'en' ? 'Authentication status' : language === 'es-PE' ? 'Estado de autenticación' : 'Authentifizierungsstatus',
    statusSession:
      language === 'en' ? 'Session available' : language === 'es-PE' ? 'Sesión disponible' : 'Session vorhanden',
    lastCheck: language === 'en' ? 'Last check' : language === 'es-PE' ? 'Última revisión' : 'Letzte Prüfung',
    noError: language === 'en' ? 'No current error.' : language === 'es-PE' ? 'Sin error actual.' : 'Kein aktueller Fehler.',
    latestError:
      language === 'en' ? 'Latest error' : language === 'es-PE' ? 'Último error' : 'Letzte Fehlermeldung',
    yes: language === 'en' ? 'Yes' : language === 'es-PE' ? 'Sí' : 'Ja',
    no: language === 'en' ? 'No' : language === 'es-PE' ? 'No' : 'Nein',
    loading: language === 'en' ? 'Checking...' : language === 'es-PE' ? 'Comprobando...' : 'Wird geprüft...',
  }

  const authState = isAuthLoading ? i18n.loading : hasUser ? i18n.yes : i18n.no
  const formattedLastCheckedAt = lastCheckedAt.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const rowStates = [
    { label: i18n.statusOnline, ok: isOnline, value: isOnline ? i18n.yes : i18n.no },
    { label: i18n.statusSupabase, ok: isConfigured, value: isConfigured ? i18n.yes : i18n.no },
    { label: i18n.statusAuth, ok: !isAuthLoading, value: authState },
    { label: i18n.statusSession, ok: hasUser, value: hasUser ? i18n.yes : i18n.no },
  ]

  return (
    <div className="status-settings-panel">
      <p className="status-settings-heading">{i18n.heading}</p>
      <p className="status-settings-subtitle">{i18n.subtitle}</p>

      <div className="status-settings-list" role="list" aria-label="Systemstatus">
        {rowStates.map((row) => (
          <div key={row.label} className="status-settings-row" role="listitem">
            <div className="status-settings-row-copy">
              <span className={`status-dot ${row.ok ? 'is-ok' : 'is-warn'}`} aria-hidden="true" />
              <span>{row.label}</span>
            </div>
            <span className="status-settings-value">{row.value}</span>
          </div>
        ))}
      </div>

      <p className="status-settings-last-check">
        {i18n.lastCheck}: {formattedLastCheckedAt}
      </p>

      <div className="status-settings-error-block">
        <p className="status-settings-error-title">{i18n.latestError}</p>
        <p className={`status-settings-error-value ${appError ? 'is-error' : ''}`}>{appError ?? i18n.noError}</p>
      </div>
    </div>
  )
}
