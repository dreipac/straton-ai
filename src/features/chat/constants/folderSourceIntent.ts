import type { ChatFolderFileRecord } from '../services/chat.folderFiles'
import type { ChatDocumentAttachmentRef } from '../types/chatSendOptions'
import {
  normalizeDocumentIntentUserText,
  userAsksDocumentVisibilityQuestion,
  userMessageWantsDocumentSummary,
} from './documentAttachmentIntent'

export type ChatThreadFolderContext = {
  folderId: string
  folderName: string
  files: ChatFolderFileRecord[]
}

const ALL_FOLDER_FILES_RE =
  /\b(alle\s+dateien|sämtliche\s+dateien|sammtliche\s+dateien|dateien\s+im\s+ordner|ordner\s*dateien|all\s+files|all\s+documents|jede\s+datei)\b/i

const FOLDER_MATERIAL_RE =
  /\b(datei|dateien|dokument|dokumente|anhang|anhänge|anhaenge|unterlagen|material|materialien|quellen?|pdf|upload|ordner)\b/i

const FOLDER_MATERIAL_ACTION_RE =
  /\b(aus|von|in|anhand|basierend|nutz|verwende|lies|lese|analysier|zusammenfass|überblick|ueberblick|inhalt|vergleich|prüf|pruef|beantwort)\b/i

function normalizeFileNameToken(name: string): string {
  return name.trim().toLowerCase()
}

function fileStem(name: string): string {
  const normalized = normalizeFileNameToken(name)
  const dot = normalized.lastIndexOf('.')
  return dot > 0 ? normalized.slice(0, dot) : normalized
}

/** Nutzer bezieht sich auf Ordner-Dateien (ohne direkten Anhang). */
export function userMessageWantsFolderSources(
  text: string,
  availableFileNames: string[],
): boolean {
  const t = normalizeDocumentIntentUserText(text)
  if (!t || availableFileNames.length === 0) {
    return false
  }

  if (ALL_FOLDER_FILES_RE.test(t)) {
    return true
  }

  if (userMessageWantsDocumentSummary(t, true)) {
    return true
  }

  if (userAsksDocumentVisibilityQuestion(t) && FOLDER_MATERIAL_RE.test(t)) {
    return true
  }

  for (const name of availableFileNames) {
    const normalizedName = normalizeFileNameToken(name)
    const stem = fileStem(name)
    if (t.toLowerCase().includes(normalizedName)) {
      return true
    }
    if (stem.length >= 4 && t.toLowerCase().includes(stem)) {
      return true
    }
  }

  if (FOLDER_MATERIAL_RE.test(t) && FOLDER_MATERIAL_ACTION_RE.test(t)) {
    return true
  }

  return false
}

export function buildInstantAnalyzeFolderSourcesHint(args: {
  folderName: string
  fileNames: string[]
  userMessage: string
}): string | null {
  if (args.fileNames.length === 0) {
    return null
  }

  const wantsSources = userMessageWantsFolderSources(args.userMessage, args.fileNames)
  const fileList = args.fileNames.slice(0, 12).join(', ')

  if (wantsSources) {
    return [
      `[Struktur erkannt: Ordner-Quellen — Nutzer will Inhalt aus Ordner «${args.folderName}»]`,
      `Verfügbare Dateien (${args.fileNames.length}): ${fileList}`,
      'Einordnung: task_type summary bei Zusammenfassung/«alle Dateien»; explanation bei Lesbarkeit/Sichtbarkeit; sonst answer mit Ordner-Bezug.',
      'use_folder_sources: true — App lädt Datei-Inhalt erst nach dieser Einordnung (nicht immer im Prompt).',
      '',
    ].join('\n')
  }

  return [
    `[Kontext: Chat liegt in Ordner «${args.folderName}» — ${args.fileNames.length} Datei(en) verfügbar: ${fileList}]`,
    'Nutzerfrage bezieht sich **nicht** auf diese Dateien → use_folder_sources false, task_type **nicht** summary wegen Ordner allein.',
    '',
  ].join('\n')
}

export function resolveFolderFilesToLoad(
  userMessage: string,
  files: ChatFolderFileRecord[],
): ChatFolderFileRecord[] {
  if (files.length <= 1) {
    return files
  }

  const t = normalizeDocumentIntentUserText(userMessage).toLowerCase()
  const matched = files.filter((file) => {
    const name = normalizeFileNameToken(file.name)
    const stem = fileStem(file.name)
    return t.includes(name) || (stem.length >= 4 && t.includes(stem))
  })

  if (matched.length === 1) {
    return matched
  }
  if (matched.length > 1 && !ALL_FOLDER_FILES_RE.test(t)) {
    return matched
  }
  if (ALL_FOLDER_FILES_RE.test(t) || userMessageWantsDocumentSummary(userMessage, true)) {
    return files
  }
  if (matched.length > 0) {
    return matched
  }
  return files
}

export function folderFilesToDocumentAttachments(
  files: ChatFolderFileRecord[],
): ChatDocumentAttachmentRef[] {
  return files.map((file) => ({
    id: file.id,
    name: file.name,
    bucket: file.storageBucket,
    path: file.storagePath,
    mimeType: file.mimeType,
  }))
}

export function resolveShouldUseFolderSources(args: {
  userMessage: string
  fileNames: string[]
  hasDirectDocumentAttachment: boolean
  analyze?: {
    task_type?: string
    use_folder_sources?: boolean
    intent?: string
  }
}): boolean {
  if (args.hasDirectDocumentAttachment || args.fileNames.length === 0) {
    return false
  }

  if (userMessageWantsFolderSources(args.userMessage, args.fileNames)) {
    return true
  }

  if (args.analyze?.use_folder_sources === true) {
    return true
  }

  const taskType = args.analyze?.task_type
  if (taskType === 'summary' || taskType === 'document_summary') {
    const t = normalizeDocumentIntentUserText(args.userMessage)
    if (ALL_FOLDER_FILES_RE.test(t) || FOLDER_MATERIAL_RE.test(t)) {
      return true
    }
  }

  if (args.analyze?.task_type === 'document_summary' && args.fileNames.length > 0) {
    return true
  }

  const intent = args.analyze?.intent?.trim().toLowerCase() ?? ''
  if (
    intent &&
    (intent.includes('ordner') || intent.includes('datei')) &&
    FOLDER_MATERIAL_ACTION_RE.test(intent)
  ) {
    return true
  }

  return false
}
