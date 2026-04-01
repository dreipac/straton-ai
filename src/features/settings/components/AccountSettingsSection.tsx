import check2Icon from '../../../assets/icons/check_2.svg'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'

type AccountSettingsSectionProps = {
  firstNameDraft: string
  lastNameDraft: string
  emailDraft: string
  currentEmail: string
  pendingNewEmail: string | null
  avatarUrl: string | null
  isSavingAccount: boolean
  isSavingEmail: boolean
  emailSaveDisabled: boolean
  emailMessage: string | null
  emailError: string | null
  onFirstNameChange: (value: string) => void
  onLastNameChange: (value: string) => void
  onEmailChange: (value: string) => void
  onSaveEmail: () => void
}

export function AccountSettingsSection({
  firstNameDraft,
  lastNameDraft,
  emailDraft,
  currentEmail,
  pendingNewEmail,
  avatarUrl,
  isSavingAccount,
  isSavingEmail,
  emailSaveDisabled,
  emailMessage,
  emailError,
  onFirstNameChange,
  onLastNameChange,
  onEmailChange,
  onSaveEmail,
}: AccountSettingsSectionProps) {
  const avatarFallback = (firstNameDraft.trim()[0] || lastNameDraft.trim()[0] || '?').toUpperCase()

  const normalizedDraft = emailDraft.trim().toLowerCase()
  const normalizedCurrent = currentEmail.trim().toLowerCase()
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDraft.trim())
  const canSaveEmail =
    emailLooksValid &&
    normalizedDraft !== normalizedCurrent &&
    !isSavingEmail &&
    !isSavingAccount &&
    !emailSaveDisabled

  return (
    <section className="account-settings-panel">
      <div className="account-settings-profile-layout">
        <div className="account-settings-avatar account-settings-avatar--large" aria-hidden="true">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" />
          ) : (
            <span>{avatarFallback}</span>
          )}
        </div>
        <div className="account-settings-form">
          <label htmlFor="settings-first-name">Vorname</label>
          <div className="account-settings-input-shell">
            <input
              id="settings-first-name"
              type="text"
              value={firstNameDraft}
              onChange={(event) => onFirstNameChange(event.target.value)}
              placeholder="Vorname"
            />
          </div>

          <label htmlFor="settings-last-name">Nachname</label>
          <div className="account-settings-input-shell">
            <input
              id="settings-last-name"
              type="text"
              value={lastNameDraft}
              onChange={(event) => onLastNameChange(event.target.value)}
              placeholder="Nachname"
            />
          </div>
        </div>
      </div>

      <div className="account-settings-email-block">
        <label htmlFor="settings-account-email">E-Mail</label>
        <div className="account-settings-email-row">
          <div
            className={`account-settings-input-shell account-settings-input-shell--email${emailLooksValid ? ' is-valid-email' : ''}`}
          >
            <input
              id="settings-account-email"
              type="email"
              autoComplete="email"
              value={emailDraft}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="deine@email.de"
            />
            {emailLooksValid ? (
              <span className="account-settings-email-valid-mark" aria-hidden="true" title="Gültige E-Mail">
                <img
                  src={check2Icon}
                  alt=""
                  className="account-settings-email-check-img"
                  width={18}
                  height={18}
                />
              </span>
            ) : null}
          </div>
          <PrimaryButton
            type="button"
            className="account-settings-email-save"
            disabled={!canSaveEmail}
            onClick={() => {
              void onSaveEmail()
            }}
          >
            {isSavingEmail ? 'Speichern…' : 'Speichern'}
          </PrimaryButton>
        </div>
        {pendingNewEmail ? (
          <p className="account-settings-email-pending" role="status">
            Bestätigung ausstehend: neue Adresse <strong>{pendingNewEmail}</strong> — bitte den Link in der E-Mail
            anklicken.
          </p>
        ) : null}
        {emailMessage ? (
          <p className="account-settings-email-success" role="status">
            {emailMessage}
          </p>
        ) : null}
        {emailError ? (
          <p className="account-settings-email-error" role="alert">
            {emailError}
          </p>
        ) : null}
        <p className="account-settings-email-hint">
          Die E-Mail wird erst nach Klick auf den Bestätigungslink in deinem Postfach geändert (Supabase Auth).
        </p>
      </div>

      {isSavingAccount ? <p className="account-settings-saving">Speichert Namen...</p> : null}
    </section>
  )
}
