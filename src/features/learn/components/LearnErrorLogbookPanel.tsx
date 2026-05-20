import { useMemo, useState } from 'react'
import {
  filterErrorLogbookEntries,
  type ErrorLogbookEntry,
  type ErrorLogbookFilter,
  type ErrorLogbookStats,
} from '../utils/errorLogbook'

export type LearnErrorLogbookPanelProps = {
  entries: ErrorLogbookEntry[]
  stats: ErrorLogbookStats
}

const FILTER_OPTIONS: { id: ErrorLogbookFilter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'entry_quiz', label: 'Einstiegstest' },
  { id: 'chapter', label: 'Kapitel' },
  { id: 'worksheet', label: 'Arbeitsblatt' },
]

export function LearnErrorLogbookPanel(props: LearnErrorLogbookPanelProps) {
  const { entries, stats } = props
  const [filter, setFilter] = useState<ErrorLogbookFilter>('all')

  const filtered = useMemo(() => filterErrorLogbookEntries(entries, filter), [entries, filter])

  const filterCounts = useMemo(
    () => ({
      all: stats.total,
      entry_quiz: stats.entryQuiz,
      chapter: stats.chapter,
      worksheet: stats.worksheet,
    }),
    [stats],
  )

  return (
    <section className="learn-error-logbook" aria-label="Meine Lücken">
      <header className="learn-error-logbook-header">
        <h3 className="learn-error-logbook-title">Meine Lücken</h3>
        <p className="learn-muted learn-error-logbook-lead">
          Falsch beantwortete Fragen aus Einstiegstest, Kapiteln und Arbeitsblättern — zum gezielten Nacharbeiten.
        </p>
      </header>

      {stats.total === 0 ? (
        <p className="learn-muted learn-error-logbook-empty">
          Noch keine erfassten Fehler. Sobald du im Einstiegstest, in einem Kapitel oder am Arbeitsblatt etwas falsch
          hast, erscheint es hier.
        </p>
      ) : (
        <>
          <div className="learn-error-logbook-filters" role="tablist" aria-label="Lücken filtern">
            {FILTER_OPTIONS.map((opt) => {
              const count = filterCounts[opt.id]
              const disabled = opt.id !== 'all' && count === 0
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === opt.id}
                  className={`learn-error-logbook-filter${filter === opt.id ? ' is-active' : ''}`}
                  disabled={disabled}
                  onClick={() => setFilter(opt.id)}
                >
                  {opt.label}
                  <span className="learn-error-logbook-filter-count">{count}</span>
                </button>
              )
            })}
          </div>

          {filtered.length === 0 ? (
            <p className="learn-muted learn-error-logbook-empty">In dieser Kategorie sind aktuell keine Lücken.</p>
          ) : (
            <ul className="learn-error-logbook-list">
              {filtered.map((entry) => (
                <li key={entry.id} className="learn-error-logbook-item">
                  <div className="learn-error-logbook-item-head">
                    <span className={`learn-error-logbook-badge is-${entry.source}`}>{entry.sourceLabel}</span>
                    <span className="learn-error-logbook-context">{entry.contextLabel}</span>
                  </div>
                  <p className="learn-error-logbook-prompt">{entry.prompt}</p>
                  <dl className="learn-error-logbook-details">
                    <div>
                      <dt>Deine Antwort</dt>
                      <dd>{entry.userAnswer}</dd>
                    </div>
                    <div>
                      <dt>Rückmeldung</dt>
                      <dd>{entry.feedback}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
