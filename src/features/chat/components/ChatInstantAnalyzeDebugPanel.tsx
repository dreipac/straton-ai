import type { InstantAnalyzeDebugMeta } from '../types'
import { ChatPresentationProfileDebugSection } from './ChatPresentationProfileDebugSection'

type ChatInstantAnalyzeDebugPanelProps = {
  debug: InstantAnalyzeDebugMeta
  compact?: boolean
}

function boolLabel(value: boolean): string {
  return value ? 'ja' : 'nein'
}

export function ChatInstantAnalyzeDebugPanel({ debug, compact = false }: ChatInstantAnalyzeDebugPanelProps) {
  return (
    <details className={`chat-instant-analyze-debug${compact ? ' chat-instant-analyze-debug--compact' : ''}`}>
      <summary>Instant-Analyse (Admin)</summary>
      <dl className="chat-instant-analyze-debug-dl">
        <div>
          <dt>Quelle</dt>
          <dd>{debug.source === 'edge' ? 'KI (Edge)' : 'Fallback (ohne Edge)'}</dd>
        </div>
        <div>
          <dt>category (final)</dt>
          <dd>{debug.category}</dd>
        </div>
        <div>
          <dt>action (final)</dt>
          <dd>{debug.action}</dd>
        </div>
        <div>
          <dt>category (KI)</dt>
          <dd>{debug.category_from_ai}</dd>
        </div>
        <div>
          <dt>action (KI)</dt>
          <dd>{debug.action_from_ai}</dd>
        </div>
        <div>
          <dt>task_type (final)</dt>
          <dd>{debug.task_type}</dd>
        </div>
        <div>
          <dt>task_type (KI)</dt>
          <dd>{debug.task_type_from_ai}</dd>
        </div>
        <div>
          <dt>explanation_depth (final)</dt>
          <dd>{debug.explanation_depth}</dd>
        </div>
        <div>
          <dt>explanation_depth (KI)</dt>
          <dd>{debug.explanation_depth_from_ai}</dd>
        </div>
        <div>
          <dt>Klarheit</dt>
          <dd>{debug.clarity}</dd>
        </div>
        <div>
          <dt>Intent</dt>
          <dd>{debug.intent || '—'}</dd>
        </div>
        <div>
          <dt>reply_mode</dt>
          <dd>{debug.reply_mode}</dd>
        </div>
        <div>
          <dt>needs_live_web (KI)</dt>
          <dd>{boolLabel(debug.needs_live_web_from_ai)}</dd>
        </div>
        <div>
          <dt>needs_live_web (final)</dt>
          <dd>{boolLabel(debug.needs_live_web_final)}</dd>
        </div>
        <div>
          <dt>Heuristik angepasst</dt>
          <dd>{boolLabel(debug.heuristic_applied)}</dd>
        </div>
        <div>
          <dt>Web geplant</dt>
          <dd>{boolLabel(debug.auto_web_planned)}</dd>
        </div>
        <div>
          <dt>Tavily ausgeführt</dt>
          <dd>{boolLabel(debug.auto_web_ran)}</dd>
        </div>
        {debug.web_query ? (
          <div>
            <dt>web_query</dt>
            <dd>{debug.web_query}</dd>
          </div>
        ) : null}
        {debug.web_reason ? (
          <div>
            <dt>web_reason</dt>
            <dd>{debug.web_reason}</dd>
          </div>
        ) : null}
        {debug.missing.length > 0 ? (
          <div>
            <dt>missing</dt>
            <dd>{debug.missing.join(' · ')}</dd>
          </div>
        ) : null}
        {debug.document_coverage_topics && debug.document_coverage_topics.length > 0 ? (
          <div>
            <dt>Pflicht-Themen</dt>
            <dd>{debug.document_coverage_topics.join(' · ')}</dd>
          </div>
        ) : null}
        <ChatPresentationProfileDebugSection
          profile={debug.presentation_profile}
          layoutMetrics={debug.layout_metrics}
        />
      </dl>
    </details>
  )
}
