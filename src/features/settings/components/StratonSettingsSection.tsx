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

  const versionText =
    status === 'loading'
      ? 'Version wird geladen…'
      : status === 'error'
        ? 'Version nicht verfügbar'
        : `Version ${deployedVersion ?? 'nicht gesetzt'}`

  return (
    <section className="straton-settings-hero">
      <img className="straton-settings-hero-logo" src={logoSrc} alt="" aria-hidden="true" />
      <div className="straton-settings-hero-text">
        <h3 className="straton-settings-hero-title">Straton</h3>
        <p className="straton-settings-hero-version">{versionText}</p>
      </div>
    </section>
  )
}
