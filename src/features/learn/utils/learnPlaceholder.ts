import type { InteractiveQuizQuestion } from '../../chat/utils/interactiveQuiz'
import { evaluateInteractiveAnswer } from '../../chat/utils/interactiveQuiz'
import type {
  ChapterBlueprint,
  LearnFlashcard,
  LearnWorksheetItem,
  SyllabusEntry,
} from '../services/learn.persistence'

/** Platzhalter-Modus (Admin-Test ohne API-Kosten): zentrale Mock-Daten + kurze simulierte
 *  Wartezeiten, damit Ladezustände/Animationen sichtbar bleiben, man aber zügig durchklicken kann. */
export const PLACEHOLDER_DELAY_MS = 450

export function placeholderDelay(ms: number = PLACEHOLDER_DELAY_MS): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/** Themen-Erkennung aus „Materialien" — fester Testwert statt KI-Analyse. */
export const PLACEHOLDER_TOPIC = 'Mehrwertsteuer & Abgaben (Platzhalter)'

/** Lernplan mit Stichwort-Lernzielen (max. 3, zeilenweise — wie das echte KI-Schema). */
export function buildPlaceholderSyllabus(mainTopic: string, chapterCount: number): SyllabusEntry[] {
  const safeTopic = (mainTopic || 'Testthema').trim()
  const templates: SyllabusEntry[] = [
    {
      topic: `Grundlagen: ${safeTopic}`,
      learningGoal: 'Kernbegriffe sicher erklären\nTypische Beispiele erkennen\nAbgrenzung zu Nachbarthemen',
    },
    {
      topic: 'Berechnung & Anwendung',
      learningGoal: 'Standardfälle selbst berechnen\nFormeln korrekt anwenden',
    },
    {
      topic: 'Sonderfälle & Ausnahmen',
      learningGoal: 'Ausnahmen benennen\nSonderfälle einordnen\nFehlerquellen vermeiden',
    },
    {
      topic: 'Praxis & Belege',
      learningGoal: 'Belege korrekt prüfen\nPraxisfälle lösen',
    },
    {
      topic: 'Vertiefung & Transfer',
      learningGoal: 'Wissen auf neue Fälle übertragen\nKomplexe Aufgaben lösen',
    },
    {
      topic: 'Repetition & Prüfungsvorbereitung',
      learningGoal: 'Gesamtstoff zusammenfassen\nPrüfungsaufgaben sicher lösen',
    },
  ]
  const entries: SyllabusEntry[] = []
  for (let index = 0; index < chapterCount; index += 1) {
    const template = templates[index % templates.length]
    entries.push(index < templates.length ? template : { ...template, topic: `${template.topic} ${index + 1}` })
  }
  return entries
}

/** Diagnosetest bzw. Basis-Kapitel für ein Thema — kleine, gemischte Fragensammlung. */
export function buildPlaceholderDiagnosticBlueprint(topicTopic: string): ChapterBlueprint {
  const safeTopic = (topicTopic || 'Testthema').trim()
  return {
    id: 'placeholder-diagnostic',
    title: `Diagnosetest: ${safeTopic}`,
    description: 'Platzhalter-Diagnosetest (ohne KI generiert).',
    source: 'fallback',
    steps: [
      {
        id: 'placeholder-diag-q1',
        type: 'question',
        questionType: 'mcq',
        prompt: `Platzhalter-Frage 1 zu «${safeTopic}»: Welche Option ist richtig?`,
        options: ['Die richtige Option', 'Eine falsche Option', 'Noch eine falsche Option'],
        expectedAnswer: 'Die richtige Option',
        explanation: 'Im Platzhalter-Modus ist immer die erste Option korrekt.',
        skillTag: 'platzhalter-grundlagen',
      },
      {
        id: 'placeholder-diag-q2',
        type: 'question',
        questionType: 'true_false',
        prompt: 'Platzhalter-Frage 2: Diese Aussage ist wahr.',
        options: ['Wahr', 'Falsch'],
        expectedAnswer: 'Wahr',
        explanation: 'Testfrage — «Wahr» ist die erwartete Antwort.',
        skillTag: 'platzhalter-grundlagen',
      },
      {
        id: 'placeholder-diag-q3',
        type: 'question',
        questionType: 'text',
        prompt: 'Platzhalter-Frage 3: Tippe das Wort «Test» als Antwort.',
        expectedAnswer: 'Test',
        evaluation: 'contains',
        hint: 'Einfach «Test» eingeben.',
        skillTag: 'platzhalter-anwendung',
      },
    ],
  }
}

/** Kapitel-Inhalt (Erklärung → Fragen → Zusammenfassung) für den linearen Kapitel-Modus. */
export function buildPlaceholderChapterBlueprint(chapterTopic: string, chapterNumber: number): ChapterBlueprint {
  const safeTopic = (chapterTopic || 'Testthema').trim()
  return {
    id: `placeholder-chapter-${chapterNumber}`,
    title: `Kapitel ${chapterNumber}: ${safeTopic}`,
    description: 'Platzhalter-Kapitel (ohne KI generiert).',
    source: 'fallback',
    steps: [
      {
        id: 'placeholder-ch-intro',
        type: 'explanation',
        title: `Einführung in ${safeTopic}`,
        content:
          'Dies ist ein Platzhalter-Erklärungsschritt. Er existiert nur, damit der komplette Kapitel-Ablauf (Erklärung → Fragen → Zusammenfassung) ohne KI getestet werden kann.',
        bullets: ['Erster Kernpunkt', 'Zweiter Kernpunkt', 'Dritter Kernpunkt'],
        keyPrinciple: 'Platzhalter-Faustformel: Die erste Option ist immer richtig.',
      },
      {
        id: 'placeholder-ch-q1',
        type: 'question',
        questionType: 'mcq',
        prompt: `Platzhalter-Frage zu «${safeTopic}»: Welche Option ist richtig?`,
        options: ['Die richtige Option', 'Eine falsche Option', 'Noch eine falsche Option'],
        expectedAnswer: 'Die richtige Option',
        explanation: 'Im Platzhalter-Modus ist immer die erste Option korrekt.',
        skillTag: 'platzhalter-anwendung',
      },
      {
        id: 'placeholder-ch-q2',
        type: 'question',
        questionType: 'text',
        prompt: 'Freitext-Platzhalter: Tippe das Wort «Test».',
        expectedAnswer: 'Test',
        evaluation: 'contains',
        hint: 'Einfach «Test» eingeben.',
        skillTag: 'platzhalter-anwendung',
      },
      {
        id: 'placeholder-ch-recap',
        type: 'recap',
        title: 'Zusammenfassung',
        content: 'Platzhalter-Zusammenfassung: Der Kapitel-Ablauf wurde vollständig durchlaufen.',
        bullets: ['Ablauf getestet', 'Keine API-Kosten'],
      },
    ],
  }
}

/** Lokale Bewertung statt KI: nutzt denselben lokalen Evaluator wie MCQ/Match — bei Freitext greift
 *  exact/contains gegen expectedAnswer. */
export function evaluatePlaceholderAnswer(
  question: InteractiveQuizQuestion,
  answer: string,
): { isCorrect: boolean; feedback: string } {
  const result = evaluateInteractiveAnswer(answer, question)
  return {
    isCorrect: result.isCorrect,
    feedback:
      result.feedback ||
      (result.isCorrect ? 'Richtig (Platzhalter-Bewertung ohne KI).' : 'Leider falsch (Platzhalter-Bewertung ohne KI).'),
  }
}

export function buildPlaceholderFlashcards(): LearnFlashcard[] {
  return [1, 2, 3, 4, 5, 6].map((index) => ({
    id: `placeholder-card-${index}-${crypto.randomUUID()}`,
    question: `Platzhalter-Lernkarte ${index}: Was ist die Antwort?`,
    answer: `Antwort ${index} (ohne KI generiert).`,
    skillTag: 'platzhalter-grundlagen',
  }))
}

export function buildPlaceholderWorksheetItems(): LearnWorksheetItem[] {
  return [
    {
      id: `placeholder-ws-1-${crypto.randomUUID()}`,
      prompt: 'Platzhalter-Aufgabe 1: Welche Option ist richtig?',
      questionType: 'mcq',
      options: ['Die richtige Option', 'Eine falsche Option', 'Noch eine falsche Option'],
      expectedAnswer: 'Die richtige Option',
      explanation: 'Im Platzhalter-Modus ist immer die erste Option korrekt.',
      skillTag: 'platzhalter-anwendung',
    },
    {
      id: `placeholder-ws-2-${crypto.randomUUID()}`,
      prompt: 'Platzhalter-Aufgabe 2: Diese Aussage ist wahr.',
      questionType: 'true_false',
      options: ['Wahr', 'Falsch'],
      expectedAnswer: 'Wahr',
      skillTag: 'platzhalter-grundlagen',
    },
    {
      id: `placeholder-ws-3-${crypto.randomUUID()}`,
      prompt: 'Platzhalter-Aufgabe 3: Tippe das Wort «Test».',
      questionType: 'text',
      expectedAnswer: 'Test',
      evaluation: 'contains',
      hint: 'Einfach «Test» eingeben.',
      skillTag: 'platzhalter-anwendung',
    },
  ]
}
