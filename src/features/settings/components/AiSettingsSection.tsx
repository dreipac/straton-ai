type AiSettingsSectionProps = {
  aiProvider: string
}

export function AiSettingsSection({ aiProvider }: AiSettingsSectionProps) {
  const usesSupabaseGateway = aiProvider === 'openai'

  return (
    <div className="settings-card">
      <ul className="settings-list">
        <li>
          Aktiver AI Provider: <strong>{aiProvider}</strong>
        </li>
        <li>
          API-Key Verwaltung:{' '}
          <strong>{usesSupabaseGateway ? 'In Supabase Admin hinterlegt' : 'Nicht erforderlich (Mock)'}</strong>
        </li>
      </ul>
      <p>
        Fuer den Live-Betrieb brauchst du im Frontend keinen Provider-Key. Setze OpenAI/Anthropic Keys nur im
        Admin-Bereich von Supabase.
      </p>
    </div>
  )
}
