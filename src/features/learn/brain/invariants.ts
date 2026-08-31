/**
 * Straton Gehirn — die zwoelf Invarianten als pruefbarer Code.
 *
 * Referenz: `straton-gehirn-architektur.md`, Kapitel 1.
 *
 * Kapitel 1 ist bindend: „Diese Regeln duerfen an keiner Stelle der Implementierung verletzt
 * werden, auch nicht temporaer oder ‚fuer den Prototyp'."
 *
 * Eine Regel, die nur im Fliesstext steht, wird irgendwann versehentlich gebrochen. Deshalb ist
 * jede Invariante hier entweder
 *   (a) durch die Typen unmoeglich gemacht,
 *   (b) durch einen Datenbank-Constraint abgesichert,
 *   (c) durch einen Guard in dieser Datei gesichert, den die betroffene Schicht aufruft, oder
 *   (d) organisatorisch — dann steht hier, wo sie geprueft wird.
 *
 * Die Guards werfen. Das ist Absicht: eine verletzte Invariante ist kein Randfall, den man
 * wegloggen kann, sondern ein Zustand, in dem das Lernerbild nicht mehr vertrauenswuerdig ist.
 */

import type { EvidenceSource, StructureLogEntry, StructureProposal } from './types'
import { isDestructive } from './types'

/** Kennung einer Invariante, so wie sie im Architekturdokument nummeriert ist. */
export type InvariantId =
  | 'I1' | 'I2' | 'I3' | 'I4' | 'I5' | 'I6'
  | 'I7' | 'I8' | 'I9' | 'I10' | 'I11' | 'I12'

/** Wie eine Invariante abgesichert ist. */
export type EnforcementKind = 'type' | 'database' | 'guard' | 'organisational'

export type InvariantSpec = {
  id: InvariantId
  rule: string
  why: string
  enforcement: EnforcementKind
  /** Wo die Absicherung tatsaechlich sitzt. */
  enforcedAt: string
}

/**
 * Das vollstaendige Register. Es wird von den Rollentests gelesen, damit eine neu hinzugefuegte
 * Invariante nicht ohne Absicherung durchrutscht.
 */
export const INVARIANTS: readonly InvariantSpec[] = [
  {
    id: 'I1',
    rule: 'Nur direkte Evidenz veraendert die Beherrschung eines Konzepts.',
    why: 'Sonst kann ein Wert entstehen, fuer den nie jemand etwas geloest hat.',
    enforcement: 'guard',
    enforcedAt: 'assertMasteryChangeAllowed (perception/evidence.ts) + DB-Check learn_evidence_events_only_direct_evidence_moves_mastery',
  },
  {
    id: 'I2',
    rule: 'Chatverhalten erhoeht niemals die Beherrschung. Es darf nur senken oder Zweifel wecken.',
    why: 'Fragen stellen beweist nichts. Verhindert geschoente Lernerbilder durch Vielrederei.',
    enforcement: 'guard',
    enforcedAt: 'assertMasteryChangeAllowed + perception/chatSignals.ts (setzt masteryDelta hart auf 0)',
  },
  {
    id: 'I3',
    rule: 'Propagation im Graphen veraendert nie die Beherrschung, ausschliesslich die Sicherheit.',
    why: 'Ein Fluechtigkeitsfehler darf keine Lawine ausloesen.',
    enforcement: 'type',
    enforcedAt: 'memory/propagation.ts — ConfidenceAdjustment hat kein mastery-Feld, plus assertPropagationTouchesConfidenceOnly',
  },
  {
    id: 'I4',
    rule: 'Jedes Wissensatom traegt eine Herkunftsmarkierung (Quelldokument und Stelle, oder KI-ergaenzt).',
    why: 'Pruefungsrealitaet und Halluzinationsschutz. Ohne Quelle keine Pruefbarkeit.',
    enforcement: 'type',
    enforcedAt: 'BrainConcept.origin ist nicht optional; DB-Spalte learn_concepts.origin ist NOT NULL',
  },
  {
    id: 'I5',
    rule: 'Kein generiertes Material erreicht den Nutzer ohne Quellenabgleich.',
    why: 'Halluzinierte Inhalte vergiften ueber den Pruefer auch das Lernerbild.',
    enforcement: 'guard',
    enforcedAt: 'assertTaskCleared (production/quality.ts)',
  },
  {
    id: 'I6',
    rule: 'Zerstoererische Strukturaenderungen erfordern Nutzerbestaetigung und ein Protokoll mit Ruecknahmemoeglichkeit.',
    why: 'Verschmelzungen sind nicht rekonstruierbar. Ein System, das sich selbst umbaut und seine Vergangenheit loescht, ist nicht diagnostizierbar.',
    enforcement: 'guard',
    enforcedAt: 'assertProposalSafe + assertLogEntryComplete (hier) + DB-Checks in …122000_learn_brain_consolidation.sql',
  },
  {
    id: 'I7',
    rule: 'Keine Strukturfragen waehrend einer Lernsitzung.',
    why: 'Unterbrechungen im Lernfluss zerstoeren die Sitzung und werden reflexhaft weggeklickt.',
    enforcement: 'type',
    enforcedAt: "StructureProposal.surfaceContext kennt nur 'sessionStart' | 'mapReview' — 'inSession' existiert nicht",
  },
  {
    id: 'I8',
    rule: 'Jede ausgespielte Aufgabe hat eine Begruendung, die dem Nutzer in einem Satz zeigbar ist.',
    why: 'Gewichtete Auswahl ohne Erklaerung wirkt wie Zufall. Zufall zerstoert Vertrauen.',
    enforcement: 'guard',
    enforcedAt: 'assertHasReason (planner/explanation.ts) + DB-Check learn_task_log_reason_not_blank',
  },
  {
    id: 'I9',
    rule: 'Eine Mindestreserve fuer Wiederholung bleibt in jeder Sitzung bestehen, auch im Zielmodus.',
    why: 'Sonst ist nach der Pruefung alles Fruehere verfallen.',
    enforcement: 'guard',
    enforcedAt: 'planner/planner.ts — reserveReviewSlots, plus assertReviewReserveHeld',
  },
  {
    id: 'I10',
    rule: 'Struktur und Person werden getrennt gespeichert.',
    why: 'Haelt die Tuer fuer einen spaeteren geteilten Strukturlayer offen, ohne Architekturumbau.',
    enforcement: 'type',
    enforcedAt: 'BrainConcept traegt kein einziges Leistungsfeld; LearnerConceptImage liegt in einer eigenen Tabelle mit user_id',
  },
  {
    id: 'I11',
    rule: 'Der Planer ist deterministisch. Keine Modellentscheidung darueber, was als Naechstes kommt.',
    why: 'Reproduzierbarkeit, Testbarkeit, Debugbarkeit. Verlaesslichkeit schlaegt hier Cleverness.',
    enforcement: 'type',
    enforcedAt: "BrainAgentRole enthaelt 'planer' nicht; planner/* importiert nichts aus agents/client.ts",
  },
  {
    id: 'I12',
    rule: 'Namen von Fehlermustern bleiben stabil, sobald vergeben.',
    why: 'Ein System, das dieselbe Sache jede Woche anders nennt, wirkt orientierungslos.',
    enforcement: 'guard',
    enforcedAt: 'assertPatternNameStable (consolidation/patterns.ts) + DB unique (user_id, name)',
  },
]

/** Fehler, der eine konkrete Invariantenverletzung benennt. */
export class InvariantViolation extends Error {
  readonly invariant: InvariantId

  constructor(invariant: InvariantId, detail: string) {
    const spec = INVARIANTS.find((i) => i.id === invariant)
    super(`Invariante ${invariant} verletzt: ${spec?.rule ?? ''} — ${detail}`)
    this.name = 'InvariantViolation'
    this.invariant = invariant
  }
}

/**
 * I1 + I2 — darf diese Quelle die Beherrschung so veraendern?
 *
 * Direkte Evidenz (bewertete Aufgabe) darf in beide Richtungen wirken. Chat darf gar nicht auf
 * die Beherrschung wirken: nach Kapitel 5.1 wirkt er ausschliesslich auf die Sicherheit und die
 * Verdachtsmarkierung. Der Wortlaut von I2 („nur senken oder Zweifel wecken") ist die
 * grosszuegigere Lesart; die Tabelle in 5.1 ist die praezisere und gewinnt hier. Der
 * Datenbank-Constraint sichert die grosszuegigere Grenze zusaetzlich ab, damit auch ein Fehler
 * in dieser Schicht nie ein Anheben durchlaesst.
 */
export function assertMasteryChangeAllowed(source: EvidenceSource, masteryDelta: number): void {
  if (source === 'gradedTask') {
    return
  }
  if (masteryDelta > 0) {
    throw new InvariantViolation('I2', `Chatsignal wollte die Beherrschung um ${masteryDelta} anheben.`)
  }
  if (masteryDelta !== 0) {
    throw new InvariantViolation(
      'I1',
      `Chatsignal wollte die Beherrschung um ${masteryDelta} veraendern; Chat wirkt nur auf die Sicherheit.`,
    )
  }
}

/**
 * I3 — Propagation darf ausschliesslich die Sicherheit bewegen.
 *
 * Der Typ `ConfidenceAdjustment` hat kein Beherrschungsfeld, diese Pruefung faengt also nur den
 * Fall ab, dass jemand ein Objekt mit zusaetzlichem Feld hereinreicht (etwa aus JSON).
 */
export function assertPropagationTouchesConfidenceOnly(adjustment: object): void {
  if ('mastery' in adjustment || 'masteryDelta' in adjustment) {
    throw new InvariantViolation('I3', 'Eine Propagation trug ein Beherrschungsfeld.')
  }
}

/**
 * I6 — ein zerstoererischer Vorschlag muss bestaetigt werden und darf nie automatisch laufen.
 */
export function assertProposalSafe(proposal: Pick<StructureProposal, 'operation' | 'requiresConfirmation' | 'status' | 'question'>): void {
  if (!isDestructive(proposal.operation)) {
    return
  }
  if (!proposal.requiresConfirmation) {
    throw new InvariantViolation('I6', `${proposal.operation} ohne requiresConfirmation.`)
  }
  if (proposal.status === 'autoApplied') {
    throw new InvariantViolation('I6', `${proposal.operation} wurde automatisch angewandt.`)
  }
  if (proposal.question.trim().length === 0) {
    throw new InvariantViolation(
      'I6',
      `${proposal.operation} ohne Frage an den Nutzer — eine Bestaetigung ohne Frage ist keine.`,
    )
  }
}

/**
 * I6 (zweite Haelfte) — kein Umbau ohne Protokoll mit Ruecknahmemoeglichkeit.
 *
 * Der leere Ruecknahme-Payload ist der haeufige Fehler: das Protokoll existiert, ist aber wertlos.
 */
export function assertLogEntryComplete(entry: Pick<StructureLogEntry, 'operation' | 'undoPayload'>): void {
  if (!entry.undoPayload || Object.keys(entry.undoPayload).length === 0) {
    throw new InvariantViolation(
      'I6',
      `${entry.operation} wurde ohne Ruecknahme-Anleitung protokolliert.`,
    )
  }
}

/** I8 — jede Aufgabe traegt einen zeigbaren Satz. */
export function assertHasReason(reason: string, context: string): void {
  if (reason.trim().length === 0) {
    throw new InvariantViolation('I8', `${context} ohne Begruendung.`)
  }
}

/**
 * I9 — die Wiederholungs-Mindestreserve wurde eingehalten.
 *
 * Kein starres Verhaeltnis, aber ein Boden. Wie hoch dieser Boden im konkreten Fall liegt,
 * rechnet `reviewReserveSlots` in `planner/planner.ts` aus — der Guard prueft nur, dass er
 * gehalten wurde. Die Trennung ist Absicht: rechnete der Guard den Boden selbst nach, koennten
 * beide Rechnungen auseinanderlaufen, und der Guard wuerde eine Regel pruefen, die der Planer
 * gar nicht verfolgt.
 *
 * `reserveTarget` von 0 bedeutet, dass in dieser Sitzung kein Boden gilt — etwa weil nichts
 * faellig ist oder die Sitzung zu kurz fuer eine sinnvolle Aufteilung waere.
 */
export function assertReviewReserveHeld(args: {
  reviewSlotsUsed: number
  reserveTarget: number
  sessionSize: number
}): void {
  if (args.reserveTarget <= 0) {
    return
  }
  if (args.reviewSlotsUsed < args.reserveTarget) {
    throw new InvariantViolation(
      'I9',
      `Sitzung mit ${args.sessionSize} Aufgaben enthielt ${args.reviewSlotsUsed} Wiederholungen, ` +
        `reserviert waren ${args.reserveTarget}.`,
    )
  }
}

/** I12 — ein einmal vergebener Mustername wird nicht mehr geaendert. */
export function assertPatternNameStable(existingName: string, nextName: string): void {
  if (existingName.trim().length > 0 && existingName !== nextName) {
    throw new InvariantViolation(
      'I12',
      `Muster sollte von "${existingName}" nach "${nextName}" umbenannt werden. Namen aendern sich nur durch protokollierte Verschmelzung.`,
    )
  }
}
