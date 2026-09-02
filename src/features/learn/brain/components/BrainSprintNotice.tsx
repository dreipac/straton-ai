/**
 * Der Sprint-Hinweis unter der Jetzt-Karte (Kapitel 6.3, Sonderfall knapper Termin).
 *
 * Bewusst KEINE zweite Karte. Zwei Karten uebereinander waeren zwei gleichrangige Angebote, und
 * der Hinweis ist keins: er sagt, WORAUS die Jetzt-Karte gerade schoepft — welcher Umfang bis zum
 * Termin gilt und was das fuer die Zeit danach heisst. Deshalb schiebt er sich als flaches Band
 * UNTER sie: oben flach, unten in der Kartenrundung, ohne eigenen Schatten. Die Jetzt-Karte
 * selbst bleibt unberuehrt und eigenstaendig.
 *
 * Der Slot bleibt immer im DOM und wandert nur per Klasse zwischen zu und offen — dieselbe
 * 0-zu-Inhalt-Technik und dieselbe Kurve wie beim Aufklappen eines Themas
 * (`.brain-node-list-panel`). Ohne das gaebe es kein Einblenden, sondern ein Springen.
 *
 * Gerechnet wird hier nichts; alles kommt aus `ui/sprintView.ts`.
 */

import { PrimaryButton } from '../../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../../components/ui/buttons/SecondaryButton'
import type { SprintCardView } from '../ui/sprintView'

export type BrainSprintNoticeProps = {
  card: SprintCardView
  /** Den vorgeschlagenen Umfang uebernehmen — oder zusaetzliche Konzepte hereinnehmen. */
  onApplyScope: (conceptIds: string[]) => void
  /** Den vollen Umfang behalten — die Tiefe sinkt trotzdem (Leiter des Verzichts). */
  onKeepAll: () => void
  /** Das Rueckhol-Angebot fuer diesmal ausschlagen. */
  onDismiss: () => void
  isBusy?: boolean
}

export function BrainSprintNotice({
  card,
  onApplyScope,
  onKeepAll,
  onDismiss,
  isBusy = false,
}: BrainSprintNoticeProps) {
  const isOpen = card.kind !== 'none'

  return (
    <div className={`brain-sprint-notice-slot${isOpen ? ' is-open' : ''}`} aria-hidden={!isOpen}>
      <div className="brain-sprint-notice-clip">
        <div className="brain-sprint-notice" aria-live="polite">
          {card.kind === 'headroom' ? (
            <>
              <div className="brain-sprint-notice-text">
                <h3 className="brain-sprint-notice-title">{card.title}</h3>
                <p className="brain-sprint-notice-body">{card.sentence}</p>
              </div>
              <div className="brain-sprint-notice-actions">
                <PrimaryButton
                  type="button"
                  onClick={() => onApplyScope(card.conceptIds)}
                  disabled={isBusy}
                  tabIndex={isOpen ? 0 : -1}
                >
                  Hereinnehmen
                </PrimaryButton>
                <SecondaryButton type="button" onClick={onDismiss} disabled={isBusy} tabIndex={isOpen ? 0 : -1}>
                  Nicht jetzt
                </SecondaryButton>
              </div>
            </>
          ) : card.kind === 'proposal' ? (
            <>
              <div className="brain-sprint-notice-text">
                <h3 className="brain-sprint-notice-title">{card.title}</h3>
                <p className="brain-sprint-notice-body">
                  {card.scopeSentence}
                  {card.isCut ? ' Der Rest bleibt im Netz.' : ''}
                </p>
                {/*
                  * Zwei Absaetze, weil es zwei Zeitraeume sind: der erste betrifft die Pruefung,
                  * der zweite die Zeit danach. Zusammengezogen entstuende der falsche Eindruck,
                  * das Gelernte sei schon am Termin weg.
                  */}
                <p className="brain-sprint-notice-body">{card.retentionSentence}</p>
              </div>
              <div className="brain-sprint-notice-actions">
                <PrimaryButton
                  type="button"
                  onClick={() => onApplyScope(card.conceptIds)}
                  disabled={isBusy}
                  tabIndex={isOpen ? 0 : -1}
                >
                  {card.isCut ? `Auf ${card.keptCount} zuschneiden` : 'Verstanden'}
                </PrimaryButton>
                {/*
                  * Faellt nichts weg, gibt es keine Wahl zu treffen — zwei Knoepfe fuer dieselbe
                  * Handlung waeren eine erfundene Entscheidung.
                  */}
                {card.isCut ? (
                  <SecondaryButton type="button" onClick={onKeepAll} disabled={isBusy} tabIndex={isOpen ? 0 : -1}>
                    {`Alle ${card.totalCount} behalten`}
                  </SecondaryButton>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
