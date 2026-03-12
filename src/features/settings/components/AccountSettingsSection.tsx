type AccountSettingsSectionProps = {
  firstNameDraft: string
  lastNameDraft: string
  isSavingAccount: boolean
  onFirstNameChange: (value: string) => void
  onLastNameChange: (value: string) => void
}

export function AccountSettingsSection({
  firstNameDraft,
  lastNameDraft,
  isSavingAccount,
  onFirstNameChange,
  onLastNameChange,
}: AccountSettingsSectionProps) {
  return (
    <section className="account-settings-panel">
      <p>Hier kannst du deinen Vornamen und Nachnamen anpassen.</p>
      <div className="account-settings-form">
        <label htmlFor="settings-first-name">Vorname</label>
        <input
          id="settings-first-name"
          type="text"
          value={firstNameDraft}
          onChange={(event) => onFirstNameChange(event.target.value)}
          placeholder="Vorname"
        />

        <label htmlFor="settings-last-name">Nachname</label>
        <input
          id="settings-last-name"
          type="text"
          value={lastNameDraft}
          onChange={(event) => onLastNameChange(event.target.value)}
          placeholder="Nachname"
        />
      </div>
      {isSavingAccount ? <p className="account-settings-saving">Speichert...</p> : null}
    </section>
  )
}
