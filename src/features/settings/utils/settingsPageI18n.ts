import accountOutlinedIcon from '../../../assets/icons/account-outlined.svg'
import accountFilledIcon from '../../../assets/icons/account-filled.svg'
import settingsOutlinedIcon from '../../../assets/icons/settings-outlined.svg'
import settingsFilledIcon from '../../../assets/icons/settings-filled.svg'
import designOutlinedIcon from '../../../assets/icons/Design-outlined.svg'
import designFilledIcon from '../../../assets/icons/Design-filled.svg'
import personalizeIcon from '../../../assets/icons/personalize.svg'
import feedbackOutlinedIcon from '../../../assets/icons/feedback-outlined.svg'
import feedbackFilledIcon from '../../../assets/icons/feedback-filled.svg'
import securityOutlinedIcon from '../../../assets/icons/security-outlined.svg'
import securityFilledIcon from '../../../assets/icons/security-filled.svg'
import billingOutlinedIcon from '../../../assets/icons/billing-outlined.svg'
import billingFilledIcon from '../../../assets/icons/billing-filled.svg'
import type { SettingsSection } from '../constants/settingsSections'
import type { SettingsLanguage } from '../constants/settingsLanguage'

export type SettingsPageI18n = {
  searchPlaceholder: string
  searchAriaLabel: string
  searchNoResults: string
  closeLabel: string
  settingsScreenTitle: string
  backLabel: string
  logoutMenuLabel: string
}

/**
 * Reine Textdaten für `SettingsPage.tsx` — Übersetzungstabellen und die Menü-Sektionen, beides
 * abhängig von der aktuellen Sprache. Ausgelagert, weil dieser Block allein rund 300 Zeilen der
 * Komponente ausmachte, ohne selbst State/Effekte zu enthalten (reine Ableitung aus `language`).
 */
export function buildSettingsPageI18n(
  language: SettingsLanguage,
  stratonMenuIcon: string,
): { i18n: SettingsPageI18n; sections: SettingsSection[] } {
  const i18n: SettingsPageI18n = {
    searchPlaceholder:
      language === 'en'
        ? 'Search'
        : language === 'hr'
          ? 'Pretraga'
          : language === 'it'
            ? 'Cerca'
            : language === 'sq'
              ? 'Kërko'
              : language === 'es-PE'
                ? 'Buscar'
                : 'Suche',
    searchAriaLabel:
      language === 'en'
        ? 'Search settings'
        : language === 'hr'
          ? 'Pretraži postavke'
          : language === 'it'
            ? 'Cerca impostazioni'
            : language === 'sq'
              ? 'Kërko cilësimet'
              : language === 'es-PE'
                ? 'Buscar ajustes'
                : 'Einstellungen durchsuchen',
    searchNoResults:
      language === 'en'
        ? 'No matching settings'
        : language === 'hr'
          ? 'Nema odgovarajućih postavki'
          : language === 'it'
            ? 'Nessuna impostazione trovata'
            : language === 'sq'
              ? 'Asnjë cilësim i përputhur'
              : language === 'es-PE'
                ? 'Sin ajustes coincidentes'
                : 'Keine passenden Einstellungen',
    closeLabel:
      language === 'en'
        ? 'Close settings'
        : language === 'hr'
          ? 'Zatvori postavke'
          : language === 'it'
            ? 'Chiudi impostazioni'
            : language === 'sq'
              ? 'Mbyll cilësimet'
              : language === 'es-PE'
                ? 'Cerrar ajustes'
                : 'Einstellungen schließen',
    settingsScreenTitle:
      language === 'en'
        ? 'Settings'
        : language === 'hr'
          ? 'Postavke'
          : language === 'it'
            ? 'Impostazioni'
            : language === 'sq'
              ? 'Cilësimet'
              : language === 'es-PE'
                ? 'Ajustes'
                : 'Einstellungen',
    backLabel:
      language === 'en'
        ? 'Back'
        : language === 'hr'
          ? 'Natrag'
          : language === 'it'
            ? 'Indietro'
            : language === 'sq'
              ? 'Mbrapa'
              : language === 'es-PE'
                ? 'Atrás'
                : 'Zurück',
    logoutMenuLabel:
      language === 'en'
        ? 'Sign out'
        : language === 'hr'
          ? 'Odjava'
          : language === 'it'
            ? 'Esci'
            : language === 'sq'
              ? 'Dilni'
              : language === 'es-PE'
                ? 'Cerrar sesión'
                : 'Abmelden',
  }

  const sections: SettingsSection[] = [
    {
      id: 'general',
      label:
        language === 'en'
          ? 'General'
          : language === 'hr'
            ? 'Opce'
            : language === 'it'
              ? 'Generale'
              : language === 'sq'
                ? 'Të përgjithshme'
                : language === 'es-PE'
                  ? 'General'
                  : 'Allgemein',
      title:
        language === 'en'
          ? 'General Settings'
          : language === 'hr'
            ? 'Opce postavke'
            : language === 'it'
              ? 'Impostazioni generali'
              : language === 'sq'
                ? 'Cilësime të përgjithshme'
                : language === 'es-PE'
                  ? 'Ajustes generales'
                  : 'Allgemeine Einstellungen',
      icon: settingsOutlinedIcon,
      iconActive: settingsFilledIcon,
    },
    {
      id: 'personalize',
      label:
        language === 'en'
          ? 'Appearance'
          : language === 'hr'
            ? 'Izgled'
            : language === 'it'
              ? 'Aspetto'
              : language === 'sq'
                ? 'Pamja'
                : language === 'es-PE'
                  ? 'Apariencia'
                  : 'Erscheinungsbild',
      title:
        language === 'en'
          ? 'Appearance'
          : language === 'hr'
            ? 'Izgled'
            : language === 'it'
              ? 'Aspetto'
              : language === 'sq'
                ? 'Pamja'
                : language === 'es-PE'
                  ? 'Apariencia'
                  : 'Erscheinungsbild',
      icon: designOutlinedIcon,
      iconActive: designFilledIcon,
    },
    {
      id: 'introduction',
      label:
        language === 'en'
          ? 'Personalize'
          : language === 'hr'
            ? 'Prilagodba'
            : language === 'it'
              ? 'Personalizza'
              : language === 'sq'
                ? 'Personalizo'
                : language === 'es-PE'
                  ? 'Personalizar'
                  : 'Personalisieren',
      title:
        language === 'en'
          ? 'Personalize'
          : language === 'hr'
            ? 'Prilagodba'
            : language === 'it'
              ? 'Personalizza'
              : language === 'sq'
                ? 'Personalizo'
                : language === 'es-PE'
                  ? 'Personalizar'
                  : 'Personalisieren',
      icon: personalizeIcon,
    },
    {
      id: 'account',
      label:
        language === 'en'
          ? 'My account'
          : language === 'hr'
            ? 'Moj racun'
            : language === 'it'
              ? 'Il mio account'
              : language === 'sq'
                ? 'Llogaria ime'
                : language === 'es-PE'
                  ? 'Mi cuenta'
                  : 'Mein Konto',
      title:
        language === 'en'
          ? 'My account'
          : language === 'hr'
            ? 'Moj racun'
            : language === 'it'
              ? 'Il mio account'
              : language === 'sq'
                ? 'Llogaria ime'
                : language === 'es-PE'
                  ? 'Mi cuenta'
                  : 'Mein Konto',
      icon: accountOutlinedIcon,
      iconActive: accountFilledIcon,
    },
    {
      id: 'billing',
      label:
        language === 'en'
          ? 'Usage & subscription'
          : language === 'hr'
            ? 'Korištenje i pretplata'
            : language === 'it'
              ? 'Utilizzo e abbonamento'
              : language === 'sq'
                ? 'Përdorimi dhe abonimi'
                : language === 'es-PE'
                  ? 'Uso y suscripción'
                  : 'Nutzung & Abonnement',
      title:
        language === 'en'
          ? 'Usage & subscription'
          : language === 'hr'
            ? 'Korištenje i pretplata'
            : language === 'it'
              ? 'Utilizzo e abbonamento'
              : language === 'sq'
                ? 'Përdorimi dhe abonimi'
                : language === 'es-PE'
                  ? 'Uso y suscripción'
                  : 'Nutzung & Abonnement',
      icon: billingOutlinedIcon,
      iconActive: billingFilledIcon,
    },
    {
      id: 'security',
      label:
        language === 'en'
          ? 'Security & login'
          : language === 'hr'
            ? 'Sigurnost i prijava'
            : language === 'it'
              ? 'Sicurezza e accesso'
              : language === 'sq'
                ? 'Siguria dhe hyrja'
                : language === 'es-PE'
                  ? 'Seguridad e inicio de sesión'
                  : 'Sicherheit & Login',
      title:
        language === 'en'
          ? 'Security & login'
          : language === 'hr'
            ? 'Sigurnost i prijava'
            : language === 'it'
              ? 'Sicurezza e accesso'
              : language === 'sq'
                ? 'Siguria dhe hyrja'
                : language === 'es-PE'
                  ? 'Seguridad e inicio de sesión'
                  : 'Sicherheit & Login',
      icon: securityOutlinedIcon,
      iconActive: securityFilledIcon,
    },
    {
      id: 'feedback',
      label:
        language === 'en'
          ? 'Report a problem'
          : language === 'hr'
            ? 'Prijavi problem'
            : language === 'it'
              ? 'Segnala un problema'
              : language === 'sq'
                ? 'Raporto një problem'
                : language === 'es-PE'
                  ? 'Reportar un problema'
                  : 'Problem melden',
      title:
        language === 'en'
          ? 'Report a problem'
          : language === 'hr'
            ? 'Prijavi problem'
            : language === 'it'
              ? 'Segnala un problema'
              : language === 'sq'
                ? 'Raporto një problem'
                : language === 'es-PE'
                  ? 'Reportar un problema'
                  : 'Problem melden',
      icon: feedbackOutlinedIcon,
      iconActive: feedbackFilledIcon,
    },
    {
      id: 'straton',
      label: 'Straton',
      title: 'Straton',
      icon: stratonMenuIcon,
    },
  ]

  return { i18n, sections }
}
