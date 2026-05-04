/**
 * Vision-Uploads: iOS liefert oft HEIC, große JPEGs oder Clipboard-Dateien ohne MIME —
 * OpenAI/Anthropic erwarten üblicherweise JPEG/PNG mit kompakter Base64.
 */

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('Datei konnte nicht gelesen werden.'))
    }
    reader.readAsDataURL(file)
  })
}

const MAX_BYTES_BEFORE_CANVAS = 4_200_000

function extensionGuess(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

/**
 * Liefert eine Data-URL (typisch `image/jpeg`) für `[BildData]` / Vision.
 */
export async function readImageFileAsVisionDataUrl(file: File): Promise<string> {
  const ext = extensionGuess(file.name)
  const typeLower = file.type.toLowerCase()

  const likelyHeic =
    typeLower.includes('heic') ||
    typeLower.includes('heif') ||
    ext === 'heic' ||
    ext === 'heif'

  const unknownOrBinaryType =
    !typeLower ||
    typeLower === 'application/octet-stream' ||
    typeLower === 'binary/octet-stream'

  const needsCanvasPipeline =
    likelyHeic || unknownOrBinaryType || (typeof file.size === 'number' && file.size > MAX_BYTES_BEFORE_CANVAS)

  if (!needsCanvasPipeline) {
    return readFileAsDataUrl(file)
  }

  try {
    const bitmap = await createImageBitmap(file)
    try {
      const maxEdge = 2048
      const w = bitmap.width
      const h = bitmap.height
      const scale = w <= maxEdge && h <= maxEdge ? 1 : Math.min(maxEdge / w, maxEdge / h)
      const cw = Math.max(1, Math.round(w * scale))
      const ch = Math.max(1, Math.round(h * scale))

      const canvas = document.createElement('canvas')
      canvas.width = cw
      canvas.height = ch
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return readFileAsDataUrl(file)
      }
      ctx.drawImage(bitmap, 0, 0, cw, ch)

      return await new Promise<string>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Bild konnte nicht exportiert werden.'))
              return
            }
            const r = new FileReader()
            r.onload = () => resolve(typeof r.result === 'string' ? r.result : '')
            r.onerror = () => reject(r.error ?? new Error('Lesen fehlgeschlagen.'))
            r.readAsDataURL(blob)
          },
          'image/jpeg',
          0.88,
        )
      })
    } finally {
      bitmap.close()
    }
  } catch {
    return readFileAsDataUrl(file)
  }
}
