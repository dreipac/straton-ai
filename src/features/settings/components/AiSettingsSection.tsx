import { useState } from 'react'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import { clearAiResponseCache } from '../../../integrations/ai/aiResponseCache'

export function AiSettingsSection() {
  const [cacheCleared, setCacheCleared] = useState(false)

  return (
    <>
      <SecondaryButton
        type="button"
        onClick={() => {
          clearAiResponseCache()
          setCacheCleared(true)
          window.setTimeout(() => setCacheCleared(false), 2500)
        }}
      >
        Hilfscache leeren
      </SecondaryButton>
      {cacheCleared ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
          Zwischenspeicher wurde geleert.
        </p>
      ) : null}
    </>
  )
}
