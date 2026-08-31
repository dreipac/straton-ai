import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import creditsIcon from '../../../assets/icons/credits.svg'
import pictureIcon from '../../../assets/icons/picture.svg'
import webIcon from '../../../assets/icons/web-outlined.svg'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { SubscriptionUsageMeterBar } from './SubscriptionUsageMeterBar'
import {
  buildAccountSubscriptionDisplay,
  type AccountSubscriptionUsageCard,
  type AccountSubscriptionPlanInput,
  type AccountSubscriptionUsageInput,
} from '../utils/accountSubscriptionDisplay'

type BillingSettingsSectionProps = {
  subscriptionPlan: AccountSubscriptionPlanInput | null
  subscriptionUsage: AccountSubscriptionUsageInput | null
}

/* Die Verbrauchsangaben stehen hier nicht als Karten im Raster, sondern als eigene Abschnitte direkt
   auf dem Hintergrund — je Eintrag Icon, Titel, Verbrauchszahlen und Balken. Reihenfolge und
   Beschriftung sind bewusst hier festgelegt und nicht in `buildAccountSubscriptionDisplay`, weil das
   gemeinsame Raster (Chat-Vorschau) unverändert weiterläuft. Die Dateien-Karte fehlt absichtlich. */
const USAGE_SECTIONS: {
  id: string
  icon: string
  title: string
  subtitle: string
  /** Läuft über beide Spalten statt nur über eine halbe. */
  wide?: boolean
}[] = [
  { id: 'ai-credits', icon: creditsIcon, title: 'Credits', subtitle: 'Täglich' },
  { id: 'images', icon: pictureIcon, title: 'Bildgenerierung', subtitle: 'Täglich' },
  { id: 'web-search', icon: webIcon, title: 'Websuche', subtitle: 'Täglich', wide: true },
]

function BillingUsageSection({
  icon,
  title,
  subtitle,
  wide,
  card,
}: {
  icon: string
  title: string
  subtitle: string
  wide?: boolean
  card: AccountSubscriptionUsageCard
}) {
  return (
    <section className={`billing-usage-section${wide ? ' is-wide' : ''}`}>
      <div className="billing-credits-heading">
        <img className="ui-icon billing-credits-title-icon" src={icon} alt="" aria-hidden="true" />
        <span className="billing-credits-heading-text">
          <span className="billing-settings-subtitle billing-credits-title">{title}</span>
          <span className="billing-credits-subtitle">{subtitle}</span>
        </span>
      </div>
      <div className="settings-section-divider" />
      <div className="billing-credits-block">
        {card.meterParts ? (
          <p className="billing-credits-usage">
            <span className="billing-credits-usage-value">
              <span className="billing-credits-usage-used">{card.meterParts.used} /</span>{' '}
              {card.meterParts.total}
            </span>
            <span className="billing-credits-usage-caption">{card.meterParts.caption}</span>
          </p>
        ) : (
          <p className="billing-credits-usage-plain">{card.meterLabel ?? card.headline}</p>
        )}
        {card.meterPercent != null ? (
          <div
            className="billing-credits-progress-wrap"
            style={{ '--billing-credits-percent': `${card.meterPercent}%` } as CSSProperties}
          >
            <SubscriptionUsageMeterBar
              percent={card.meterPercent}
              label={`${title}: ${card.meterLabel ?? card.headline}`}
            />
            <div className="billing-credits-progress-scale" aria-hidden="true">
              <span className="billing-credits-progress-value">{card.meterPercent}%</span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function BillingSettingsSection({
  subscriptionPlan,
  subscriptionUsage,
}: BillingSettingsSectionProps) {
  const [isManageModalOpen, setIsManageModalOpen] = useState(false)

  /* Der Dialog hat bewusst keine Schaltflächen — Escape und Klick auf den Hintergrund schliessen. */
  useEffect(() => {
    if (!isManageModalOpen) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsManageModalOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isManageModalOpen])

  const subscriptionDisplay = useMemo(
    () => buildAccountSubscriptionDisplay(subscriptionPlan, subscriptionUsage),
    [subscriptionPlan, subscriptionUsage],
  )

  const usageSections = useMemo(() => {
    if (!subscriptionDisplay) {
      return []
    }
    return USAGE_SECTIONS.flatMap((section) => {
      const card = subscriptionDisplay.cards.find((entry) => entry.id === section.id)
      return card ? [{ ...section, card }] : []
    })
  }, [subscriptionDisplay])

  return (
    <section className="billing-settings-panel">
      <p className="billing-settings-subtitle">Abonnement</p>
      <div className="settings-section-divider" />
      <div className="account-settings-subscription-block">
        <div className="billing-plan-row">
          <p className="account-settings-subscription-value" role="status">
            {subscriptionDisplay?.planName ?? 'Kein Abo zugewiesen'}
          </p>
          <button
            type="button"
            className="general-language-trigger general-language-trigger--plain"
            onClick={() => setIsManageModalOpen(true)}
          >
            Verwalten
          </button>
        </div>
        {subscriptionPlan ? null : (
          <p className="account-settings-subscription-hint">
            Sobald ein Abo zugewiesen ist, siehst du hier Limits und Guthaben.
          </p>
        )}
      </div>

      {usageSections.length > 0 ? (
        <>
          <div className="billing-section-gap" />
          <p className="billing-settings-subtitle">Nutzung</p>
          <div className="settings-section-divider" />
          <div className="billing-usage-sections">
            {usageSections.map((section) => (
              <BillingUsageSection
                key={section.id}
                icon={section.icon}
                title={section.title}
                subtitle={section.subtitle}
                wide={section.wide}
                card={section.card}
              />
            ))}
          </div>
        </>
      ) : null}

      <ModalShell
        isOpen={isManageModalOpen}
        className="billing-manage-overlay"
        onRequestClose={() => setIsManageModalOpen(false)}
      >
        <div className="billing-manage-dialog" role="dialog" aria-modal="true" aria-label="Abo verwalten">
          <p className="billing-manage-dialog-text">Noch nicht verfügbar.</p>
        </div>
      </ModalShell>
    </section>
  )
}
