import { AccountSubscriptionUsageGrid } from '../../settings/components/AccountSubscriptionUsageGrid'
import type { AccountSubscriptionDisplay } from '../../settings/utils/accountSubscriptionDisplay'

type ChatSubscriptionUsagePreviewProps = {
  display: AccountSubscriptionDisplay
}

export function ChatSubscriptionUsagePreview({ display }: ChatSubscriptionUsagePreviewProps) {
  return (
    <div className="chat-subscription-usage-preview" role="region" aria-label="Dein Abo-Verbrauch">
      <AccountSubscriptionUsageGrid display={display} />
    </div>
  )
}
