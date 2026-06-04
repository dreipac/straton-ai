import type { ExcelSpecV1 } from '../excel/excelSpec'

function formatExcelPreviewCell(cell: unknown): string {
  if (cell === null || cell === undefined) {
    return ''
  }
  if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
    return String(cell)
  }
  if (typeof cell !== 'object' || Array.isArray(cell)) {
    return String(cell)
  }
  const o = cell as Record<string, unknown>
  const t = typeof o.t === 'string' ? o.t.trim().toLowerCase() : ''
  if (t === 'f' || t === 'formula') {
    const formula = typeof o.formula === 'string' ? o.formula : typeof o.f === 'string' ? o.f : ''
    return formula.trim() || '—'
  }
  const val = o.value !== undefined ? o.value : o.val
  if (val === null || val === undefined) {
    return ''
  }
  return String(val)
}

type Props = {
  spec: ExcelSpecV1
}

export function ExcelSpecPreviewBuilding() {
  return (
    <div className="word-outline-paper word-outline-paper--building" role="status" aria-live="polite">
      <div className="word-outline-paper__body">
        <p className="word-outline-paper__building-hint">Tabellenvorschau wird aufgebaut …</p>
      </div>
    </div>
  )
}

/** Vorschau der ersten Excel-Tabelle im Chat (JSON bleibt unsichtbar). */
export function ExcelSpecPreview({ spec }: Props) {
  const sheet = spec.sheets[0]
  if (!sheet) {
    return null
  }
  const rows = sheet.rows ?? []
  const maxPreviewRows = 24
  const previewRows = rows.slice(0, maxPreviewRows)
  const fileLabel = spec.fileName?.trim() || 'export.xlsx'
  const sheetNames = spec.sheets.map((s) => s.name).filter(Boolean)

  return (
    <div className="word-outline-paper excel-spec-preview" role="region" aria-label="Excel-Vorschau">
      <p className="excel-spec-preview__meta">
        <span className="excel-spec-preview__file">{fileLabel}</span>
        {sheetNames.length > 1 ? (
          <span className="excel-spec-preview__sheets">
            Blätter: {sheetNames.join(', ')}
          </span>
        ) : sheet.name ? (
          <span className="excel-spec-preview__sheets">Blatt: {sheet.name}</span>
        ) : null}
      </p>
      <div className="word-outline-paper__body">
        {previewRows.length === 0 ? (
          <p className="word-outline-paper__building-hint">Keine Tabellendaten in der Vorschau.</p>
        ) : (
          <div className="word-outline-paper__table-wrap">
            <table className="word-outline-paper__table">
              <tbody>
                {previewRows.map((row, ri) => (
                  <tr key={`r-${ri}`}>
                    {(Array.isArray(row) ? row : []).map((cell, ci) => (
                      <td key={`c-${ri}-${ci}`}>{formatExcelPreviewCell(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > maxPreviewRows ? (
          <p className="excel-spec-preview__truncated">
            … und {rows.length - maxPreviewRows} weitere Zeilen (nach «Excel generieren» vollständig).
          </p>
        ) : null}
      </div>
    </div>
  )
}
