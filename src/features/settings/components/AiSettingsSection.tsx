import { useState } from 'react'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import { env } from '../../../config/env'
import { clearAiResponseCache } from '../../../integrations/ai/aiResponseCache'

function currentModelLabel(): string {
  if (env.aiProvider === 'mock') {
    return 'Mock (kein API-Call)'
  }
  return 'Hauptchat: OpenAI (GPT-5 mini) · Lernpfad: Claude Sonnet (aktuell Sonnet 4.6)'
}

export function AiSettingsSection() {
  const [cacheCleared, setCacheCleared] = useState(false)

  return (
    <>
      <p>
        Aktuelles KI-Modell: <strong>{currentModelLabel()}</strong>
      </p>
      <p
        style={{
          color: 'var(--color-text-muted)',
          fontSize: '0.88rem',
          lineHeight: 1.45,
          marginTop: '0.35rem',
        }}
      >
        Identische Hilfsanfragen (Themenvorschläge, Chat-Titel, Excel-Spezifikation, Lernkarten,
        Arbeitsblätter, Quiz-Bewertungen) werden lokal kurz zwischengespeichert — der laufende Chat
        selbst wird <strong>nicht</strong> gecacht, damit Antworten im Gespräch stets frisch bleiben.
      </p>
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
