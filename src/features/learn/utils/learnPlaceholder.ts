import type { InteractiveQuizQuestion } from '../../chat/utils/interactiveQuiz'
import { evaluateInteractiveAnswer } from '../../chat/utils/interactiveQuiz'
import type {
  ChapterBlueprint,
  LearnFlashcard,
  LearnWorksheetItem,
  SyllabusEntry,
} from '../services/learn.persistence'
import type { IngestedGraph } from './conceptIngestion'
import type { Curriculum } from './curriculumGeneration'

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
        // Aufzählung als Demo: Aufgabentexte duerfen jetzt Listen/Tabellen enthalten
        // (renderLearnStepContent) statt nur eine lange Fliesstext-Zeile.
        prompt: `Platzhalter-Frage 1 zu «${safeTopic}» — gegeben:\n- Nettobetrag: 100 €\n- Steuersatz: 19 %\nWelche Option ist richtig?`,
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
        // Tabelle als Demo (Vergleich/Uebersicht) -- gleiches Prinzip wie die Liste bei
        // placeholder-diag-q1, hier mit dem GFM-Pipe-Format inkl. Trennzeile.
        prompt: `Platzhalter-Frage zu «${safeTopic}» — vergleiche die Beträge:\n| Position | Netto | Brutto |\n| --- | --- | --- |\n| Ware A | 100 € | 119 € |\n| Ware B | 250 € | 297,50 € |\nWelche Option ist richtig?`,
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
      // Tabelle als Demo (Vergleich/Uebersicht) -- siehe renderLearnStepContent.
      prompt:
        'Platzhalter-Aufgabe 1 — vergleiche die Beträge:\n| Position | Netto | Brutto |\n| --- | --- | --- |\n| Ware A | 100 € | 119 € |\n| Ware B | 250 € | 297,50 € |\nWelche Option ist richtig?',
      questionType: 'mcq',
      options: ['Die richtige Option', 'Eine falsche Option', 'Noch eine falsche Option'],
      expectedAnswer: 'Die richtige Option',
      explanation: 'Im Platzhalter-Modus ist immer die erste Option korrekt.',
      skillTag: 'platzhalter-anwendung',
    },
    {
      id: `placeholder-ws-2-${crypto.randomUUID()}`,
      // Aufzählung als Demo (gegebene Werte) -- siehe renderLearnStepContent.
      prompt:
        'Platzhalter-Aufgabe 2 — gegeben:\n- Rechnungsbetrag: 500 €\n- Steuersatz: 19 %\nDiese Aussage ist wahr: Der Bruttobetrag liegt über 550 €.',
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

/** Mock-Konzept-Netz (Ingestion, Schicht 1) ohne KI — deterministisch, mit sinnvoller Voraussetzungskette. */
/** Ein Platzhalter-Konzept innerhalb eines Themen-Clusters. */
type PlaceholderConceptSpec = { slug: string; label: string; difficulty: number }
/** Ein Themen-Cluster: wird zu EINEM Curriculum-Thema (= ein Landkarten-Knoten). */
type PlaceholderTopicSpec = { title: string; learningGoal: string; concepts: PlaceholderConceptSpec[] }

/**
 * Zentrale Platzhalter-Struktur: 6 Themen-Cluster à 3 Konzepte. Sowohl das Konzept-Netz
 * (`buildPlaceholderConceptGraph`) als auch das Curriculum (`buildPlaceholderCurriculum`) leiten sich
 * hieraus ab — so bleiben Slugs konsistent und die Landkarte zeigt wie früher MEHRERE Themen-Knoten
 * (statt eines einzigen "Grundlagen"-Knotens durch das Fallback-Chunking).
 */
function placeholderTopicSpecs(base: string): PlaceholderTopicSpec[] {
  return [
    {
      title: `Grundlagen: ${base}`,
      learningGoal: 'Kernbegriffe sicher erklären\nTypische Beispiele erkennen',
      concepts: [
        { slug: 'grundbegriffe', label: `Grundbegriffe: ${base}`, difficulty: 1 },
        { slug: 'kernprinzip', label: `Kernprinzip von ${base}`, difficulty: 2 },
        { slug: 'fachsprache', label: `Fachsprache zu ${base}`, difficulty: 2 },
      ],
    },
    {
      title: 'Berechnung & Anwendung',
      learningGoal: 'Standardfälle selbst berechnen\nFormeln korrekt anwenden',
      concepts: [
        { slug: 'formeln', label: `Formeln rund um ${base}`, difficulty: 3 },
        { slug: 'standardfaelle', label: `Standardfälle von ${base}`, difficulty: 3 },
        { slug: 'umformung', label: `Umformungen bei ${base}`, difficulty: 4 },
      ],
    },
    {
      title: 'Sonderfälle & Ausnahmen',
      learningGoal: 'Ausnahmen benennen\nFehlerquellen vermeiden',
      concepts: [
        { slug: 'ausnahmen', label: `Ausnahmen bei ${base}`, difficulty: 3 },
        { slug: 'grenzfaelle', label: `Grenzfälle von ${base}`, difficulty: 4 },
        { slug: 'fehlerquellen', label: `Typische Fehler bei ${base}`, difficulty: 3 },
      ],
    },
    {
      title: 'Praxis & Belege',
      learningGoal: 'Belege korrekt prüfen\nPraxisfälle lösen',
      concepts: [
        { slug: 'belege-pruefen', label: `Belege prüfen zu ${base}`, difficulty: 3 },
        { slug: 'praxisfall', label: `Praxisfall zu ${base}`, difficulty: 4 },
        { slug: 'dokumentation', label: `Dokumentation bei ${base}`, difficulty: 2 },
      ],
    },
    {
      title: 'Vertiefung & Transfer',
      learningGoal: 'Wissen auf neue Fälle übertragen\nKomplexe Aufgaben lösen',
      concepts: [
        { slug: 'transfer', label: `Transfer von ${base}`, difficulty: 4 },
        { slug: 'komplexe-aufgaben', label: `Komplexe Aufgaben zu ${base}`, difficulty: 5 },
        { slug: 'verknuepfung', label: `Verknüpfung mit Nachbarthemen`, difficulty: 4 },
      ],
    },
    {
      title: 'Repetition & Prüfungsvorbereitung',
      learningGoal: 'Gesamtstoff zusammenfassen\nPrüfungsaufgaben sicher lösen',
      concepts: [
        { slug: 'zusammenfassung', label: `Zusammenfassung ${base}`, difficulty: 2 },
        { slug: 'pruefungsaufgaben', label: `Prüfungsaufgaben zu ${base}`, difficulty: 5 },
        { slug: 'selbsttest', label: `Selbsttest ${base}`, difficulty: 3 },
      ],
    },
  ]
}

export function buildPlaceholderConceptGraph(topic: string): IngestedGraph {
  const base = (topic || 'Thema').trim()
  const specs = placeholderTopicSpecs(base)

  const concepts = specs.flatMap((spec) =>
    spec.concepts.map((c) => ({
      slug: c.slug,
      name: c.label,
      description: `${c.label} im Kontext von ${base}.`,
      difficulty: c.difficulty,
      sourceRef: { section: spec.title },
      // Platzhalter stammen aus keinem Material — I4 verlangt, dass genau das dransteht.
      origin: 'ai_supplement' as const,
      sourceQuote: '',
    })),
  )

  const edges: IngestedGraph['edges'] = []
  specs.forEach((spec, topicIndex) => {
    // Kette innerhalb eines Clusters: c0 -> c1 -> c2 (Voraussetzungen).
    for (let i = 0; i < spec.concepts.length - 1; i += 1) {
      edges.push({ fromSlug: spec.concepts[i].slug, toSlug: spec.concepts[i + 1].slug, type: 'prerequisite' })
    }
    // Brücke zum nächsten Cluster: letztes Konzept -> erstes Konzept des Folge-Themas (topologische Ordnung).
    const next = specs[topicIndex + 1]
    if (next) {
      const last = spec.concepts[spec.concepts.length - 1]
      edges.push({ fromSlug: last.slug, toSlug: next.concepts[0].slug, type: 'prerequisite' })
    }
  })

  return { concepts, edges }
}

/**
 * Platzhalter-Curriculum: bildet die 6 Cluster direkt auf 6 Themen ab (ein Schritt je Konzept). Ersetzt im
 * Platzhalter-Modus das Größe-6-Fallback-Chunking, das alle Konzepte in ein einziges "Grundlagen"-Thema
 * gelegt hätte → die Landkarte zeigt wieder alle Themen-Knoten.
 */
export function buildPlaceholderCurriculum(topic: string): Curriculum {
  const base = (topic || 'Thema').trim()
  return {
    topics: placeholderTopicSpecs(base).map((spec) => ({
      title: spec.title,
      learningGoal: spec.learningGoal,
      conceptSlugs: spec.concepts.map((c) => c.slug),
      steps: spec.concepts.map((c) => ({ title: c.label, conceptSlugs: [c.slug] })),
    })),
  }
}
