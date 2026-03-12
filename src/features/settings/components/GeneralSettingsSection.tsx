import { useEffect, useRef, useState } from 'react'
import { ContextMenu } from '../../../components/ui/menu/ContextMenu'
import { MenuItem } from '../../../components/ui/menu/MenuItem'

type LanguageOption = {
  id: 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE'
  label: string
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
  { id: 'hr', label: 'Hrvatski' },
  { id: 'it', label: 'Italiano' },
  { id: 'sq', label: 'Shqip' },
  { id: 'es-PE', label: 'Español (Perú)' },
]

type GeneralSettingsSectionProps = {
  language: 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE'
  onChangeLanguage: (nextLanguage: 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE') => void | Promise<void>
}

export function GeneralSettingsSection({ language, onChangeLanguage }: GeneralSettingsSectionProps) {
  const i18n = {
    title: language === 'en' ? 'Language' : language === 'hr' ? 'Jezik' : 'Sprache',
    description:
      language === 'en'
        ? 'Choose the preferred language for the application.'
        : language === 'hr'
          ? 'Odaberi preferirani jezik za aplikaciju.'
          : language === 'it'
            ? "Scegli la lingua preferita per l'applicazione."
            : language === 'sq'
              ? 'Zgjidh gjuhën e preferuar për aplikacionin.'
              : language === 'es-PE'
                ? 'Elige el idioma preferido para la aplicación.'
          : 'Waehle die bevorzugte Sprache fuer die Anwendung.',
    activeLabel:
      language === 'en'
        ? 'active'
        : language === 'hr'
          ? 'aktivno'
          : language === 'it'
            ? 'attivo'
            : language === 'sq'
              ? 'aktive'
              : language === 'es-PE'
                ? 'activo'
                : 'aktiv',
  }
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false)
  const languageMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!isLanguageMenuOpen) {
        return
      }

      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (!(languageMenuRef.current?.contains(target) ?? false)) {
        setIsLanguageMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isLanguageMenuOpen])

  const selectedLanguageLabel = LANGUAGE_OPTIONS.find((option) => option.id === language)?.label ?? 'Deutsch'

  return (
    <div className="general-settings-panel">
      <div className="general-setting-row">
        <div className="general-setting-copy">
          <h3>{i18n.title}</h3>
          <p>{i18n.description}</p>
        </div>

        <div ref={languageMenuRef} className="general-setting-control">
          <button
            type="button"
            className="general-language-trigger"
            onClick={() => setIsLanguageMenuOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={isLanguageMenuOpen}
          >
            {selectedLanguageLabel}
          </button>

          {isLanguageMenuOpen ? (
            <ContextMenu className="general-language-menu">
              {LANGUAGE_OPTIONS.map((option) => (
                <MenuItem
                  key={option.id}
                  onClick={() => {
                    void onChangeLanguage(option.id)
                    setIsLanguageMenuOpen(false)
                  }}
                >
                  {option.label}
                  {option.id === language ? ` (${i18n.activeLabel})` : ''}
                </MenuItem>
              ))}
            </ContextMenu>
          ) : null}
        </div>
      </div>
    </div>
  )
}
