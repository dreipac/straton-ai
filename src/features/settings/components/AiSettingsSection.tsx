import { env } from '../../../config/env'

function currentModelLabel(): string {
  if (env.aiProvider === 'mock') {
    return 'Mock (kein API-Call)'
  }
  return 'Hauptchat: OpenAI (GPT-5 mini) · Lernpfad: Claude Sonnet (aktuell Sonnet 4.6)'
}

export function AiSettingsSection() {
  return (
    <>
      <p>
        Aktuelles KI-Modell: <strong>{currentModelLabel()}</strong>
      </p>
    </>
  )
}
