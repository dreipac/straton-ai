import {
  DOC_GEN_MATRIX_CELLS,
  DOC_GEN_MATRIX_COLS,
  DOC_GEN_MATRIX_ROWS,
  SLIDE_GEN_MATRIX_CELLS,
  SLIDE_GEN_MATRIX_COLS,
  SLIDE_GEN_MATRIX_ROWS,
} from './chat-window/chatWindowExportMatrices'

type Shape = 'slide' | 'document'

type Props = {
  /** `slide` = 16:9-Rechteck (Präsentation), `document` = A4-Hochformat (Word). */
  shape: Shape
  ariaLabel: string
}

const SHAPE_CONFIG: Record<Shape, { cols: number; rows: number; cells: { key: string; delayMs: number }[]; panelClass: string }> = {
  slide: {
    cols: SLIDE_GEN_MATRIX_COLS,
    rows: SLIDE_GEN_MATRIX_ROWS,
    cells: SLIDE_GEN_MATRIX_CELLS,
    panelClass: 'chat-gen-dots-panel--slide',
  },
  document: {
    cols: DOC_GEN_MATRIX_COLS,
    rows: DOC_GEN_MATRIX_ROWS,
    cells: DOC_GEN_MATRIX_CELLS,
    panelClass: 'chat-gen-dots-panel--document',
  },
}

/**
 * Einheitlicher Generier-Loader im Stil des Foto-Generators (radial pulsierende Punkte), aber in der
 * Zielform: `slide` = 16:9-Rechteck, `document` = A4-Hochformat. Ersetzt den grünen Standard-Loader
 * und die «… wird aufgebaut»-Box bei Präsentations- und Word-Generierung.
 */
export function ChatGenDotsLoader({ shape, ariaLabel }: Props) {
  const config = SHAPE_CONFIG[shape]
  return (
    <div
      className={`chat-gen-dots-panel ${config.panelClass}`}
      role="status"
      aria-label={ariaLabel}
    >
      <div
        className="chat-image-gen-matrix"
        style={{
          gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${config.rows}, minmax(0, 1fr))`,
        }}
        aria-hidden
      >
        {config.cells.map(({ key, delayMs }) => (
          <span
            key={key}
            className="chat-image-gen-matrix-dot"
            style={{ animationDelay: `${delayMs}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
