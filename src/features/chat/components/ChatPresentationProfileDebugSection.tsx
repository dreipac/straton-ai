import type { PresentationLayoutMetricsMeta, PresentationProfileDebugMeta } from '../types'
import { formatLayoutMetricsSummary } from '../constants/presentationProfile'

type ChatPresentationProfileDebugSectionProps = {
  profile?: PresentationProfileDebugMeta
  layoutMetrics?: PresentationLayoutMetricsMeta
}

function boolLabel(value: boolean): string {
  return value ? 'ja' : 'nein'
}

export function ChatPresentationProfileDebugSection({
  profile,
  layoutMetrics,
}: ChatPresentationProfileDebugSectionProps) {
  if (!profile && !layoutMetrics) {
    return null
  }

  return (
    <>
      {profile ? (
        <>
          <div>
            <dt>Layout — Dichte</dt>
            <dd>{profile.density}</dd>
          </div>
          <div>
            <dt>Layout — Typ</dt>
            <dd>{profile.layout}</dd>
          </div>
          <div>
            <dt>Layout — kompakt</dt>
            <dd>{boolLabel(profile.compact)}</dd>
          </div>
          <div>
            <dt>Layout — Kapitel</dt>
            <dd>{profile.chapter_style}</dd>
          </div>
          {profile.required_blocks.length > 0 ? (
            <div>
              <dt>Layout — Pflicht</dt>
              <dd>{profile.required_blocks.join(', ')}</dd>
            </div>
          ) : null}
          {profile.forbidden_blocks.length > 0 ? (
            <div>
              <dt>Layout — verboten</dt>
              <dd>{profile.forbidden_blocks.join(', ')}</dd>
            </div>
          ) : null}
          <div>
            <dt>Layout — Grund</dt>
            <dd>{profile.reason}</dd>
          </div>
        </>
      ) : null}
      {layoutMetrics ? (
        <>
          <div>
            <dt>Layout — Metriken</dt>
            <dd>{formatLayoutMetricsSummary(layoutMetrics)}</dd>
          </div>
          {layoutMetrics.layout_satisfied && layoutMetrics.layout_satisfied.length > 0 ? (
            <div>
              <dt>Layout — erfüllt</dt>
              <dd>{layoutMetrics.layout_satisfied.join(', ')}</dd>
            </div>
          ) : null}
          {layoutMetrics.layout_missing && layoutMetrics.layout_missing.length > 0 ? (
            <div>
              <dt>Layout — fehlt</dt>
              <dd>{layoutMetrics.layout_missing.join(', ')}</dd>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  )
}
