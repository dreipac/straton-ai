export const IMAGE_GEN_MATRIX_SIZE = 15

export function buildImageGenMatrixDots(): { key: string; delayMs: number }[] {
  const n = IMAGE_GEN_MATRIX_SIZE
  const c = (n - 1) / 2
  const maxD = Math.hypot(c, c) || 1
  const out: { key: string; delayMs: number }[] = []
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const dist = Math.hypot(row - c, col - c)
      out.push({
        key: `ig-${row}-${col}`,
        delayMs: Math.round((dist / maxD) * 740),
      })
    }
  }
  return out
}

export const IMAGE_GEN_MATRIX_DOTS = buildImageGenMatrixDots()

/** Rechteckiges Excel-Panel — nicht 15×15 wie beim Bild, sonst stark verzerrte Raster-Zellen. */
export const EXCEL_GEN_MATRIX_COLS = 11
export const EXCEL_GEN_MATRIX_ROWS = 7

export function buildExcelGenMatrixCells(): { key: string; delayMs: number }[] {
  const cols = EXCEL_GEN_MATRIX_COLS
  const rows = EXCEL_GEN_MATRIX_ROWS
  const cx = (cols - 1) / 2
  const cy = (rows - 1) / 2
  const maxD = Math.hypot(cx, cy) || 1
  const out: { key: string; delayMs: number }[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const dist = Math.hypot(col - cx, row - cy)
      out.push({
        key: `ex-${row}-${col}`,
        delayMs: Math.round((dist / maxD) * 740),
      })
    }
  }
  return out
}

export const EXCEL_GEN_MATRIX_CELLS = buildExcelGenMatrixCells()
