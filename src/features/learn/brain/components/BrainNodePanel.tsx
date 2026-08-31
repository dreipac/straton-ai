/**
 * Das Knoten-Panel (UI-Spezifikation 3.6).
 *
 * „Oeffnet sich beim Antippen eines Knotens — rechts auf Desktop, als Sheet von unten auf Mobil.
 *  KEIN Bildschirmwechsel." Deshalb ist es ein Panel im Fluss und kein Modal mit eigener Route:
 * ein Bildschirmwechsel fuer einen Blick auf drei Werte kostet den Faden.
 *
 * Zwei Pflichten aus dem Kapitel sind hier eingebaut und nicht optional:
 *
 *  - Die **Herkunftszeile** (Invariante I4 an der Oberflaeche). Bei KI-ergaenzten Knoten
 *    zusaetzlich die Bitte, gegen den Unterricht zu pruefen.
 *  - Die **Erklaerung der drei Werte**. Ohne sie liest ein Schueler „Sicherheit niedrig" als
 *    zweite Note — und damit waere der Wert, der Vertrauen schaffen soll, eine Abwertung. Statt
 *    eines gesammelten Blocks unter der Karte traegt jeder Wert dafuer ein eigenes „i": ein Klick
 *    zeigt genau die ein bis zwei Saetze zu GENAU DIESEM Wert in einem kleinen Modal
 *    (`BrainValueInfoDialog`), nicht alle drei auf einmal.
 */

import { PrimaryButton } from '../../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../../components/ui/buttons/SecondaryButton'
import { MaskIcon } from '../../../../components/ui/MaskIcon'
import editIcon from '../../../../assets/icons/edit.svg'
import infoOutlinedIcon from '../../../../assets/icons/info-outlined.svg'
import infoFilledIcon from '../../../../assets/icons/info-filled.svg'
import { DEPTH_LABEL, type BrainValueTerm, type NodePanelView } from '../ui/pathView'

export type BrainNodePanelProps = {
  panel: NodePanelView
  onShowValueInfo: (term: BrainValueTerm) => void
  onPractise: (conceptId: string) => void
  onExplain: (conceptId: string) => void
  onAskInChat: (conceptId: string) => void
  onEdit: (conceptId: string) => void
  onClose: () => void
}

/**
 * Kleines Info-Icon neben einem Wertnamen — oeffnet dessen Erklaerung (siehe Dateikopf).
 * Nur das Zeichen selbst, keine Buttonform: Umriss in Ruhe, gefuellt plus Akzentfarbe im
 * Hover/Fokus, mit derselben neutralen Hover-Flaeche wie die Sidebar-Icon-Buttons.
 */
function ValueInfoButton({ term, onShow }: { term: BrainValueTerm; onShow: (term: BrainValueTerm) => void }) {
  return (
    <button
      type="button"
      className="brain-value-info-button"
      onClick={() => onShow(term)}
      aria-label={`Was bedeutet "${term}"?`}
    >
      <MaskIcon src={infoOutlinedIcon} className="brain-value-info-icon brain-value-info-icon--outlined" />
      <MaskIcon src={infoFilledIcon} className="brain-value-info-icon brain-value-info-icon--filled" />
    </button>
  )
}

export function BrainNodePanel(props: BrainNodePanelProps) {
  const { panel } = props

  return (
    <aside className="brain-node-panel" aria-label={`Konzept ${panel.name}`}>
      <header className="brain-node-panel-head">
        {/* Wie beim Lernpfad-Titel (`.learn-page-title-edit` in `LearnPage.tsx`): dezentes Icon
            direkt neben dem Titel statt eines eigenen Buttons unten in den Aktionen. */}
        <div className="brain-node-panel-title-row">
          <h3 className="brain-node-panel-title">{panel.name}</h3>
          <button
            type="button"
            className="brain-node-panel-edit"
            onClick={() => props.onEdit(panel.conceptId)}
            aria-label="Konzept bearbeiten"
          >
            <MaskIcon src={editIcon} className="brain-node-panel-edit-icon" />
          </button>
        </div>
        <button type="button" className="brain-node-panel-close" onClick={props.onClose} aria-label="Schliessen">
          ×
        </button>
      </header>

      {/* Invariante I4 an der Oberflaeche. */}
      <p className={`brain-node-panel-provenance${panel.provenance.needsUserCheck ? ' needs-check' : ''}`}>
        {panel.provenance.line}
      </p>
      {panel.provenance.needsUserCheck ? (
        <p className="brain-node-panel-provenance-hint">
          Prüf bitte kurz, ob das im Unterricht vorkam — geprüft wirst du an deinem Material.
        </p>
      ) : null}

      <div className="brain-values">
        <div className="brain-value">
          <span className="brain-value-label-row">
            <span className="brain-value-label">Beherrschung</span>
            <ValueInfoButton term="Beherrschung" onShow={props.onShowValueInfo} />
          </span>
          <span className="brain-value-figure">{Math.round(panel.mastery * 100)} %</span>
          <span className="brain-value-bar" aria-hidden="true">
            <span style={{ width: `${Math.round(panel.mastery * 100)}%` }} />
          </span>
        </div>

        <div className="brain-value">
          <span className="brain-value-label-row">
            <span className="brain-value-label">Sicherheit</span>
            <ValueInfoButton term="Sicherheit" onShow={props.onShowValueInfo} />
          </span>
          {/* Bewusst als Wort: eine Prozentzahl daneben liest sich wie eine zweite Note — und
              bewusst nicht fett (`--word`), aus demselben Grund. */}
          <span className="brain-value-figure brain-value-figure--word">{panel.confidenceWord}</span>
          <span className="brain-value-bar" aria-hidden="true">
            <span style={{ width: `${Math.round(panel.confidence * 100)}%` }} />
          </span>
        </div>

        <div className="brain-value brain-value--depth">
          <span className="brain-value-label-row">
            <span className="brain-value-label">Verständnisstufe</span>
            <ValueInfoButton term="Verständnisstufe" onShow={props.onShowValueInfo} />
          </span>
          {/* Drei Balken statt Textpillen: Farbe traegt die Stufe (dezentes Rot → Gelb → Gruen),
              der Name daneben und im Info-Modal traegt weiterhin die Bedeutung. */}
          <span
            className="brain-depth-bars"
            role="img"
            aria-label={`Verständnisstufe: ${DEPTH_LABEL[panel.depth]}`}
          >
            {(['recognize', 'apply', 'transfer'] as const).map((depth, index) => (
              <span
                key={depth}
                className={`brain-depth-bar brain-depth-bar--${depth}${
                  index <= ['recognize', 'apply', 'transfer'].indexOf(panel.depth) ? ' is-reached' : ''
                }`}
                aria-hidden="true"
              />
            ))}
          </span>
        </div>
      </div>

      {panel.lastFinding ? <p className="brain-node-panel-finding">{panel.lastFinding}</p> : null}

      {panel.prerequisites.length > 0 ? (
        <p className="brain-node-panel-prerequisites">
          Setzt voraus: {panel.prerequisites.map((entry) => entry.name).join(', ')}
        </p>
      ) : null}

      <div className="brain-node-panel-actions">
        <PrimaryButton type="button" onClick={() => props.onPractise(panel.conceptId)}>
          Hier üben
        </PrimaryButton>
        <SecondaryButton type="button" onClick={() => props.onExplain(panel.conceptId)}>
          Erklären lassen
        </SecondaryButton>
        <SecondaryButton type="button" onClick={() => props.onAskInChat(panel.conceptId)}>
          Im Chat dazu fragen
        </SecondaryButton>
      </div>
    </aside>
  )
}
