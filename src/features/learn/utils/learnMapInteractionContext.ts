import { createContext } from 'react'

export type LearnMapStepSelection = {
  topicIndex: number
  /** 0-basierter Zwischenschritt; -1 = Diagnosetest. */
  stepIndex: number
}

export type LearnMapInteraction = {
  /** Kapitel wirklich starten/öffnen (Modal). */
  onOpenTopic: (topicIndex: number) => void
  /** Hauptthema auswählen → Vorschaukarte oben rechts. */
  onSelectTopic: (topicIndex: number) => void
  /** Aktiven Zwischenschritt auswählen → Schritt-Detailkarte. */
  onSelectStep: (selection: LearnMapStepSelection) => void
}

export const LearnMapInteractionContext = createContext<LearnMapInteraction>({
  onOpenTopic: () => {},
  onSelectTopic: () => {},
  onSelectStep: () => {},
})
