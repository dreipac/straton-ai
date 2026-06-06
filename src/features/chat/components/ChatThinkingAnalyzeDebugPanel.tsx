import type { ThinkingAnalyzeDebugMeta } from '../types'

type ChatThinkingAnalyzeDebugPanelProps = {
  debug: ThinkingAnalyzeDebugMeta
  compact?: boolean
}

function boolLabel(value: boolean): string {
  return value ? 'ja' : 'nein'
}

export function ChatThinkingAnalyzeDebugPanel({
  debug,
  compact = false,
}: ChatThinkingAnalyzeDebugPanelProps) {
  return (
    <details className={`chat-instant-analyze-debug${compact ? ' chat-instant-analyze-debug--compact' : ''}`}>
      <summary>Thinking-Analyse (Admin)</summary>
      <dl className="chat-instant-analyze-debug-dl">
        <div>
          <dt>Quelle</dt>
          <dd>{debug.source === 'edge' ? 'KI (Edge)' : 'Fallback (ohne Edge)'}</dd>
        </div>
        <div>
          <dt>Kategorie (task_type)</dt>
          <dd>{debug.task_type}</dd>
        </div>
        <div>
          <dt>Komplexität</dt>
          <dd>{debug.complexity}</dd>
        </div>
        <div>
          <dt>Intent</dt>
          <dd>{debug.intent || '—'}</dd>
        </div>
        <div>
          <dt>needs_clarification (KI)</dt>
          <dd>{boolLabel(debug.needs_clarification_from_ai)}</dd>
        </div>
        <div>
          <dt>needs_clarification (final)</dt>
          <dd>{boolLabel(debug.needs_clarification_final)}</dd>
        </div>
        <div>
          <dt>needs_live_web (KI)</dt>
          <dd>{boolLabel(debug.needs_live_web_from_ai)}</dd>
        </div>
        <div>
          <dt>needs_live_web (final)</dt>
          <dd>{boolLabel(debug.needs_live_web_final)}</dd>
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
        <div>
          <dt>Klärungsrunden geplant</dt>
          <dd>{String(debug.clarify_rounds_planned_final)}</dd>
        </div>
        <div>
          <dt>Heuristik angepasst</dt>
          <dd>{boolLabel(debug.heuristic_applied)}</dd>
        </div>
        {debug.analysis_summary ? (
          <div>
            <dt>Zusammenfassung</dt>
            <dd>{debug.analysis_summary}</dd>
          </div>
        ) : null}
      </dl>
    </details>
  )
}
