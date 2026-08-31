/**
 * Die Abschlussbilanz (UI-Spezifikation 4.9).
 *
 * „Nicht ‚gut gemacht', sondern was sich veraendert hat."
 *
 * Dieser Bildschirm traegt das gesamte Erlebnis der Sitzung, weil waehrend der Sitzung bewusst
 * keine Werte gezeigt wurden (Kapitel 4.8). Er ist kein Anhaengsel — er ist der Grund, warum
 * Zwischenstaende weggelassen werden durften.
 *
 * Die Reihenfolge der Zeilen ist inhaltlich: bewegte Beherrschung zuerst, dann die Sicherheiten
 * (dort wird die Propagation sichtbar), dann neue Knoten. Umgekehrt gelesen wirkten die
 * Nebenwirkungen wie die Hauptsache.
 */

import { PrimaryButton } from '../../../../components/ui/buttons/PrimaryButton'
import type { SessionSummaryView } from '../ui/sessionView'

export type BrainSessionSummaryProps = {
  summary: SessionSummaryView
  onBackToPath: () => void
}

export function BrainSessionSummary({ summary, onBackToPath }: BrainSessionSummaryProps) {
  return (
    <section className="brain-summary" aria-label="Abschlussbilanz">
      <p className="brain-summary-kicker">Sitzung beendet</p>
      <h2 className="brain-summary-title">{summary.headline}</h2>
      <p className="brain-summary-stats">{summary.stats}</p>

      {summary.changes.length > 0 ? (
        <ul className="brain-summary-changes">
          {summary.changes.map((change) => (
            <li key={`${change.kind}-${change.conceptId}`} className={`brain-summary-change brain-summary-change--${change.kind}`}>
              <span className="brain-summary-change-dot" aria-hidden="true" />
              <span className="brain-summary-change-name">{change.conceptName}</span>
              <span className="brain-summary-change-value">{change.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="brain-summary-empty">
          Diesmal hat sich nichts messbar verschoben — dafür weiss ich jetzt genauer, wo du stehst.
        </p>
      )}

      {summary.resolvedInserts.length > 0 ? (
        <p className="brain-summary-inserts">
          {summary.resolvedInserts.length === 1
            ? `Der Einschub „${summary.resolvedInserts[0]}" ist erledigt.`
            : `Erledigte Einschübe: ${summary.resolvedInserts.join(', ')}.`}
        </p>
      ) : null}

      {/* Kaltstart-Einordnung, nur nach der ersten Sitzung (Kapitel 10). */}
      {summary.coldStartVerdict ? <p className="brain-summary-coldstart">{summary.coldStartVerdict}</p> : null}

      {summary.nextStep ? <p className="brain-summary-next">{summary.nextStep}</p> : null}

      <PrimaryButton type="button" onClick={onBackToPath}>
        Zurück zum Pfad
      </PrimaryButton>
    </section>
  )
}
