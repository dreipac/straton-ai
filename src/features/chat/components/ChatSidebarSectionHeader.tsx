import type { ReactNode } from 'react'

type ChatSidebarSectionHeaderProps = {
  title: string
  isExpanded: boolean
  onToggle: () => void
  trailing?: ReactNode
}

export function ChatSidebarSectionHeader({
  title,
  isExpanded,
  onToggle,
  trailing,
}: ChatSidebarSectionHeaderProps) {
  return (
    <div className="chat-sidebar-section-header-wrap">
      <button
        type="button"
        className="chat-sidebar-section-toggle"
        aria-expanded={isExpanded}
        aria-label={isExpanded ? `${title} einklappen` : `${title} ausklappen`}
        onClick={onToggle}
      >
        <span className={`chat-sidebar-section-chevron${isExpanded ? ' is-open' : ''}`} aria-hidden="true">
          ▶
        </span>
        <span className="chat-sidebar-section-title">{title}</span>
        <span className="chat-sidebar-section-line" aria-hidden="true" />
      </button>
      {trailing}
    </div>
  )
}
