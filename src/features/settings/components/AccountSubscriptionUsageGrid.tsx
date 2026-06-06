import type { AccountSubscriptionDisplay } from '../utils/accountSubscriptionDisplay'

type AccountSubscriptionUsageGridProps = {
  display: AccountSubscriptionDisplay
}

export function AccountSubscriptionUsageGrid({ display }: AccountSubscriptionUsageGridProps) {
  return (
    <div className="account-subscription-usage-grid" role="list">
      {display.cards.map((card) => (
        <article
          key={card.id}
          className={`account-subscription-usage-card${card.tone === 'muted' ? ' is-muted' : ''}${card.tone === 'warning' ? ' is-warning' : ''}`}
          role="listitem"
        >
          <header className="account-subscription-usage-card-header">
            <h4 className="account-subscription-usage-card-title">{card.title}</h4>
            <p className="account-subscription-usage-card-headline">{card.headline}</p>
            {card.subline ? (
              <p className="account-subscription-usage-card-subline">{card.subline}</p>
            ) : null}
          </header>

          {card.meterPercent != null ? (
            <div
              className="account-subscription-usage-meter"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={card.meterPercent}
              aria-label={card.meterLabel ?? card.headline}
            >
              <div
                className="account-subscription-usage-meter-fill"
                style={{ width: `${card.meterPercent}%` }}
              />
            </div>
          ) : null}

          {card.details.length > 0 ? (
            <dl className="account-subscription-usage-details">
              {card.details.map((row) => (
                <div key={`${card.id}-${row.label}`} className="account-subscription-usage-detail-row">
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </article>
      ))}

      {display.meta.length > 0 ? (
        <div className="account-subscription-usage-meta" role="listitem">
          <dl className="account-subscription-usage-details">
            {display.meta.map((row) => (
              <div key={row.label} className="account-subscription-usage-detail-row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  )
}
