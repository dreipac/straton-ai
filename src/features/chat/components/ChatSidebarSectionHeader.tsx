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
        <svg
          className={`chat-sidebar-section-chevron${isExpanded ? ' is-open' : ''}`}
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 10 10"
        >
          <path
            d="M3.967 2.983 L6.033 4.017 Q8 5 6.033 5.983 L3.967 7.017 Q2 8 2 5.8 L2 4.2 Q2 2 3.967 2.983 Z"
            fill="currentColor"
          />
        </svg>
        <span className="chat-sidebar-section-title">{title}</span>
      </button>
      {trailing}
    </div>
  )
}
