/** Freundliche, persönliche Tutor-Texte für die Lernpfad-UI (kein KI-Streaming). */

function scoreEmoji(ratio: number): string {
  if (ratio >= 0.8) {
    return '🌟'
  }
  if (ratio >= 0.6) {
    return '🙂'
  }
  if (ratio >= 0.4) {
    return '💪'
  }
  return '🌱'
}

export function buildEntryQuizReadyTutorMessage(introFromAi: string): string {
  const intro = introFromAi.trim() || 'Dein Einstiegstest ist bereit.'
  return `${intro}\n\nWenn du soweit bist: einmal kurz reinschnuppern — danach passe ich deinen Lernpfad an. 📋✨`
}

export function buildPostEntryQuizTutorMessage(score: number, total: number): string {
  const safeTotal = Math.max(1, total)
  const ratio = score / safeTotal
  const emoji = scoreEmoji(ratio)

  if (ratio >= 0.8) {
    return `Stark — ${score} von ${total} im Einstiegstest ${emoji}\n\nDu hast eine richtig gute Basis. Als Nächstes starten wir mit Kapitel 1 — ich bin bei dir.`
  }
  if (ratio >= 0.6) {
    return `Gut gemacht! ${score}/${total} im Einstiegstest ${emoji}\n\nEin paar Punkte können wir vertiefen — kein Stress. Lass uns mit Kapitel 1 starten.`
  }
  if (ratio >= 0.4) {
    return `Dein Einstiegstest: ${score}/${total} ${emoji}\n\nDa ist schon was da — wir bauen es Schritt für Schritt aus. Kapitel 1 ist der beste nächste Schritt.`
  }
  return `Danke fürs Durchziehen — ${score}/${total} ${emoji}\n\nGenau dafür ist der Lernpfad da. Wir starten mit Kapitel 1 und holen die Lücken gemeinsam rein.`
}

export type TutorCoachStep =
  | { kind: 'start-chapter'; chapterNumber: number; entryScore: number; entryTotal: number }
  | { kind: 'need-worksheet'; chapterNumber: number; mixed?: boolean }
  | { kind: 'worksheet-progress'; chapterNumber: number; evaluatedCount: number; total: number; mixed?: boolean }
  | { kind: 'next-chapter'; completedChapterNumber: number; nextChapterNumber: number }
  | { kind: 'all-done' }

export function buildTutorCoachMessage(step: TutorCoachStep): string {
  switch (step.kind) {
    case 'start-chapter': {
      const { chapterNumber, entryScore, entryTotal } = step
      const emoji = scoreEmoji(entryTotal > 0 ? entryScore / entryTotal : 0)
      return `Hey! 👋 Dein Einstiegstest: ${entryScore}/${entryTotal} ${emoji}\n\nLass uns Kapitel ${chapterNumber} angehen — nimm dir Zeit, ich begleite dich.`
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
