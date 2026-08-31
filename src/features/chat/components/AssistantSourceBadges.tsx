import type { AssistantSourceLink } from '../utils/assistantSourceBadges'

type AssistantSourceBadgesProps = {
  sources: AssistantSourceLink[]
  leadText?: string
}

export function AssistantSourceBadges({ sources, leadText }: AssistantSourceBadgesProps) {
  if (sources.length === 0) {
    return null
  }

  return (
    <footer className="chat-source-badges" aria-label="Quellen">
      {leadText ? <p className="chat-source-badges-lead">{leadText}</p> : null}
      <div className="chat-source-badges-row" role="list">
        {sources.map((source) => (
          <a
            key={source.href}
            role="listitem"
            className="chat-source-badge"
            href={source.href}
            target="_blank"
            rel="noopener noreferrer"
            title={source.href}
          >
            {source.label}
          </a>
        ))}
      </div>
    </footer>
  )
}
