type SubscriptionUsageMeterBarProps = {
  /** 0–100. */
  percent: number
  /** Für Screenreader — z. B. "42 / 100 verbraucht". */
  label: string
}

/**
 * Reiner Balken (Schiene + Füllung) für Abo-/Credits-Verbrauch — vorher als `.account-subscription-
 * usage-meter` (Vorschau im Composer-Hinweis) und `.billing-credits-progress` (Einstellungen →
 * Abonnement) zwei fast identische, eigenständig gepflegte Implementierungen. Jetzt eine, theme-fest
 * über `color-mix()` statt eines separaten Dark-Theme-Overrides. Layout drumherum (Icon, Titel,
 * Prozentzahl unter dem Balken, Detail-Zeilen) bleibt bewusst bei den jeweiligen Aufrufern, da sich
 * die beiden Kontexte (kompakte Vorschau vs. volle Einstellungen-Sektion) darin zu stark unterscheiden.
 */
export function SubscriptionUsageMeterBar({ percent, label }: SubscriptionUsageMeterBarProps) {
  return (
    <div
      className="usage-meter-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label}
    >
      <span className="usage-meter-bar-fill" style={{ width: `${percent}%` }} />
    </div>
  )
}
