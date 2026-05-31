/**
 * Vision-Uploads: iOS liefert oft HEIC, große JPEGs oder Clipboard-Dateien ohne MIME —
 * OpenAI/Anthropic erwarten JPEG/PNG/WebP/GIF mit gültiger Base64 (kein HEIC).
 */

const SUPPORTED_VISION_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

const MAX_BYTES_BEFORE_CANVAS = 4_200_000
const MAX_EDGE = 2048
const JPEG_QUALITY = 0.88

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

function extensionGuess(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

function isLikelyIos(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }
  const ua = navigator.userAgent
  return (
    /iP(hone|ad|od)/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** `image/jpg` und Zeilenumbrüche in Base64 bereinigen (iOS). */
export function normalizeVisionDataUrl(dataUrl: string): string {
  let t = dataUrl.trim().replace(/^data:image\/jpg;/i, 'data:image/jpeg;')
  const marker = 'base64,'
  const idx = t.indexOf(marker)
  if (idx === -1) {
    return t
  }
  t = t.slice(0, idx + marker.length) + t.slice(idx + marker.length).replace(/\s+/g, '')
  return t
}

function parseVisionDataUrlMime(dataUrl: string): string | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(normalizeVisionDataUrl(dataUrl))
  if (!m?.[1]) {
    return null
  }
  const mime = m[1].toLowerCase()
  return mime === 'image/jpg' ? 'image/jpeg' : mime
}

function isValidVisionDataUrl(dataUrl: string): boolean {
  const normalized = normalizeVisionDataUrl(dataUrl)
  const mime = parseVisionDataUrlMime(normalized)
  if (!mime || !SUPPORTED_VISION_MIMES.has(mime)) {
    return false
  }
  const idx = normalized.indexOf('base64,')
  if (idx === -1) {
    return false
  }
  const b64 = normalized.slice(idx + 'base64,'.length)
  return b64.length >= 32 && /^[A-Za-z0-9+/]+=*$/.test(b64)
}

async function rasterToJpegDataUrl(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<string> {
  const scale = width <= MAX_EDGE && height <= MAX_EDGE ? 1 : Math.min(MAX_EDGE / width, MAX_EDGE / height)
  const cw = Math.max(1, Math.round(width * scale))
  const ch = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Bild konnte nicht vorbereitet werden.')
  }
  ctx.drawImage(source, 0, 0, cw, ch)

  return await new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Bild konnte nicht exportiert werden.'))
          return
        }
        const r = new FileReader()
        r.onload = () => {
          const url = typeof r.result === 'string' ? normalizeVisionDataUrl(r.result) : ''
          if (!isValidVisionDataUrl(url)) {
            reject(new Error('Bild konnte nicht für die KI-Analyse aufbereitet werden.'))
            return
          }
          resolve(url)
        }
        r.onerror = () => reject(r.error ?? new Error('Lesen fehlgeschlagen.'))
        r.readAsDataURL(blob)
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

async function fileToRasterSource(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup?: () => void }> {
  try {
    const bitmap = await createImageBitmap(file)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    }
  } catch {
    const url = URL.createObjectURL(file)
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'))
      img.src = url
    })
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url),
    }
  }
}

async function encodeFileToJpegDataUrl(file: File): Promise<string> {
  const { source, width, height, cleanup } = await fileToRasterSource(file)
  try {
    return await rasterToJpegDataUrl(source, width, height)
  } finally {
    cleanup?.()
  }
}

function fileNeedsVisionEncode(file: File): boolean {
  const ext = extensionGuess(file.name)
  const typeLower = file.type.toLowerCase()

  if (
    typeLower.includes('heic') ||
    typeLower.includes('heif') ||
    ext === 'heic' ||
    ext === 'heif'
  ) {
    return true
  }

  if (
    !typeLower ||
    typeLower === 'application/octet-stream' ||
    typeLower === 'binary/octet-stream'
  ) {
    return true
  }

  const mime = typeLower === 'image/jpg' ? 'image/jpeg' : typeLower
  if (mime.startsWith('image/') && !SUPPORTED_VISION_MIMES.has(mime)) {
    return true
  }

  if (typeof file.size === 'number' && file.size > MAX_BYTES_BEFORE_CANVAS) {
    return true
  }

  if (isLikelyIos()) {
    return true
  }

  return false
}

/**
 * Liefert eine Data-URL (`image/jpeg` o. ä.) für `[BildData]` / Vision.
 */
export async function readImageFileAsVisionDataUrl(file: File): Promise<string> {
  if (fileNeedsVisionEncode(file)) {
    return encodeFileToJpegDataUrl(file)
  }

  const raw = normalizeVisionDataUrl(await readFileAsDataUrl(file))
  if (isValidVisionDataUrl(raw)) {
    return raw
  }

  return encodeFileToJpegDataUrl(file)
}
