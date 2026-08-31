/**
 * „Erklaeren lassen" am Knoten (UI-Spezifikation 3.6, Architekturkapitel 7.3).
 *
 * Ein Erklaertext ist eine eigene Erzeugungsart mit eigener Freigabe — nicht eine Aufgabe ohne
 * Frage. Der Grund steht in 7.3: „Ein halluzinierter Erklaertext ist gefaehrlicher als eine
 * halluzinierte Aufgabe, weil der Nutzer ihn ungeprueft uebernimmt." Deshalb laeuft hier
 * derselbe Torwaechter wie bei Aufgaben, nur mit dem Modus `explanation_check`, und deshalb wird
 * ein Text ohne Herkunftsangabe verworfen statt angezeigt (I4, I5).
 *
 * Welche Stelle gilt, entscheidet nicht die Oberflaeche, sondern der Zustand des Konzepts:
 * unberuehrt heisst Einstieg, alles andere heisst vollstaendige Erklaerung auf Anforderung. Ein
 * frei waehlbarer Umfang waere die Hintertuer, durch die Straton zum Lehrbuch wird.
 */

import { useCallback, useState } from 'react'
import type { BrainConcept, LearnerConceptImage } from '../types'
import {
  assertExplanationCleared,
  buildExplanationVerdict,
  explanationSlotSpec,
  needsIntro,
  withinScope,
  type ExplanationSlot,
  type GeneratedExplanation,
} from '../production/explanations'
import { callBrainAgent } from '../agents/client'
import { parseExplanationCheckResult, parseExplanationGeneratorResult } from '../agents/contracts'

export type ExplanationPhase = 'idle' | 'loading' | 'ready' | 'failed'

export type BrainExplanationState = {
  phase: ExplanationPhase
  conceptId: string | null
  conceptName: string
  slot: ExplanationSlot | null
  explanation: GeneratedExplanation | null
  error: string | null
}

const INITIAL: BrainExplanationState = {
  phase: 'idle',
  conceptId: null,
  conceptName: '',
  slot: null,
  explanation: null,
  error: null,
}

export type UseBrainExplanationArgs = {
  sourceExcerptFor: (conceptId: string) => string
}

export function useBrainExplanation(args: UseBrainExplanationArgs) {
  const [state, setState] = useState<BrainExplanationState>(INITIAL)

  const request = useCallback(
    async (concept: BrainConcept, image: LearnerConceptImage | undefined) => {
      const slot: ExplanationSlot = needsIntro(image) ? 'intro' : 'dontKnow'
      const spec = explanationSlotSpec(slot)
      const sourceExcerpt = args.sourceExcerptFor(concept.id)

      setState({
        phase: 'loading',
        conceptId: concept.id,
        conceptName: concept.name,
        slot,
        explanation: null,
        error: null,
      })

      try {
        const generated = parseExplanationGeneratorResult(
          (
            await callBrainAgent({
              role: 'generator',
              payload: {
                slot,
                conceptName: concept.name,
                conceptDescription: concept.description,
                depth: image?.depth ?? 'recognize',
                sourceExcerpt,
                scope: spec.scope,
                minSentences: spec.minSentences,
                maxSentences: spec.maxSentences,
              },
            })
          ).data,
        )

        if (!generated) {
          throw new Error('Der Generator hat keinen verwertbaren Erklaertext geliefert.')
        }

        const explanation: GeneratedExplanation = {
          conceptId: concept.id,
          slot,
          text: generated.text,
          solutionPath: generated.solutionPath,
          sourceGrounding: generated.sourceGrounding,
          sourceRef: concept.sourceRef,
        }

        const check = parseExplanationCheckResult(
          (
            await callBrainAgent({
              role: 'kontrolleur',
              payload: { mode: 'explanation_check', explanationText: explanation.text, sourceExcerpt },
            })
          ).data,
        )

        const verdict = buildExplanationVerdict({
          sourceAligned: check.sourceAligned,
          unsupportedClaims: check.unsupportedClaims,
        })

        // Wirft bei fehlender Freigabe oder fehlender Herkunft — kein stiller Durchlauf (I5, I4).
        assertExplanationCleared(explanation, verdict)

        /*
         * Der Umfang wird geprueft, aber er verwirft nicht: ein Einstieg mit sechs statt fuenf
         * Saetzen ist laestig, ein verworfener Erklaertext auf Anforderung ist ein Produkt, das
         * nicht antwortet. Die Grenze bleibt trotzdem als Befund sichtbar, damit ein systematisch
         * ausuferndes Modell auffaellt.
         */
        if (!withinScope(explanation)) {
          console.warn(`Erklaertext zu „${concept.name}" verlaesst den Umfang der Stelle „${slot}".`)
        }

        setState((current) =>
          current.conceptId === concept.id ? { ...current, phase: 'ready', explanation } : current,
        )
      } catch (cause) {
        setState((current) =>
          current.conceptId === concept.id
            ? {
                ...current,
                phase: 'failed',
                error:
                  cause instanceof Error
                    ? cause.message
                    : 'Zu diesem Konzept laesst sich gerade keine belegbare Erklaerung erzeugen.',
              }
            : current,
        )
      }
    },
    [args],
  )

  const close = useCallback(() => setState(INITIAL), [])

  return { state, request, close }
}
