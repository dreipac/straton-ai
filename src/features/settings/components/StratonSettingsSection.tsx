import { useEffect, useState } from 'react'
import { getAppFeatureFlags } from '../../auth/services/appFeatureFlags.service'

export function StratonSettingsSection() {
  const [deployedVersion, setDeployedVersion] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const flags = await getAppFeatureFlags()
        if (!mounted) {
          return
        }
        setDeployedVersion(flags.deployed_app_version)
        setStatus('ready')
      } catch {
        if (!mounted) {
          return
        }
        setStatus('error')
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const logoSrc = `${import.meta.env.BASE_URL}assets/logo/Straton.png`

  return (
    <article className="settings-card straton-settings-card">
      <header className="straton-settings-header">
        <img className="straton-settings-logo" src={logoSrc} alt="Straton Logo" />
        <div>
          <h3 className="straton-settings-title">Straton</h3>
          <p className="straton-settings-subtitle">Version aus dem Admin-Deployment</p>
        </div>
      </header>
      <div className="straton-settings-version-row">
        <span className="straton-settings-version-label">Version</span>
        <code className="straton-settings-version-value">
          {status === 'loading'
            ? 'Lade…'
            : status === 'error'
              ? 'Nicht verfügbar'
              : (deployedVersion ?? 'Nicht gesetzt')}
        </code>
      </div>
    </article>
  )
}
