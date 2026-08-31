import { useEffect, useState, type FormEvent } from 'react'
import check2Icon from '../../../assets/icons/check_2.svg'
import successIcon from '../../../assets/icons/success.svg'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { RequirementChecklist } from '../../../components/ui/RequirementChecklist'
import { useAuth } from '../../auth/context/useAuth'
import { signOut, updateAuthPassword, verifyCurrentPassword } from '../../auth/services/auth.service'

const MIN_PASSWORD_LENGTH = 12

/** Kürzeste als "Zahlenfolge" verbotene Lauflänge, z. B. "123" oder "321". */
const SEQUENTIAL_DIGITS_MIN_RUN = 3

/** Wartezeit nach dem letzten Tastendruck, bevor das aktuelle Passwort geprüft wird. */
const VERIFY_DEBOUNCE_MS = 800

/** Standzeit der Bestätigung, bevor abgemeldet wird. */
const SUCCESS_MODAL_MS = 1000

/** Erkennt auf-/absteigende Ziffernläufe wie "123" oder "9876" ab `SEQUENTIAL_DIGITS_MIN_RUN`
    Stellen, egal wo sie im Passwort stehen. */
function hasSequentialDigits(value: string, minRun = SEQUENTIAL_DIGITS_MIN_RUN): boolean {
  let ascendingRun = 1
  let descendingRun = 1
  for (let i = 1; i < value.length; i++) {
    const prevChar = value[i - 1]
    const currChar = value[i]
    const bothDigits = prevChar >= '0' && prevChar <= '9' && currChar >= '0' && currChar <= '9'
    const diff = bothDigits ? currChar.charCodeAt(0) - prevChar.charCodeAt(0) : 0

    ascendingRun = bothDigits && diff === 1 ? ascendingRun + 1 : 1
    descendingRun = bothDigits && diff === -1 ? descendingRun + 1 : 1

    if (ascendingRun >= minRun || descendingRun >= minRun) {
      return true
    }
  }
  return false
}

function ValidMark() {
  return (
    <span className="security-password-check" aria-hidden="true">
      <img src={check2Icon} alt="" className="security-password-check-img" width={18} height={18} />
    </span>
  )
}

type SecuritySettingsSectionProps = {
  /** Liegt in `SettingsPage` statt hier lokal, damit ein erneuter Klick auf den (dann nicht mehr
      aktiven) "Sicherheit & Login"-Tab die Ansicht von aussen wieder schliessen kann. */
  isEditingPassword: boolean
  onEditingPasswordChange: (value: boolean) => void
}

/** «Sicherheit & Login» — bislang nur der Passwortwechsel. Zeigt zunächst nur die Zeile "Passwort"
    mit Verwalten-Knopf; ein Klick ersetzt sie inline (kein Dialog) durch das Formular. */
export function SecuritySettingsSection({
  isEditingPassword,
  onEditingPasswordChange,
}: SecuritySettingsSectionProps) {
  const { user } = useAuth()
  const email = user?.email ?? ''

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isCurrentPasswordValid, setIsCurrentPasswordValid] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Das aktuelle Passwort lässt sich nur serverseitig prüfen, deshalb verzögert nach dem Tippen und
     nicht bei jedem Zeichen. Veraltete Antworten werden über `cancelled` verworfen. */
  useEffect(() => {
    setIsCurrentPasswordValid(false)
    if (!email || currentPassword.length === 0) {
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      verifyCurrentPassword(email, currentPassword)
        .then((isValid) => {
          if (!cancelled) {
            setIsCurrentPasswordValid(isValid)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setIsCurrentPasswordValid(false)
          }
        })
    }, VERIFY_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [email, currentPassword])

  /* Das neue Passwort gilt erst nach erneuter Anmeldung, deshalb nach der Bestätigung abmelden. */
  useEffect(() => {
    if (!isSuccessModalOpen) {
      return
    }
    const timer = window.setTimeout(() => {
      void signOut()
    }, SUCCESS_MODAL_MS)

    return () => window.clearTimeout(timer)
  }, [isSuccessModalOpen])

  /* Schliesst z. B. der "Sicherheit & Login"-Tab in der Sidebar die Ansicht von aussen (Klick auf
     den dann inaktiven Tab), bleiben sonst getippte Reste stehen — deshalb hier zurücksetzen statt
     nur beim erfolgreichen Speichern. */
  useEffect(() => {
    if (!isEditingPassword) {
      resetForm()
    }
  }, [isEditingPassword])

  /* Checkliste unter "Neues Passwort" — jede Anforderung gilt erst als erfüllt, sobald überhaupt
     getippt wurde, sonst wären leere Felder fälschlich grün. */
  const isNewPasswordLongEnough = newPassword.length >= MIN_PASSWORD_LENGTH
  const isNewPasswordFreeOfSequence = newPassword.length > 0 && !hasSequentialDigits(newPassword)
  const isNewPasswordDifferent = newPassword.length > 0 && newPassword !== currentPassword
  const doPasswordsMatch = newPassword.length > 0 && confirmPassword.length > 0 && newPassword === confirmPassword

  /* Erst wenn alle vier Anforderungen erfüllt sind (inkl. Zahlenfolgen-Verbot), gilt das neue
     Passwort als gültig — nur dann zeigen die Felder den grünen Haken und nur dann lässt sich
     speichern. */
  const isNewPasswordValid = isNewPasswordLongEnough && isNewPasswordFreeOfSequence && isNewPasswordDifferent
  const isPasswordChangeReady = isNewPasswordValid && doPasswordsMatch
  const canSubmit = isCurrentPasswordValid && isPasswordChangeReady && !isSaving

  function resetForm() {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setIsCurrentPasswordValid(false)
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!canSubmit) {
      return
    }

    setIsSaving(true)
    try {
      await updateAuthPassword(newPassword)
      resetForm()
      onEditingPasswordChange(false)
      setIsSuccessModalOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passwort konnte nicht geändert werden.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="general-settings-panel security-settings-section" aria-label="Sicherheit & Login">
      {!isEditingPassword ? (
        <>
          <h2 className="general-section-title general-section-title--plain">Sicherheit</h2>
          <div className="settings-section-divider" />

          <div className="setting-row">
            <span className="setting-row-label setting-row-label--stacked">
              <span className="setting-row-label-title">Passwort</span>
              <span className="setting-row-label-desc">Ändere dein Passwort für das Login</span>
            </span>
            <div className="setting-row-control">
              <button
                type="button"
                className="general-language-trigger general-language-trigger--plain"
                onClick={() => onEditingPasswordChange(true)}
              >
                Passwort ändern
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <h2 className="general-section-title general-section-title--plain">Passwort ändern</h2>
          <div className="settings-section-divider" />

          <form className="security-password-form" onSubmit={handleSubmit}>
            <div className="security-password-row">
              <label className="security-password-label" htmlFor="security-current-password">
                Aktuelles Passwort
              </label>
              <div className="security-password-field">
                <input
                  id="security-current-password"
                  type="password"
                  autoComplete="current-password"
                  className="security-password-input"
                  placeholder="Aktuelles Passwort"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoFocus
                />
                {isCurrentPasswordValid ? <ValidMark /> : null}
              </div>
            </div>

            <div className="security-password-row">
              <label className="security-password-label" htmlFor="security-new-password">
                Neues Passwort
              </label>
              <div className="security-password-field">
                <input
                  id="security-new-password"
                  type="password"
                  autoComplete="new-password"
                  className="security-password-input"
                  placeholder="Neues Passwort"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                {isPasswordChangeReady ? <ValidMark /> : null}
              </div>
              <RequirementChecklist
                items={[
                  { id: 'length', met: isNewPasswordLongEnough, label: `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen` },
                  {
                    id: 'no-sequence',
                    met: isNewPasswordFreeOfSequence,
                    label: 'Keine Zahlenfolge (z. B. 123 oder 321)',
                  },
                  {
                    id: 'different',
                    met: isNewPasswordDifferent,
                    label: 'Unterscheidet sich vom aktuellen Passwort',
                  },
                  { id: 'match', met: doPasswordsMatch, label: 'Stimmt mit der Bestätigung überein' },
                ]}
              />
            </div>

            <div className="security-password-row">
              <label className="security-password-label" htmlFor="security-confirm-password">
                Neues Passwort bestätigen
              </label>
              <div className="security-password-field">
                <input
                  id="security-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  className="security-password-input"
                  placeholder="Neues Passwort bestätigen"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
                {isPasswordChangeReady ? <ValidMark /> : null}
              </div>
            </div>

            <div className="security-password-row security-password-actions">
              <PrimaryButton type="submit" className="security-password-submit" disabled={!canSubmit}>
                {isSaving ? 'Speichert…' : 'Passwort ändern'}
              </PrimaryButton>
            </div>

            {error ? (
              <p className="security-password-error" role="alert">
                {error}
              </p>
            ) : null}
          </form>
        </>
      )}

      {/* Kurze Bestätigung ohne Bedienelemente — sie verschwindet mit der Abmeldung von selbst. */}
      <ModalShell
        isOpen={isSuccessModalOpen}
        className="security-password-done-overlay"
        closeOnOverlayClick={false}
      >
        <div className="security-password-done-dialog" role="status" aria-live="polite">
          <img
            className="security-password-done-icon"
            src={successIcon}
            alt=""
            aria-hidden="true"
            width={56}
            height={56}
          />
          <p className="security-password-done-title">Ihr Passwort wurde geändert.</p>
          <p className="security-password-done-subtitle">Sie werden in kürze abgemeldet</p>
          <span className="security-password-done-loader" aria-hidden="true" />
        </div>
      </ModalShell>
    </section>
  )
}
