import { useRef } from 'react'
import { MAX_IMAGE_CREDIT_BALANCE } from '../../auth/constants/imageCredits'
import { labelForSubscriptionImageGenerationModel } from '../../auth/constants/subscriptionImageGenerationModels'
import check2Icon from '../../../assets/icons/check_2.svg'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'

type AccountSettingsSectionProps = {
  firstNameDraft: string
  lastNameDraft: string
  emailDraft: string
  currentEmail: string
  pendingNewEmail: string | null
  avatarUrl: string | null
  subscriptionPlan: {
    name: string
    max_tokens: number | null
    max_images: number | null
    max_files: number | null
    image_generation_model?: string | null
  } | null
  subscriptionUsage: {
    used_tokens: number
    used_images: number
    used_files: number
    image_credit_balance: number
  } | null
  isSavingAccount: boolean
  isSavingEmail: boolean
  isAvatarBusy: boolean
  avatarError: string | null
  disableAvatarActions: boolean
  emailSaveDisabled: boolean
  emailMessage: string | null
  emailError: string | null
  onFirstNameChange: (value: string) => void
  onLastNameChange: (value: string) => void
  onEmailChange: (value: string) => void
  onSaveEmail: () => void
  onOpenPlansModal: () => void
  onAvatarFileSelected: (file: File) => void
  onRemoveAvatar: () => void
}

export function AccountSettingsSection({
  firstNameDraft,
  lastNameDraft,
  emailDraft,
  currentEmail,
  pendingNewEmail,
  avatarUrl,
  subscriptionPlan,
  subscriptionUsage,
  isSavingAccount,
  isSavingEmail,
  isAvatarBusy,
  avatarError,
  disableAvatarActions,
  emailSaveDisabled,
  emailMessage,
  emailError,
  onFirstNameChange,
  onLastNameChange,
  onEmailChange,
  onSaveEmail,
  onOpenPlansModal,
  onAvatarFileSelected,
  onRemoveAvatar,
}: AccountSettingsSectionProps) {
  const avatarInputRef = useRef<HTMLInputElement>(null)
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
        <div className="account-settings-avatar-column">
          <div className="account-settings-avatar account-settings-avatar--large" aria-hidden="true">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" />
            ) : (
              <span>{avatarFallback}</span>
            )}
          </div>
          <div className="account-settings-avatar-actions">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="account-settings-avatar-input-hidden"
              aria-label="Profilbild auswählen"
              disabled={disableAvatarActions || isAvatarBusy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  onAvatarFileSelected(file)
                }
                event.target.value = ''
              }}
            />
            <SecondaryButton
              type="button"
              className="account-settings-avatar-upload-btn"
              disabled={disableAvatarActions || isAvatarBusy}
              onClick={() => {
                avatarInputRef.current?.click()
              }}
            >
              {isAvatarBusy ? 'Wird hochgeladen…' : 'Profilbild hochladen'}
            </SecondaryButton>
            {avatarUrl ? (
              <button
                type="button"
                className="account-settings-avatar-remove"
                disabled={disableAvatarActions || isAvatarBusy}
                onClick={() => {
                  onRemoveAvatar()
                }}
              >
                Profilbild entfernen
              </button>
            ) : null}
          </div>
          {avatarError ? (
            <p className="account-settings-avatar-error" role="alert">
              {avatarError}
            </p>
          ) : null}
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

      <div className="account-settings-subscription-block">
        <h3 className="account-settings-subheading">Abonnement</h3>
        <p className="account-settings-subscription-value" role="status">
          {subscriptionPlan?.name ?? 'Kein Abo zugewiesen'}
        </p>
        {subscriptionPlan ? (
          <>
            <p className="account-subscription">
              Tokens (heute): {subscriptionUsage?.used_tokens ?? 0} /{' '}
              {subscriptionPlan.max_tokens ?? 'unbegrenzt'}
            </p>
            <p className="account-subscription">
              Bild-Guthaben: {subscriptionUsage?.image_credit_balance ?? 0} / max. {MAX_IMAGE_CREDIT_BALANCE}{' '}
              {subscriptionPlan.max_images != null
                ? `(+${subscriptionPlan.max_images} pro Tag, ungenutztes läuft mit)`
                : ''}
            </p>
            <p className="account-subscription">
              Bilder (heute erzeugt): {subscriptionUsage?.used_images ?? 0}
            </p>
            <p className="account-subscription">
              Bildgenerator: {labelForSubscriptionImageGenerationModel(subscriptionPlan.image_generation_model)}
            </p>
            <p className="account-subscription">
              Dateien (heute): {subscriptionUsage?.used_files ?? 0} /{' '}
              {subscriptionPlan.max_files ?? 'unbegrenzt'}
            </p>
          </>
        ) : (
          <p className="account-settings-subscription-hint">
            Sobald ein Abo zugewiesen ist, siehst du hier den Verbrauch.
          </p>
        )}
        {subscriptionPlan ? (
          <p className="account-settings-subscription-hint">
            Welches Abo dir zusteht, legt ein Administrator fest; du kannst es hier nicht selbst ändern.
          </p>
        ) : null}
        <SecondaryButton
          type="button"
          className="account-subscription-button"
          disabled
          onClick={onOpenPlansModal}
        >
          Abo-Modelle ansehen & kaufen
        </SecondaryButton>
        <p className="account-settings-subscription-hint">noch nicht verfügbar.</p>
      </div>

      {isSavingAccount ? <p className="account-settings-saving">Speichert Namen...</p> : null}
    </section>
  )
}
