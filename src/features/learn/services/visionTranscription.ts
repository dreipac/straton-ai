/**
 * Vision-Transkription von Bild-Materialien (Schicht 1, Ingestion-Vorstufe).
 *
 * Bilder (Scans, Fotos von Skripten, Diagramme) werden von OCR nur unzureichend erfasst — Formeln,
 * Tabellen und Diagramm-Inhalte gehen verloren. Diese Funktion schickt das Bild an das Vision-Modell
 * und erhält eine reichhaltige, sachliche Text-Beschreibung/Transkription, die anschließend wie normaler
 * Materialtext in die Konzept-Ingestion fließt.
 *
 * WICHTIG: Vision ist in der Edge Function auf den Chat-Modus beschränkt (mode === 'chat'); der Lernpfad-
 * Modus verarbeitet keine Bilder. Deshalb läuft die Transkription bewusst über den normalen `sendMessage`
 * (Chat) OHNE `useLearnPathModel` — der einzige Pfad, der Bilder tatsächlich an das Modell weiterreicht.
 *
 * Best-effort: bei Fehler, leerer Antwort oder Nicht-Bild wird '' zurückgegeben; der Aufrufer fällt dann
 * auf den OCR-Text zurück.
 */

import { sendMessage } from '../../chat/services/chat.service'
import { isChatVisionImageFile } from '../utils/documentParser'

const TRANSCRIBE_PROMPT = [
  'Transkribiere und beschreibe den GESAMTEN Lerninhalt dieses Bildes vollständig und sachlich.',
  'Erfasse dabei:',
  '- allen sichtbaren Text wortgetreu (Überschriften, Fließtext, Beschriftungen, Fußnoten),',
  '- Formeln und Rechenwege (in Textform),',
  '- Tabellen (als strukturierte Aufzählung Zeile für Zeile),',
  '- Diagramme/Skizzen: erkläre, was sie fachlich darstellen (Achsen, Beziehungen, Abläufe).',
  'Gib NUR den Inhalt wieder — keine Einleitung, keine Rückfragen, keine Meta-Kommentare wie „Das Bild zeigt…“.',
  'Wenn das Bild keinen Lerninhalt hat, antworte mit einem einzelnen Bindestrich: -',
].join('\n')

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Bild konnte nicht gelesen werden.'))
    reader.readAsDataURL(file)
  })
}

/** Reichhaltige Vision-Transkription eines Bildes, oder '' (Aufrufer nutzt dann OCR-Fallback). */
export async function transcribeImageWithVision(file: File): Promise<string> {
  if (!isChatVisionImageFile(file)) {
    return ''
  }
  let dataUrl = ''
  try {
    dataUrl = await fileToDataUrl(file)
  } catch {
    return ''
  }
  if (!dataUrl.startsWith('data:image/')) {
    return ''
  }
  try {
    const result = await sendMessage(
      [
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: TRANSCRIBE_PROMPT,
          createdAt: new Date().toISOString(),
        },
      ],
      { visionInlineDataUrl: dataUrl },
    )
    const text = (result.assistantMessage.content ?? '').trim()
    // „-“ ist das vereinbarte Signal „kein Lerninhalt“.
    if (!text || text === '-') {
      return ''
    }
    return text
  } catch {
    return ''
  }
}
