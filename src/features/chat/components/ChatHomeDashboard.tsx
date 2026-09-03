import { useMemo, type CSSProperties } from 'react'
import { ChatEmptyGreetingTitle } from './ChatEmptyGreetingTitle'
import { LearningPathProgressRing } from './LearningPathProgressRing'
import { getChatEmptyGreeting } from '../utils/chatEmptyGreeting'

type ChatHomeDashboardContinuePath = {
  id: string
  title: string
  currentTopicTitle: string
  currentSubstepTitle: string
  percent: number
}

type ChatHomeDashboardPathListItem = {
  id: string
  title: string
  masteredCount: number
  totalCount: number
  percent: number
}

type ChatHomeDashboardProps = {
  greetingName: string
  learningPathsCount: number
  continuePath: ChatHomeDashboardContinuePath | null
  allPaths: ChatHomeDashboardPathListItem[]
  onOpenPath: (pathId: string) => void
  /** Anzahl über alle Lernpfade fälliger Lernkarten (Spaced Repetition). */
  dueFlashcardsCount: number
  onOpenDueFlashcards: () => void
  /** Mobile Ansicht (≤860px): reduzierte Begrüßung + eigener Button zum Sidebar-Öffnen statt Bottom-Nav. */
  isMobile: boolean
  onOpenSidebar: () => void
}

export function ChatHomeDashboard({
  greetingName,
  learningPathsCount,
  continuePath,
  allPaths,
  onOpenPath,
  dueFlashcardsCount,
  onOpenDueFlashcards,
  isMobile,
  onOpenSidebar,
}: ChatHomeDashboardProps) {
  const greeting = useMemo(() => getChatEmptyGreeting(greetingName), [greetingName])
  const subtitle = `${learningPathsCount} ${learningPathsCount === 1 ? 'Lernpfad' : 'Lernpfade'}`
  const metaLine = continuePath
    ? [continuePath.currentTopicTitle, continuePath.currentSubstepTitle].filter(Boolean).join(' · ')
    : ''

  return (
    <div className="chat-home-dashboard">
      {isMobile ? (
        <button
          type="button"
          className="chat-home-dashboard-mobile-menu-btn"
          aria-label="Sidebar öffnen"
          onClick={onOpenSidebar}
        >
          <span className="chat-home-dashboard-mobile-menu-btn-icon" aria-hidden="true" />
        </button>
      ) : null}
      {isMobile ? (
        <h2 className="chat-home-dashboard-mobile-title">Willkommen</h2>
      ) : (
        <ChatEmptyGreetingTitle greet={greeting.greet} ask={greeting.ask} animationKey="home-dashboard" />
      )}
      <p className="chat-home-dashboard-subtitle">{subtitle}</p>
      {continuePath ? (
        <button
          type="button"
          className={`chat-home-continue-card${isMobile ? ' squircle' : ''}`}
          onClick={() => onOpenPath(continuePath.id)}
        >
          <span className="chat-home-continue-card-body">
            <span className="chat-home-continue-card-label">Weitermachen</span>
            <span className="chat-home-continue-card-title">{continuePath.title}</span>
            {metaLine ? <span className="chat-home-continue-card-meta">{metaLine}</span> : null}
          </span>
          <span className="chat-home-continue-card-side">
            <LearningPathProgressRing percent={continuePath.percent} className="chat-home-continue-card-ring" />
            <span className="chat-home-continue-card-arrow" aria-hidden="true" />
          </span>
        </button>
      ) : null}
      {dueFlashcardsCount > 0 ? (
        <button
          type="button"
          className="chat-home-due-flashcards-hint"
          onClick={onOpenDueFlashcards}
        >
          <span className="chat-home-due-flashcards-hint-icon" aria-hidden="true" />
          <span className="chat-home-due-flashcards-hint-text">
            {dueFlashcardsCount} Lernkarte{dueFlashcardsCount === 1 ? '' : 'n'} zum Wiederholen
          </span>
          <span className="chat-home-due-flashcards-hint-arrow" aria-hidden="true" />
        </button>
      ) : null}
      {allPaths.length > 0 ? (
        <section className="chat-home-paths-section">
          <h3 className="chat-home-paths-heading">Deine Lernpfade</h3>
          <div className="chat-home-paths-list">
            {allPaths.map((path, index) => (
              <button
                key={path.id}
                type="button"
                className="chat-home-path-row"
                style={{ '--chat-home-path-enter-index': index } as CSSProperties}
                onClick={() => onOpenPath(path.id)}
              >
                <LearningPathProgressRing percent={path.percent} className="chat-home-path-row-ring" />
                <span className="chat-home-path-row-body">
                  <span className="chat-home-path-row-title">{path.title}</span>
                  <span className="chat-home-path-row-meta">
                    {path.masteredCount}/{path.totalCount} Themen
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
