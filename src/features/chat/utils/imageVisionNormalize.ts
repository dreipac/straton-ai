/**
 * Vision-Uploads: iOS liefert oft HEIC, große JPEGs oder Clipboard-Dateien ohne MIME —
 * OpenAI/Anthropic erwarten JPEG/PNG/WebP/GIF mit gültiger Base64 (kein HEIC).
 */

const SUPPORTED_VISION_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

const MAX_BYTES_BEFORE_CANVAS = 4_200_000
/** Vision: Base64-Länge ≈ Text-Tokens, wenn die API sie als Rohstring sieht. */
const MAX_VISION_DATA_URL_CHARS = 280_000
/** Desktop / iOS — klein genug für `detail: low`, scharf genug für Tastatur/Foto. */
const MAX_EDGE_DESKTOP = 1280
const MAX_EDGE_MOBILE = 768
const JPEG_QUALITY_DESKTOP = 0.82
const JPEG_QUALITY_MOBILE = 0.72

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

/** Kein `/^…(.+)$/` auf 100k+ Base64 — bricht in Browser/Edge sonst oft. */
export function isValidVisionDataUrl(dataUrl: string): boolean {
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
  if (b64.length < 32) {
    return false
  }
  for (let i = 0; i < b64.length; i += 1) {
    const ch = b64[i]!
    if (
      (ch >= 'A' && ch <= 'Z') ||
      (ch >= 'a' && ch <= 'z') ||
      (ch >= '0' && ch <= '9') ||
      ch === '+' ||
      ch === '/' ||
      ch === '='
    ) {
      continue
    }
    return false
  }
  return true
}

function visionMaxEdge(): number {
  return isLikelyIos() ? MAX_EDGE_MOBILE : MAX_EDGE_DESKTOP
}

function visionJpegQuality(): number {
  return isLikelyIos() ? JPEG_QUALITY_MOBILE : JPEG_QUALITY_DESKTOP
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

async function encodeRasterSourceToJpegUnderBudget(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxEdge: number,
  quality: number,
): Promise<string> {
  const scale =
    width <= maxEdge && height <= maxEdge ? 1 : Math.min(maxEdge / width, maxEdge / height)
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
      quality,
    )
  })
}

async function encodeFileToJpegDataUrl(file: File): Promise<string> {
  const { source, width, height, cleanup } = await fileToRasterSource(file)
  try {
    let maxEdge = visionMaxEdge()
    let quality = visionJpegQuality()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const url = await encodeRasterSourceToJpegUnderBudget(source, width, height, maxEdge, quality)
      if (url.length <= MAX_VISION_DATA_URL_CHARS) {
        return url
      }
      maxEdge = Math.max(480, Math.round(maxEdge * 0.72))
      quality = Math.max(0.55, quality - 0.08)
    }
    throw new Error('Foto ist auch nach Komprimierung zu groß. Bitte näher heranzoomen oder ein kleineres Bild wählen.')
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
function dataUrlToBlob(dataUrl: string): Blob {
  const normalized = normalizeVisionDataUrl(dataUrl)
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(normalized)
  if (!m?.[2]) {
    throw new Error('Bildformat ungültig.')
  }
  const mime = (m[1] ?? 'image/jpeg').toLowerCase() === 'image/jpg' ? 'image/jpeg' : (m[1] ?? 'image/jpeg')
  const binary = atob(m[2]!.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

async function dataUrlToRasterSource(
  dataUrl: string,
): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup?: () => void }> {
  const blob = dataUrlToBlob(dataUrl)
  try {
    const bitmap = await createImageBitmap(blob)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    }
  } catch {
    const url = URL.createObjectURL(blob)
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

const GENERATED_IMAGE_MAX_EDGE = 1024
const GENERATED_IMAGE_JPEG_QUALITY = 0.78
const GENERATED_IMAGE_MAX_DATA_URL_CHARS = 120_000

/**
 * Komprimiert generierte oder eingebettete Bilder für `chat_messages.content` (JPEG, max. Kantenlänge).
 */
export async function compressDataUrlForChatStorage(dataUrl: string): Promise<string> {
  const normalized = normalizeVisionDataUrl(dataUrl)
  if (!isValidVisionDataUrl(normalized)) {
    throw new Error('Bild konnte nicht für den Chat-Verlauf aufbereitet werden.')
  }
  if (
    normalized.length <= GENERATED_IMAGE_MAX_DATA_URL_CHARS &&
    normalized.toLowerCase().startsWith('data:image/jpeg')
  ) {
    return normalized
  }

  const { source, width, height, cleanup } = await dataUrlToRasterSource(normalized)
  try {
    let maxEdge = GENERATED_IMAGE_MAX_EDGE
    let quality = GENERATED_IMAGE_JPEG_QUALITY
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const url = await encodeRasterSourceToJpegUnderBudget(source, width, height, maxEdge, quality)
      if (url.length <= GENERATED_IMAGE_MAX_DATA_URL_CHARS) {
        return url
      }
      maxEdge = Math.max(384, Math.round(maxEdge * 0.75))
      quality = Math.max(0.5, quality - 0.06)
    }
    throw new Error('Bild ist nach Komprimierung noch zu groß für den Chat-Verlauf.')
  } finally {
    cleanup?.()
  }
}

export async function readImageFileAsVisionDataUrl(file: File): Promise<string> {
  if (fileNeedsVisionEncode(file)) {
    return encodeFileToJpegDataUrl(file)
  }

  const raw = normalizeVisionDataUrl(await readFileAsDataUrl(file))
  if (isValidVisionDataUrl(raw) && raw.length <= MAX_VISION_DATA_URL_CHARS) {
    return raw
  }

  return encodeFileToJpegDataUrl(file)
}
