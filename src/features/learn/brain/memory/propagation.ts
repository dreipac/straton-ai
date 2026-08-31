/**
 * Schicht 2 — Propagation im Graphen (Kapitel 4.3).
 *
 * Propagation laeuft in BEIDE Richtungen:
 *  - rueckwaerts (Ursachensuche): ein Fehlschlag erzeugt Verdacht auf die Voraussetzungen.
 *  - vorwaerts (Vorsicht): wackelt eine Grundlage, ist die Beherrschung der darauf aufbauenden
 *    Konzepte weniger glaubwuerdig, auch wenn dort einmal etwas richtig war.
 *
 * Zwei zwingende Begrenzungen, beide hier verdrahtet:
 *
 *  1. Invariante I3 — Propagation veraendert AUSSCHLIESSLICH die Sicherheit, nie die
 *     Beherrschung. Der Rueckgabetyp `ConfidenceAdjustment` hat kein Beherrschungsfeld. Das ist
 *     kein Zufall: der Typ ist die Absicherung. Wer hier Beherrschung bewegen wollte, muesste
 *     den Typ aendern und faellt damit auf.
 *
 *  2. Gedaempft und begrenzt — der Effekt wird pro Schritt schwaecher und stoppt nach ein bis
 *     zwei Kanten. Ohne diese Grenze reisst ein einzelner Fluechtigkeitsfehler in einem tiefen
 *     Graphen das halbe Lernerbild ein; der Nutzer sieht ueberall rote Werte und verliert das
 *     Vertrauen. Ein Gehirn, das bei jedem Stolpern die ganze Biografie umschreibt, ist nicht
 *     lebendig, sondern nervoes.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { BrainPrerequisiteEdge, LearnerConceptImage } from '../types'
import { assertPropagationTouchesConfidenceOnly } from '../invariants'

/**
 * Ein Propagationsergebnis: wie viel Sicherheit einem Nachbarknoten abgezogen wird.
 *
 * KEIN Beherrschungsfeld. Siehe Invariante I3 oben.
 */
export type ConfidenceAdjustment = {
  conceptId: string
  /** Abschlag auf die Sicherheit, 0..1. Wird als `propagationConfidencePenalty` gefuehrt. */
  penalty: number
  direction: 'backward' | 'forward'
  /** Kantenabstand zum Ursprung (1 oder 2). */
  distance: number
  /** Markiert den Knoten als „ueberpruefungsbeduerftig" — das aktiviert den Planer. */
  marksReview: boolean
  reason: string
}

/** Nach zwei Kanten ist Schluss (Kapitel 4.3, „stoppt nach ein bis zwei Kanten"). */
export const PROPAGATION_MAX_DISTANCE = 2

/** Abschlag an der ersten Kante. */
export const PROPAGATION_BASE_PENALTY = 0.3

/** Daempfung pro weiterem Schritt. Bei Abstand 2 bleiben davon 40 Prozent. */
export const PROPAGATION_STEP_DAMPING = 0.4

/**
 * Vorwaerts wirkt schwaecher als rueckwaerts.
 *
 * Ein Fehlschlag sagt mehr ueber die Grundlagen aus, auf denen er steht, als ueber das, was
 * spaeter darauf aufbaut: die Grundlage war womoeglich nie da, das Aufbauende wurde bloss noch
 * nicht wieder geprueft.
 */
export const PROPAGATION_FORWARD_FACTOR = 0.6

/** Ab diesem Abschlag wird ein Knoten als ueberpruefungsbeduerftig markiert. */
export const REVIEW_MARK_THRESHOLD = 0.1

/** Ab welchem Teilpunktwert eine Antwort nicht mehr als Fehlschlag gilt. */
export const FAILURE_CREDIT_THRESHOLD = 0.5

/** Loest diese Bewertung ueberhaupt eine Propagation aus? */
export function shouldPropagate(credit: number, examinerConfidence: number): boolean {
  // Ein Fehlschlag, den der Pruefer selbst kaum glaubt, darf keinen Zweifel im halben Graphen saeen.
  return credit < FAILURE_CREDIT_THRESHOLD && examinerConfidence >= 0.4
}

function prerequisitesOf(edges: BrainPrerequisiteEdge[], conceptId: string): string[] {
  return edges.filter((e) => e.toConceptId === conceptId).map((e) => e.fromConceptId)
}

function dependentsOf(edges: BrainPrerequisiteEdge[], conceptId: string): string[] {
  return edges.filter((e) => e.fromConceptId === conceptId).map((e) => e.toConceptId)
}

/**
 * Zweifel vom Ursprungskonzept aus verteilen.
 *
 * Breitensuche in beide Richtungen bis `PROPAGATION_MAX_DISTANCE`. Besuchte Knoten werden
 * gemerkt, damit Zyklen im Graphen nicht in eine Endlosschleife laufen und ein Knoten nicht
 * doppelt Abschlag bekommt, nur weil zwei Pfade zu ihm fuehren.
 *
 * `conceptNames` dient allein der Begruendung; fehlt ein Name, steht die Id im Satz.
 */
export function propagateDoubt(args: {
  originConceptId: string
  edges: BrainPrerequisiteEdge[]
  conceptNames?: Map<string, string>
  /** Staerke der Ausgangsbeobachtung, 0..1 — je klarer der Fehlschlag, desto mehr Zweifel. */
  strength?: number
}): ConfidenceAdjustment[] {
  const { originConceptId, edges } = args
  const strength = Math.max(0, Math.min(1, args.strength ?? 1))
  const nameOf = (id: string) => args.conceptNames?.get(id) ?? id
  const originName = nameOf(originConceptId)

  const out: ConfidenceAdjustment[] = []
  const visited = new Set<string>([originConceptId])

  const walk = (direction: 'backward' | 'forward') => {
    let frontier = [originConceptId]
    for (let distance = 1; distance <= PROPAGATION_MAX_DISTANCE; distance += 1) {
      const next: string[] = []
      for (const nodeId of frontier) {
        const neighbours = direction === 'backward' ? prerequisitesOf(edges, nodeId) : dependentsOf(edges, nodeId)
        for (const neighbourId of neighbours) {
          if (visited.has(neighbourId)) {
            continue
          }
          visited.add(neighbourId)
          next.push(neighbourId)

          const damping = Math.pow(PROPAGATION_STEP_DAMPING, distance - 1)
          const directionFactor = direction === 'backward' ? 1 : PROPAGATION_FORWARD_FACTOR
          const penalty = PROPAGATION_BASE_PENALTY * damping * directionFactor * strength

          out.push({
            conceptId: neighbourId,
            penalty,
            direction,
            distance,
            marksReview: penalty >= REVIEW_MARK_THRESHOLD,
            reason:
              direction === 'backward'
                ? `Bei „${originName}" ist etwas schiefgegangen — das koennte an dieser Voraussetzung liegen.`
                : `„${originName}" wackelt; was darauf aufbaut, ist damit weniger belegt.`,
          })
        }
      }
      frontier = next
      if (frontier.length === 0) {
        break
      }
    }
  }

  walk('backward')
  walk('forward')
  return out
}

/**
 * Einen Abschlag auf ein Lernerbild anwenden.
 *
 * Die Beherrschung wird woertlich durchgereicht (`mastery: image.mastery`) — es gibt keinen
 * Codepfad in dieser Funktion, der sie veraendert. Abschlaege addieren sich, gedeckelt bei 1;
 * `applyDirectEvidence` setzt sie wieder auf 0, sobald echte Evidenz vorliegt.
 */
export function applyConfidenceAdjustment(
  image: LearnerConceptImage,
  adjustment: ConfidenceAdjustment,
): LearnerConceptImage {
  assertPropagationTouchesConfidenceOnly(adjustment)

  const penalty = Math.min(1, image.propagationConfidencePenalty + adjustment.penalty)
  return {
    ...image,
    mastery: image.mastery,
    propagationConfidencePenalty: penalty,
    reviewNeeded: image.reviewNeeded || adjustment.marksReview,
    reviewReason: adjustment.marksReview && !image.reviewNeeded ? adjustment.reason : image.reviewReason,
  }
}

/**
 * Alle Abschlaege eines Propagationslaufs auf die vorhandenen Lernerbilder anwenden.
 *
 * Konzepte OHNE Lernerbild werden uebersprungen: das Gehirn erfindet keinen Zustand fuer etwas,
 * das nie beruehrt wurde. Ein Konzept, zu dem es nichts weiss, hat bereits Sicherheit 0 — es
 * gibt dort nichts, das Zweifel noch senken koennte.
 */
export function applyPropagation(
  images: Map<string, LearnerConceptImage>,
  adjustments: ConfidenceAdjustment[],
): LearnerConceptImage[] {
  const touched: LearnerConceptImage[] = []
  for (const adjustment of adjustments) {
    const image = images.get(adjustment.conceptId)
    if (!image) {
      continue
    }
    touched.push(applyConfidenceAdjustment(image, adjustment))
  }
  return touched
}
