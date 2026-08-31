/** Gleicher Breakpoint wie `chat.css` (@media max-width 860px) — Anhang-Bottom-Sheet */
export const CHAT_WINDOW_MOBILE_COMPOSER_MQ = '(max-width: 860px)'

/** Mobil: Touch-Scale max. ~560ms nach Loslassen + Rück-Transition ~580ms — During-Icon erst danach */
export const CHAT_WINDOW_MOBILE_SEND_DURING_ICON_DELAY_MS = 1100

/** Foto aus Galerie/Kamera (Vision-Anhang). */
export const CHAT_COMPOSER_IMAGE_FILE_ACCEPT =
  'image/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff'

/** Datei anhängen: Dokumente + Bilder (s. extractLearningMaterialText / isChatVisionImageFile). */
export const CHAT_COMPOSER_DOCUMENT_FILE_ACCEPT = [
  CHAT_COMPOSER_IMAGE_FILE_ACCEPT,
  '.pdf',
  'application/pdf',
  '.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx',
  '.xls',
  '.csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  '.txt',
  'text/plain',
  '.md',
  'text/markdown',
].join(',')
