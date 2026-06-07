/** Fortschritt während `submitMessage` — für Status neben dem Loader. */
export type ChatSendPhase =
  | 'document_processing'
  | 'analyzing'
  | 'web_search'
  | 'generating'
  | 'thinking_analyze'
  | 'thinking_clarify'
  | 'thinking_draft'
  | 'thinking_review'
  | 'thinking'
  | 'image'
  | 'image_search'
  | 'excel'
  | 'word'
  | 'pdf'
  | 'chart'
  | 'diagram'

export type ChatSendPhaseState = ChatSendPhase | null

export type ChatSendPhaseStatus = {
  mainLabel: string
  subSteps: string[]
}

const DEFAULT_SUB_STEPS = [
  'Anfrage wird verarbeitet',
  'Kontext wird geladen',
  'Antwort wird vorbereitet',
] as const

export function getChatSendPhaseStatus(
  phase: ChatSendPhaseState | undefined,
  fallbackLabel?: string,
): ChatSendPhaseStatus | undefined {
  switch (phase) {
    case 'document_processing':
      return {
        mainLabel: 'Dokument wird analysiert',
        subSteps: ['Datei wird gelesen', 'Inhalt wird strukturiert', 'Kontext wird übernommen'],
      }
    case 'analyzing':
      return {
        mainLabel: 'Wird eingeordnet …',
        subSteps: ['Nachricht verstanden', 'Thema erkannt', 'Antwort wird vorbereitet'],
      }
    case 'web_search':
      return {
        mainLabel: 'Suche im Web …',
        subSteps: ['Suchbegriffe formuliert', 'Quellen werden geprüft', 'Ergebnisse werden sortiert'],
      }
    case 'generating':
      return {
        mainLabel: 'Denkt nach …',
        subSteps: ['Kontext wird geladen', 'Formulierung läuft', 'Antwort wird geschärft'],
      }
    case 'thinking_analyze':
      return {
        mainLabel: 'Aufgabe wird analysiert …',
        subSteps: ['Anforderung erfasst', 'Schritte werden geplant', 'Lösungsweg wird gewählt'],
      }
    case 'thinking_clarify':
      return {
        mainLabel: 'Rückfrage wird vorbereitet …',
        subSteps: ['Unklarheiten erkannt', 'Frage wird formuliert', 'Optionen werden geprüft'],
      }
    case 'thinking_draft':
      return {
        mainLabel: 'Entwurf wird erstellt …',
        subSteps: ['Struktur wird festgelegt', 'Inhalt wird ausgearbeitet', 'Formulierung wird verfeinert'],
      }
    case 'thinking_review':
      return {
        mainLabel: 'Antwort wird geprüft …',
        subSteps: ['Fakten werden gegengeprüft', 'Klarheit wird verbessert', 'Letzte Feinheiten'],
      }
    case 'thinking':
      return {
        mainLabel: 'Anleitung wird erstellt …',
        subSteps: ['Schritte werden sortiert', 'Hinweise werden ergänzt', 'Anleitung wird fertiggestellt'],
      }
    case 'image':
      return {
        mainLabel: 'Bild wird erstellt …',
        subSteps: ['Motiv wird geplant', 'Details werden ergänzt', 'Bild wird generiert'],
      }
    case 'image_search':
      return {
        mainLabel: 'Fotos werden gesucht …',
        subSteps: ['Suchbegriffe werden gesetzt', 'Galerien werden durchsucht', 'Passende Fotos werden gewählt'],
      }
    case 'excel':
      return {
        mainLabel: 'Excel wird vorbereitet …',
        subSteps: ['Daten werden strukturiert', 'Tabellen werden aufgebaut', 'Vorschau wird erstellt'],
      }
    case 'word':
      return {
        mainLabel: 'Word wird vorbereitet …',
        subSteps: ['Gliederung wird erstellt', 'Abschnitte werden formuliert', 'Dokument wird zusammengesetzt'],
      }
    case 'pdf':
      return {
        mainLabel: 'PDF wird vorbereitet …',
        subSteps: ['Layout wird geplant', 'Inhalt wird formatiert', 'PDF wird zusammengestellt'],
      }
    case 'chart':
      return {
        mainLabel: 'Diagramm wird erstellt …',
        subSteps: ['Daten werden eingeordnet', 'Darstellung wird gewählt', 'Diagramm wird gerendert'],
      }
    case 'diagram':
      return {
        mainLabel: 'Struktur-Diagramm wird erstellt …',
        subSteps: ['Knoten werden geplant', 'Verbindungen werden gesetzt', 'Grafik wird gerendert'],
      }
    default: {
      const label = fallbackLabel?.trim()
      if (!label) return undefined
      return { mainLabel: label, subSteps: [...DEFAULT_SUB_STEPS] }
    }
  }
}

export function getChatSendPhaseLabel(phase: ChatSendPhaseState | undefined): string | undefined {
  switch (phase) {
    case 'document_processing':
      return 'Dokument wird analysiert'
    case 'analyzing':
      return 'Wird eingeordnet …'
    case 'web_search':
      return 'Suche im Web …'
    case 'generating':
      return 'Denkt nach …'
    case 'thinking_analyze':
      return 'Aufgabe wird analysiert …'
    case 'thinking_clarify':
      return 'Rückfrage wird vorbereitet …'
    case 'thinking_draft':
      return 'Entwurf wird erstellt …'
    case 'thinking_review':
      return 'Antwort wird geprüft …'
    case 'thinking':
      return 'Anleitung wird erstellt …'
    case 'image':
      return 'Bild wird erstellt …'
    case 'image_search':
      return 'Fotos werden gesucht …'
    case 'excel':
      return 'Excel wird vorbereitet …'
    case 'word':
      return 'Word wird vorbereitet …'
    case 'pdf':
      return 'PDF wird vorbereitet …'
    case 'chart':
      return 'Diagramm wird erstellt …'
    case 'diagram':
      return 'Struktur-Diagramm wird erstellt …'
    default:
      return undefined
  }
}
