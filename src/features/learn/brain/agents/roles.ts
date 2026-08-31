/**
 * Modellrollen im Ueberblick (Kapitel 12).
 *
 * Sieben Rollen, sechs davon brauchen ein Modell. Der Planer braucht keines — er ist
 * deterministisch (Invariante I11), und das ist keine Sparmassnahme, sondern eine
 * Architekturentscheidung: Reproduzierbarkeit, Testbarkeit, Debugbarkeit.
 *
 * Diese Datei ist das Register. Es beschreibt, WAS eine Rolle tut und WAS sie von einem Modell
 * verlangt — nicht, welches Modell sie bekommt. Das steht in der Vermittlungsschicht
 * (`modelRouting.ts`) und wird im Admin-Menue gepflegt.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { BrainAgentRole } from '../types'

export type RoleSpec = {
  role: BrainAgentRole
  label: string
  /** Aufgabe, wie sie in der Tabelle in Kapitel 12 steht. */
  task: string
  /** Anforderungsprofil an das Modell. */
  profile: string
  /**
   * Warum diese Rolle ueberhaupt getrennt gefuehrt wird. Die Begruendung ist wichtiger als es
   * aussieht: sie ist der Grund, warum man zwei Rollen NICHT auf dasselbe Modell legen darf.
   */
  separationReason: string
  /** Laeuft die Rolle im Nutzerfluss (Latenz zaehlt) oder im Hintergrund? */
  latencyCritical: boolean
  /** Kann diese Rolle bei Zweifel an ein staerkeres Modell eskalieren (Kapitel 5.3)? */
  supportsEscalation: boolean
}

export const ROLE_SPECS: readonly RoleSpec[] = [
  {
    role: 'kartograf',
    label: 'Kartograf',
    task: 'Graph aus Material bauen, Chats Konzepten zuordnen',
    profile: 'Hoechstes Verstaendnis, kritischste Rolle',
    separationReason:
      'Der empfindlichste Punkt der gesamten Architektur. Was der Kartograf falsch zuordnet oder ' +
      'falsch verknuepft, ist an jeder spaeteren Stelle falsch: der Planer plant auf einer schiefen ' +
      'Karte, der Pruefer diagnostiziert am falschen Knoten, die Propagation verteilt Zweifel in die ' +
      'falsche Richtung.',
    latencyCritical: false,
    supportsEscalation: true,
  },
  {
    role: 'aufbereiter',
    label: 'Aufbereiter',
    task: 'Ein Arbeitsheft in Lehrstoff verwandeln',
    profile: 'Fachwissen und Urteil darueber, was eine Frage ueberhaupt ist',
    separationReason:
      'Ein Arbeitsheft ist Themenquelle, nicht Wahrheitsquelle: es stellt die Fragen, ohne sie zu ' +
      'beantworten. Bis es diese Rolle gab, wurde diese Luecke bei JEDER Aufgabe einzeln und ' +
      'unsichtbar gefuellt (`production/generateTask.ts`, Zweig `posesQuestionOnly`) — jedes Mal ' +
      'neu, jedes Mal moeglicherweise anders, und nirgends stand hinterher, was das Modell als wahr ' +
      'angenommen hatte. Der Aufbereiter tut dasselbe EINMAL, vorher, sichtbar und nachlesbar. ' +
      'Danach gilt I5 wieder in voller Schaerfe, nur eben gegen den abgeleiteten Lehrtext.',
    latencyCritical: false,
    supportsEscalation: true,
  },
  {
    role: 'pruefer',
    label: 'Pruefer',
    task: 'Antworten bewerten, Ursache und Zuversicht liefern',
    profile: 'Genauigkeit, Kalibrierung der eigenen Unsicherheit',
    separationReason:
      'Pruefer und Generator sind getrennte Rollen mit getrennten Modellen. Ein Modell, das seine ' +
      'eigene Aufgabe bewertet, ist systematisch zu milde.',
    latencyCritical: true,
    supportsEscalation: true,
  },
  {
    role: 'generator',
    label: 'Generator',
    task: 'Aufgaben, Karten, Arbeitsblaetter erzeugen',
    profile: 'Geschwindigkeit, Formatvielfalt',
    separationReason:
      'Laeuft in Echtzeit und um eine Aufgabe versetzt vorproduziert. Latenz ist hier das ' +
      'Hauptkriterium, nicht Tiefe.',
    latencyCritical: true,
    supportsEscalation: false,
  },
  {
    role: 'kontrolleur',
    label: 'Kontrolleur',
    task: 'Generiertes gegen Quelle pruefen, ggf. gegenloesen',
    profile: 'Unabhaengigkeit vom Generator',
    separationReason:
      'Ein Kontrolleur auf demselben Modell wie der Generator wiederholt dessen Fehler, statt sie ' +
      'zu finden. Beim Gegenloesen muss er die Aufgabe unabhaengig loesen, ohne die Musterloesung ' +
      'zu kennen.',
    latencyCritical: true,
    supportsEscalation: false,
  },
  {
    role: 'konsolidierer',
    label: 'Konsolidierer',
    task: 'Muster verdichten, Strukturumbau vorschlagen',
    profile: 'Mustererkennung ueber grosse Datenmengen',
    separationReason:
      'Laeuft im Hintergrund und selten. Latenz ist unkritisch, dafuer zaehlt die Faehigkeit, ' +
      'ueber viele Beobachtungen hinweg etwas zu sehen, das in keiner einzelnen steht.',
    latencyCritical: false,
    supportsEscalation: false,
  },
  {
    role: 'erklaerer',
    label: 'Erklaerer',
    task: 'In einem Satz begruenden, warum jetzt diese Aufgabe',
    profile: 'Kuerze, Verstaendlichkeit',
    separationReason:
      'Formuliert nur um. Die Begruendung selbst entsteht deterministisch im Planer — der ' +
      'Erklaerer darf nie die Voraussetzung dafuer sein, dass es sie gibt (Invariante I8).',
    latencyCritical: true,
    supportsEscalation: false,
  },
]

const SPEC_BY_ROLE = new Map<BrainAgentRole, RoleSpec>(ROLE_SPECS.map((spec) => [spec.role, spec]))

export function roleSpec(role: BrainAgentRole): RoleSpec {
  const spec = SPEC_BY_ROLE.get(role)
  if (!spec) {
    throw new Error(`Unbekannte Gehirn-Rolle: ${role}`)
  }
  return spec
}

export const ALL_ROLES: readonly BrainAgentRole[] = ROLE_SPECS.map((spec) => spec.role)

/**
 * Rollenpaare, die nicht auf demselben Modell laufen duerfen.
 *
 * Beide Paare stammen aus derselben Ueberlegung: wer bewertet, darf nicht derselbe sein wie der,
 * der produziert hat. Die Regel wird an zwei Stellen durchgesetzt — hier fuer die Anzeige und
 * die Vorabpruefung im Admin-Menue, und in der Datenbank (`admin_set_learn_brain_agent_model`)
 * als letzte Instanz.
 */
export const MUTUALLY_EXCLUSIVE_MODELS: readonly [BrainAgentRole, BrainAgentRole][] = [
  ['generator', 'pruefer'],
  ['generator', 'kontrolleur'],
]

/** Menschenlesbare Begruendung, warum ein Rollenpaar nicht dasselbe Modell haben darf. */
export function exclusionReason(a: BrainAgentRole, b: BrainAgentRole): string | null {
  const pair = MUTUALLY_EXCLUSIVE_MODELS.find(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  )
  if (!pair) {
    return null
  }
  return (
    `${roleSpec(pair[1]).label} bewertet, was der ${roleSpec(pair[0]).label} erzeugt hat. ` +
    'Auf demselben Modell waere diese Pruefung wertlos — ein Modell findet seine eigenen Fehler nicht.'
  )
}
