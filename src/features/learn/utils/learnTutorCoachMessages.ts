/** Freundliche, persönliche Tutor-Texte für die Lernpfad-UI (kein KI-Streaming). */

/** Entfernt eingebettete Lernplan-Listen aus älteren Tutor-Nachrichten (UI zeigt den Plan separat). */
export function stripEmbeddedSyllabusFromTutorMessage(content: string): string {
  return content.replace(/\n\nDein Lernplan:\n(?:(?:\d+\.\s[^\n]+\n?)+)/, '')
}

/** Nachricht direkt nach der Syllabus-Generierung (kein Einstiegstest mehr davor). */
export function buildSyllabusReadyTutorMessage(): string {
  return `Dein Lernplan ist bereit ✨\n\nLass uns mit Kapitel 1 starten — ich bin bei dir.`
}

export type TutorCoachStep =
  | { kind: 'start-chapter'; chapterNumber: number }
  | { kind: 'need-worksheet'; chapterNumber: number; mixed?: boolean }
  | { kind: 'worksheet-progress'; chapterNumber: number; evaluatedCount: number; total: number; mixed?: boolean }
  | { kind: 'next-chapter'; completedChapterNumber: number; nextChapterNumber: number }
  | { kind: 'all-done' }

export function buildTutorCoachMessage(step: TutorCoachStep): string {
  switch (step.kind) {
    case 'start-chapter': {
      return `Hey! 👋\n\nLass uns Kapitel ${step.chapterNumber} angehen — nimm dir Zeit,\nich begleite dich.`
    }
    case 'need-worksheet':
      return step.mixed
        ? `Geschafft! 🎉\n\nAls Nächstes ein Lernblatt zu deinen Schwachstellen (Lernstand). Wenn du das durch hast, schalten wir das nächste Kapitel frei.`
        : `Kapitel ${step.chapterNumber} — geschafft! 🎉\n\nAls Nächstes ein kurzes Lernblatt dazu. Wenn du das durch hast, schalten wir das nächste Kapitel frei.`
    case 'worksheet-progress':
      return step.mixed
        ? `Du bist auf einem guten Weg 📌\n\nLernblatt (Lernstand): noch ${step.evaluatedCount}/${step.total} Aufgaben mit dem Kreis prüfen — dann geht's weiter.`
        : `Du bist auf einem guten Weg 📌\n\nLernblatt zu Kapitel ${step.chapterNumber}: noch ${step.evaluatedCount}/${step.total} Aufgaben mit dem Kreis prüfen — dann geht's weiter.`
    case 'next-chapter':
      return `Lernblatt zu Kapitel ${step.completedChapterNumber} — alles geprüft ✅\n\nBereit für Kapitel ${step.nextChapterNumber}? Los geht's. 🚀`
    case 'all-done':
      return `Wow — du hast alle geplanten Kapitel und Lernblätter durch! 🏆\n\nDas war richtig ordentlich. Gönn dir kurz eine Pause — du hast es dir verdient. 😊`
    default:
      return ''
  }
}
