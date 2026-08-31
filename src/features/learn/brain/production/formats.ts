/**
 * Schicht 5 — Produktionsformate (Kapitel 6.6, verbindliche Zuordnung).
 *
 * „Der Planer bestimmt nicht nur WELCHES Konzept drankommt, sondern auch WELCHE ART Aufgabe.
 *  Das Format ist keine Gestaltungsfrage und keine Nutzerwahl, sondern folgt aus der
 *  Anwendungstiefe, die bewegt werden soll."
 *
 * | Anwendungstiefe | Zugelassene Formate                                              | Evidenzstaerke |
 * |-----------------|------------------------------------------------------------------|----------------|
 * | Erkennen        | Auswahlfrage, Kurzantwort, Zuordnung                             | mittel         |
 * | Anwenden        | Rechenaufgabe mit Eingabe, Verfahrensaufgabe, Lueckenrechnung    | hoch           |
 * | Uebertragen     | eingekleidetes Szenario, Fehlersuche, Begruendungsfrage          | am hoechsten   |
 *
 * Die Tabelle ist abschliessend. Ein zehntes Format hinzuzufuegen heisst, Kapitel 6.6 zu aendern —
 * und der Grund dafuer steht dort: „Gaebe man die Wahl an den Nutzer ab, waere das Gehirn
 * umgehbar." Dasselbe gilt fuer ein Format, das sich still an der Tabelle vorbei einschleicht.
 *
 * Zwei Eigenschaften pro Format, beide mit Folgen an anderer Stelle:
 *
 *  1. `depths` — welche Anwendungstiefe das Format PRUEFEN kann. Eine Auswahlfrage kann
 *     Wiedererkennen zeigen, aber niemals Uebertragen: die Alternativen verraten bereits, dass
 *     ein Konzept gefragt ist. Genau das soll auf der Transferstufe der Lernende selbst leisten.
 *
 *  2. `hasUniqueAnswer` — ob die Musterloesung KURZ und WOERTLICH vergleichbar ist (eine Zahl,
 *     eine Option, eine Zuordnung). Daran haengt das Gegenloesen des Kontrolleurs (Kapitel 7.2):
 *     nur dort kann ein zweites Modell unabhaengig loesen und die Musterloesung widerlegen, indem
 *     zwei Zeichenketten verglichen werden. Formate, deren Musterloesung eine Begruendung in
 *     Prosa ist — auch wenn die Sache dahinter eindeutig ist —, bleiben beim Quellenabgleich:
 *     zwei unabhaengige, beide richtige Begruendungen stimmen so gut wie nie wortgleich ueberein,
 *     und ein Gegenloesen wuerde dort staendig richtige Aufgaben verwerfen.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { ApplicationDepth, EvidenceStrength, TaskFormat } from '../types'

export type FormatSpec = {
  format: TaskFormat
  label: string
  /** Anwendungstiefen, die dieses Format tatsaechlich pruefen kann. */
  depths: readonly ApplicationDepth[]
  /** Kapitel 6.6, dritte Spalte. Folgt der Tiefe, nicht dem einzelnen Format. */
  evidenceStrength: EvidenceStrength
  /**
   * Gibt es genau eine richtige Antwort? Steuert das Gegenloesen (Kapitel 7.2) und die
   * Bewertungsmethode des Pruefers.
   */
  hasUniqueAnswer: boolean
  /**
   * Diagnostischer Sonderfall (Kapitel 6.6, letzter Absatz): liefert ueber die Bewertung hinaus
   * eine besonders praezise Fehlerursache, weil der Nutzer selbst auf den Fehler zeigt.
   */
  diagnostic: boolean
  /** Grober Zeitbedarf in Minuten — Grundlage der Machbarkeitsrechnung in `planner/goal.ts`. */
  minutes: number
  /** Was das Format vom Generator verlangt. Geht in den Auftrag an die Rolle „Generator". */
  brief: string
}

/**
 * Der Formatkatalog — drei Formate je Tiefe, in Praeferenzreihenfolge.
 *
 * Die Reihenfolge innerhalb einer Tiefe ist die Praeferenz: das erste Format ist das
 * aussagekraeftigste, die folgenden dienen der Abwechslung. Ein Konzept immer im selben Format
 * zu fragen misst am Ende das Format, nicht das Konzept.
 */
export const FORMAT_SPECS: readonly FormatSpec[] = [
  // --- Erkennen -------------------------------------------------------------
  {
    format: 'multipleChoice',
    label: 'Auswahlfrage',
    depths: ['recognize'],
    evidenceStrength: 'medium',
    hasUniqueAnswer: true,
    diagnostic: false,
    minutes: 1,
    brief:
      'Genau eine richtige Option unter drei bis vier plausiblen Ablenkern. Die Ablenker muessen ' +
      'typische Verwechslungen abbilden, nicht offensichtlich falsch sein.',
  },
  {
    format: 'shortAnswer',
    label: 'Kurzantwort',
    depths: ['recognize'],
    evidenceStrength: 'medium',
    hasUniqueAnswer: false,
    diagnostic: false,
    minutes: 2,
    brief:
      'Frage nach Bedeutung, Abgrenzung oder Zweck. Kurze freie Antwort von ein bis zwei Saetzen, ' +
      'keine Auswahlmoeglichkeiten.',
  },
  {
    format: 'matching',
    label: 'Zuordnung',
    depths: ['recognize'],
    evidenceStrength: 'medium',
    hasUniqueAnswer: true,
    diagnostic: false,
    minutes: 2,
    brief:
      'Drei bis fuenf Begriffe genau einer Beschreibung zuordnen. Nimm bevorzugt Begriffe, die ' +
      'miteinander verwechselt werden — die Zuordnung trennt sie sauberer als jede Einzelfrage.',
  },

  // --- Anwenden -------------------------------------------------------------
  {
    format: 'calculation',
    label: 'Rechenaufgabe',
    depths: ['apply'],
    evidenceStrength: 'high',
    hasUniqueAnswer: true,
    diagnostic: false,
    minutes: 4,
    brief: 'Aufgabe mit eindeutigem Ergebnis und freier Eingabe. Gib den vollstaendigen Rechenweg als Musterloesung an.',
  },
  {
    format: 'procedure',
    label: 'Verfahrensaufgabe',
    depths: ['apply'],
    evidenceStrength: 'high',
    hasUniqueAnswer: false,
    diagnostic: false,
    minutes: 5,
    brief:
      'Mehrschrittiges Standardvorgehen in der richtigen Reihenfolge. Die Musterloesung nennt die ' +
      'Schritte einzeln, damit Teilpunkte vergeben werden koennen.',
  },
  {
    format: 'clozeCalculation',
    label: 'Lueckenrechnung',
    depths: ['apply'],
    evidenceStrength: 'high',
    hasUniqueAnswer: true,
    diagnostic: false,
    minutes: 3,
    brief:
      'Ein teilweise ausgefuehrter Rechenweg mit ein bis zwei Luecken an den entscheidenden ' +
      'Stellen. Die Luecke sitzt auf dem Schritt, der geprueft wird, nie auf einer Nebenrechnung.',
  },

  // --- Uebertragen ----------------------------------------------------------
  /*
   * Keines der drei Uebertragen-Formate gilt als `hasUniqueAnswer` — bewusst, auch wenn es fuer
   * `scenario` und `errorHunt" auf den ersten Blick eine "richtige" Loesung gibt.
   *
   * Der Unterschied zu `calculation` oder `matching` ist die FORM der Musterloesung: dort ist sie
   * eine Zahl oder eine kurze Zuordnung, hier eine Begruendung in Prosa ("nennt die fehlerhafte
   * Stelle UND warum sie falsch ist"). Zwei unabhaengige, beide richtige Formulierungen einer
   * Begruendung stimmen so gut wie nie wortgleich ueberein — `answersAgree` kann Zeichenketten
   * vergleichen, aber keine Bedeutung. Ein Gegenloesen, das hier scheitert, weist also nicht auf
   * eine falsche Musterloesung hin, sondern nur auf eine andere Formulierung, und wuerde
   * reihenweise richtige Aufgaben verwerfen. Fehlerart 1 (Quellenabgleich, I5) bleibt trotzdem
   * verbindlich — nur das zusaetzliche Gegenloesen entfaellt hier, wie schon bei `justification`.
   */
  {
    format: 'scenario',
    label: 'Eingekleidetes Szenario',
    depths: ['transfer'],
    evidenceStrength: 'highest',
    hasUniqueAnswer: false,
    diagnostic: false,
    minutes: 6,
    brief:
      'Situation aus der Praxis, in der das Konzept NICHT beim Namen genannt wird. Die Person ' +
      'muss selbst erkennen, dass es gebraucht wird.',
  },
  {
    format: 'errorHunt',
    label: 'Fehlersuche',
    depths: ['transfer'],
    evidenceStrength: 'highest',
    hasUniqueAnswer: false,
    diagnostic: true,
    minutes: 5,
    brief:
      'Eine vollstaendig ausgeführte Loesung mit genau einem eingebauten Fehler. Gefragt ist, WO ' +
      'der Fehler steckt und warum. Der Fehler muss einer sein, den Lernende tatsaechlich machen.',
  },
  {
    format: 'justification',
    label: 'Begruendungsfrage',
    depths: ['transfer'],
    evidenceStrength: 'highest',
    hasUniqueAnswer: false,
    diagnostic: false,
    minutes: 5,
    brief:
      'Offene Frage nach dem Warum oder nach den Folgen. Bewertet wird die Begruendung, nicht das ' +
      'Ergebnis.',
  },
]

const SPEC_BY_FORMAT = new Map<TaskFormat, FormatSpec>(FORMAT_SPECS.map((spec) => [spec.format, spec]))

export function formatSpec(format: TaskFormat): FormatSpec {
  const spec = SPEC_BY_FORMAT.get(format)
  if (!spec) {
    throw new Error(`Unbekanntes Produktionsformat: ${format}`)
  }
  return spec
}

/**
 * Ist der Wert eines der neun Formate aus Kapitel 6.6?
 *
 * Gebraucht dort, wo ein Format aus einer Quelle ausserhalb des Typsystems kommt — etwa aus dem
 * Textfeld `learn_task_log.format`. Ein alter oder umbenannter Wert soll dann folgenlos ignoriert
 * werden, statt als unbekanntes Format weiterzureisen.
 */
export function isKnownTaskFormat(value: string): value is TaskFormat {
  return SPEC_BY_FORMAT.has(value as TaskFormat)
}

/** Alle Formate, die eine bestimmte Anwendungstiefe pruefen koennen, in Praeferenzreihenfolge. */
export function formatsForDepth(depth: ApplicationDepth): FormatSpec[] {
  return FORMAT_SPECS.filter((spec) => spec.depths.includes(depth))
}

/** Evidenzstaerke einer Anwendungstiefe (Kapitel 6.6, dritte Spalte). */
export const DEPTH_EVIDENCE_STRENGTH: Record<ApplicationDepth, EvidenceStrength> = {
  recognize: 'medium',
  apply: 'high',
  transfer: 'highest',
}

/**
 * Format waehlen — deterministisch (Invariante I11 gilt fuer die gesamte Auswahl, nicht nur
 * fuer das Konzept).
 *
 * Die Abwechslung entsteht aus dem Zaehler der bisherigen Versuche, nicht aus Zufall: dieselbe
 * Ausgangslage ergibt zweimal dieselbe Aufgabe, und ein seltsames Format laesst sich als Bug
 * oder als Entscheidung unterscheiden. Genau der Grund, aus dem der Planer ueberhaupt
 * deterministisch ist.
 *
 * `avoidFormat` verhindert, dass zweimal hintereinander dasselbe Format kommt.
 *
 * Verwechslungsmuster (Kapitel 10) steuern das Format innerhalb der zugelassenen Tabelle, nicht
 * an ihr vorbei: auf Erkennen trennt die Zuordnung zwei verwechselte Begriffe am schaerfsten, auf
 * Uebertragen tut es die Fehlersuche, weil der Nutzer dort selbst auf die Verwechslung zeigt.
 */
export function selectFormat(args: {
  depth: ApplicationDepth
  attemptIndex: number
  avoidFormat?: TaskFormat | null
  /** Liegt ein benanntes Verwechslungsmuster vor? */
  hasConfusionPattern?: boolean
}): FormatSpec {
  const candidates = formatsForDepth(args.depth)
  if (candidates.length === 0) {
    return formatSpec('shortAnswer')
  }

  if (args.hasConfusionPattern) {
    const preferred = args.depth === 'transfer' ? 'errorHunt' : args.depth === 'recognize' ? 'matching' : null
    const match = preferred ? candidates.find((spec) => spec.format === preferred) : undefined
    if (match && match.format !== args.avoidFormat) {
      return match
    }
  }

  const index = Math.abs(Math.trunc(args.attemptIndex)) % candidates.length
  const picked = candidates[index]
  if (picked.format !== args.avoidFormat || candidates.length === 1) {
    return picked
  }
  return candidates[(index + 1) % candidates.length]
}

/**
 * Stabiler 32-Bit-Streuwert (FNV-1a) — die Grundlage aller deterministischen Streuungen hier.
 *
 * Bewusst eine eigene, festgeschriebene Funktion statt einer Bibliothek: von ihr haengt ab, welches
 * Format ein Konzept bekommt und in welcher Reihenfolge Optionen stehen. Beides muss bei gleicher
 * Ausgangslage zweimal dasselbe ergeben (I11) — auch nach einem Abhaengigkeits-Update.
 */
function hash32(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * Konzeptabhaengiger Versatz fuer die Formatrotation.
 *
 * Ohne ihn beginnt JEDES Konzept bei Rotationsindex 0 — und das erste Format einer Tiefe ist immer
 * dasselbe (bei „Erkennen" die Auswahlfrage). In einem frisch erstellten Pfad hat noch kein Konzept
 * direkte Evidenz, also bekaeme die gesamte erste Sitzung nur Auswahlfragen: die Rotation aus
 * Kapitel 6.6 („Ein Konzept immer im selben Format zu fragen misst am Ende das Format, nicht das
 * Konzept") griffe genau dann nicht, wenn sie am meisten gebraucht wird.
 *
 * Der Versatz verletzt I11 nicht: er ist eine reine Funktion der Konzept-Kennung, kein Zufall.
 * Dieselbe Lage ergibt zweimal dasselbe Format, und ein seltsames Format bleibt als Entscheidung
 * nachvollziehbar. Er verschiebt nur, WO in der Rotation ein Konzept beginnt — die Reihenfolge
 * innerhalb der Rotation und die Praeferenz der Tabelle bleiben unberuehrt.
 */
export function formatRotationOffset(conceptId: string): number {
  return hash32(conceptId) % 1000
}

/** Deterministischer Pseudozufall (mulberry32) aus einem Startwert. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Antwortoptionen deterministisch mischen und den Index der richtigen Option mitfuehren.
 *
 * Sprachmodelle setzen die richtige Option ueberdurchschnittlich oft an die erste Stelle. Bleibt
 * diese Reihenfolge stehen, ist die Aufgabe ohne Lesen loesbar — und die daraus gewonnene Evidenz
 * misst nicht das Konzept, sondern die Ratefaehigkeit. Sie wandert trotzdem voll gewichtet ins
 * Lernerbild (I1) und verfaelscht es dauerhaft.
 *
 * Gemischt wird aus einem Streuwert des Aufgabentexts, nicht aus `Math.random`: dieselbe Aufgabe
 * ergibt zweimal dieselbe Reihenfolge (I11). Ein Zufallsgenerator haette dieselbe Aufgabe bei jedem
 * Aufruf anders sortiert und damit die Nachvollziehbarkeit aufgegeben, die der ganze Planer
 * verteidigt.
 *
 * `correctIndex` wandert mit: `null` bleibt `null` (dann ist nur die Reihenfolge betroffen, nicht
 * die Bedeutung), sonst zeigt der zurueckgegebene Index auf dieselbe Option wie zuvor.
 */
export function permuteOptionsDeterministically(
  options: string[],
  correctIndex: number | null,
  seed: string,
): { options: string[]; correctIndex: number | null } {
  if (options.length < 2) {
    return { options, correctIndex }
  }

  const order = options.map((_, index) => index)
  const random = seededRandom(hash32(seed))
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  const permuted = order.map((sourceIndex) => options[sourceIndex])
  const movedCorrectIndex = correctIndex === null ? null : order.indexOf(correctIndex)
  return { options: permuted, correctIndex: movedCorrectIndex }
}

/**
 * Gegenloesen erforderlich? (Kapitel 7.2, offene Empfehlung — hier uebernommen.)
 *
 * „Fehlerart 3 ist die gefaehrlichste, weil der Pruefer den Nutzer dann fuer eine RICHTIGE
 *  Antwort bestraft. Das kostet doppelt: der Nutzer verliert sofort das Vertrauen, und ein
 *  falsches Signal wandert ins Lernerbild, wo es zusaetzlich propagiert."
 *
 * Der Kompromiss aus dem Dokument: Gegenloesen bei eindeutig loesbaren Aufgabentypen,
 * Quellenabgleich allein bei offenen Erklaerfragen.
 *
 * Anmerkung zur Kostenschaetzung: Kapitel 7.2 schaetzt „rund ein Drittel der Aufgaben" — mit der
 * verbindlichen Formattabelle aus 6.6 sind es vier der neun Formate, ziemlich genau das. „Eindeutig
 * loesbar" heisst hier bewusst mehr als „hat eine richtige Loesung": es heisst, dass die
 * Musterloesung KURZ und WOERTLICH vergleichbar ist — eine Zahl, eine Option, eine Zuordnung.
 * Die drei Uebertragen-Formate haben zwar auch eine richtige Antwort, aber als Begruendung in
 * Prosa, und zwei unabhaengige richtige Begruendungen stimmen kaum je wortgleich ueberein.
 * `counterSolveShare()` macht die Zahl sichtbar, damit die Kostenseite nicht unbemerkt waechst.
 */
export function requiresCounterSolve(format: TaskFormat): boolean {
  return formatSpec(format).hasUniqueAnswer
}

/** Anteil der Formate, die gegengeloest werden — dient der Kostenabschaetzung. */
export function counterSolveShare(): number {
  const unique = FORMAT_SPECS.filter((spec) => spec.hasUniqueAnswer).length
  return unique / FORMAT_SPECS.length
}

/**
 * Liefert dieses Format eine besonders praezise Fehlerursache? (Kapitel 6.6, Sonderfall)
 *
 * Die Fehlersuche ist die einzige Aufgabenart, in der der Nutzer selbst auf den Fehler zeigt.
 * Der Konsolidierer gewichtet solche Beobachtungen hoeher, weil sie die Ursache nicht erschliessen
 * muessen, sondern benannt bekommen.
 */
export function isDiagnosticFormat(format: TaskFormat): boolean {
  return formatSpec(format).diagnostic
}

// ---------------------------------------------------------------------------
// Zuordnungsformat (`matching`) — interaktive Antwort statt Fliesstext
// ---------------------------------------------------------------------------

/**
 * CSV-Konvention der Zuordnungs-Eingabe (`components/BrainSession.tsx`, ein Wert je
 * Begriffszeile): der Index der zugeordneten Beschreibung, leer = noch nicht zugeordnet.
 * Dieselbe Konvention wie bei `LearnEntryQuizMatch` im alten Lernmotor, hier nur geparst statt
 * selbst verwaltet — die Zuweisung selbst bleibt Sache der Komponente.
 */
function parseMatchAssignment(value: string, termCount: number): (number | null)[] {
  const entries = value.split(',')
  if (entries.length !== termCount) {
    return Array.from({ length: termCount }, () => null)
  }
  return entries.map((entry) => {
    const trimmed = entry.trim()
    if (trimmed === '') {
      return null
    }
    const index = Number.parseInt(trimmed, 10)
    return Number.isInteger(index) && index >= 0 ? index : null
  })
}

/** Sind alle Begriffe einer Beschreibung zugeordnet? Steuert den „Antwort pruefen"-Knopf. */
export function matchingAssignmentComplete(value: string, termCount: number): boolean {
  if (termCount === 0) {
    return false
  }
  return parseMatchAssignment(value, termCount).every((entry) => entry !== null)
}

/**
 * Die Zuordnung in lesbaren Antworttext uebersetzen, bevor sie an `onAnswer` geht (Kapitel 4).
 *
 * Der Pruefer bewertet wie bei jedem anderen Format Freitext gegen `expectedAnswer` — semantisch,
 * nicht zeichengenau (`agents/prompts.ts`, Rolle Pruefer). Ein ausgeschriebener
 * "Begriff → Beschreibung"-Text ist dafuer robuster als ein kodierter Verweis auf `expectedAnswer`s
 * Buchstaben-Zahlen-Schema ("A-3, B-1, …"): er kommt ohne jede Kenntnis dieser Kodierung aus und
 * bleibt auch dann lesbar, wenn `expectedAnswer` sie einmal anders formuliert.
 */
export function composeMatchingAnswer(terms: string[], descriptions: string[], value: string): string {
  const assignment = parseMatchAssignment(value, terms.length)
  return terms
    .map((term, index) => {
      const chosen = assignment[index]
      const description = chosen !== null ? descriptions[chosen] : undefined
      return `${term} → ${description ?? '(nicht zugeordnet)'}`
    })
    .join('; ')
}

/**
 * Ein Buchstabe-Ziffer-Paar wie "A-1", "A – 1", "A→1", "A zu 1".
 *
 * Als Quelltext statt als fertiger Ausdruck, weil zwei Stellen dasselbe Muster brauchen, aber
 * keine sich eine gemeinsame `lastIndex` teilen darf: ein globaler Ausdruck merkt sich zwischen
 * zwei Aufrufen die Position, und ein `matchAll` neben einem `match` auf demselben Objekt liest
 * dann irgendwo mittendrin weiter. Jede Verwendung baut sich ihre eigene Instanz.
 *
 * Die Trennzeichen sind bewusst grosszuegig: welches Strich- oder Pfeilzeichen ein Modell
 * zwischen Begriff und Beschreibung setzt, ist Satzkonvention und sagt nichts ueber die
 * Zuordnung. Genau diese Grosszuegigkeit fehlte dem Antwortvergleich (`quality.ts`) und hat dort
 * richtige Zuordnungen verworfen, weil die eine Seite einen Gedankenstrich und die andere einen
 * Bindestrich benutzte.
 */
const ASSIGNMENT_PAIR_SOURCE = String.raw`\b([A-E])\s*(?:[-‐-―−]|→|->|=|:|zu)\s*([1-5])\b`

const assignmentPairPattern = () => new RegExp(ASSIGNMENT_PAIR_SOURCE, 'gi')

/**
 * Eine Zuordnungsantwort ("A-1, B-2, C-3") in ihre Paare zerlegen — oder `null`, wenn der Text
 * keine erkennbare Zuordnung ist.
 *
 * Wozu: eine Zuordnung ist eine MENGE von Paaren. Ihre Richtigkeit haengt nicht daran, in welcher
 * Reihenfolge sie aufgeschrieben wird, mit welchem Zeichen die beiden Haelften verbunden sind oder
 * wie die Aufzaehlung getrennt wird. Ein Zeichenkettenvergleich sieht genau diese Unterschiede und
 * sonst nichts — dasselbe Missverhaeltnis, das bei Auswahlfragen schon einmal aufgefallen ist
 * (siehe `resolveCounterSolveAnswer` in `quality.ts`) und dort ueber die Position geloest wurde.
 *
 * `null` bei weniger als zwei Paaren: ein einzelnes "A-1" irgendwo im Fliesstext ist keine
 * Zuordnung, und wer es dafuer haelt, vergleicht anschliessend zwei Antworten anhand eines
 * zufaelligen Fundes. Ebenso `null` bei einem Begriff, der zweimal mit verschiedenen
 * Beschreibungen genannt wird — das ist ein widerspruechlicher Text, und Raten waere hier
 * schlimmer als der Rueckfall auf den Zeichenkettenvergleich.
 */
export function parseAssignmentPairs(text: string): Map<string, string> | null {
  const pairs = new Map<string, string>()
  for (const match of text.matchAll(assignmentPairPattern())) {
    const term = match[1].toUpperCase()
    const description = match[2]
    const seen = pairs.get(term)
    if (seen !== undefined && seen !== description) {
      return null
    }
    pairs.set(term, description)
  }
  return pairs.size >= 2 ? pairs : null
}

/**
 * Erkennt, ob Auswahlfrage-Optionen wie alternative Komplett-Zuordnungen aussehen (z. B.
 * "A-1, B-2, C-3" gegen "A-2, B-1, C-3") statt wie einzelne, eigenstaendige Aussagen ueber einen
 * Begriff — das Symptom, das der Generator-Prompt fuer `multipleChoice` ausdruecklich ausschliesst
 * (`agents/prompts.ts`), sich aber nicht immer daran haelt.
 *
 * Reine Heuristik auf dem Text, kein Urteil ueber Richtigkeit oder Quellenbindung — das bleibt
 * Sache des Kontrolleurs (I5). Ein falscher Treffer hier kostet hoechstens einen zusaetzlichen
 * Generator-Aufruf (siehe `generateTask.ts`), nie eine falsche Ablehnung.
 */
export function optionsLookLikeFullAssignments(options: string[]): boolean {
  const assignmentLikeCount = options.filter((option) => {
    const matches = option.match(assignmentPairPattern())
    return matches !== null && matches.length >= 2
  }).length
  return assignmentLikeCount >= 2
}

const ORDINAL_TO_INDEX: Record<string, number> = {
  erste: 0,
  zweite: 1,
  dritte: 2,
  vierte: 3,
  fünfte: 4,
  fuenfte: 4,
  sechste: 5,
}

/** "die zweite Option", "Option 2", "Option B" — je 0-basiert aufgeloest. */
const ORDINAL_OPTION_REF = /\b(erste|zweite|dritte|vierte|f(?:ü|ue)nfte|sechste)\s+Option\b/i
const NUMBERED_OPTION_REF = /\bOption\s*([1-6]|[A-F])\b/i

/**
 * Nachlese-Fallback fuer `expectedAnswer` bei multipleChoice, wenn `correctOptionIndex`
 * (`agents/contracts.ts`) fehlt: erkennt einen Verweis wie "Die zweite Option ist richtig" oder
 * "Option B ist richtig" im Text und loest ihn in einen 0-basierten Index auf.
 *
 * Reine Heuristik auf Restfaellen, in denen der Generator trotz PFLICHT-Feld ohne
 * `correctOptionIndex` geantwortet, aber wenigstens in Prosa auf eine Position verwiesen hat statt
 * die Option selbst zu wiederholen. Findet sich kein solcher Verweis oder liegt der Index ausserhalb
 * von `options`, liefert die Funktion `null` — `generateTask.ts` belaesst `expectedAnswer` dann
 * unveraendert, wie es der Generator geschrieben hat.
 */
export function extractOrdinalOptionReference(text: string, optionsCount: number): number | null {
  const ordinalMatch = text.match(ORDINAL_OPTION_REF)
  if (ordinalMatch) {
    const index = ORDINAL_TO_INDEX[ordinalMatch[1].toLowerCase()]
    return index !== undefined && index < optionsCount ? index : null
  }
  const numberedMatch = text.match(NUMBERED_OPTION_REF)
  if (numberedMatch) {
    const raw = numberedMatch[1]
    const index = /[0-9]/.test(raw) ? Number(raw) - 1 : raw.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0)
    return index >= 0 && index < optionsCount ? index : null
  }
  return null
}

/**
 * Die Woerter, mit denen eine Ausgabe auf das QUELLDOKUMENT zeigt statt auf die Sache.
 *
 * Bewusst nur Bezeichnungen fuer das Material selbst. „Aufgabe", „Loesung", „Fall" stehen
 * absichtlich nicht dabei: auf sie darf ein Aufgabentext verweisen, weil sie zur Aufgabe gehoeren
 * („in der folgenden Loesung steckt ein Fehler" ist das Format `errorHunt`, kein Mangel).
 */
const SOURCE_NOUN =
  'Text|Auszug|Abschnitt|Kapitel|Material|Materialien|Skript|Dokument|Dossier|Unterlage|Unterlagen|Quelle|Lehrmittel|Arbeitsheft'

/**
 * Verweise auf den Auszug selbst statt auf die Sache: „im Text", „laut dem Dossier", „hier
 * gefragt". Bewusst eng gefasst — gemeint ist nur der Fall, in dem das QUELLDOKUMENT der
 * Bezugspunkt ist.
 *
 * Der Artikel steht optional dazwischen (`dem`, `diesem`, `vorliegenden`, …): ohne ihn erkannte
 * das Muster zwar „in dem Text", aber nicht „laut dem Text" oder „nach diesem Dossier" — also
 * ausgerechnet die gelaeufigeren Formulierungen.
 */
const TEXT_SELF_REFERENCE = new RegExp(
  String.raw`\b(?:im|in|laut|gem(?:ä|ae)ss|nach|aus)\s+(?:(?:dem|der|den|diesem|vorliegenden|obigen|genannten|beigefuegten)\s+)*(?:${SOURCE_NOUN})\b` +
    String.raw`|\bhier\s+gefragt\b`,
  'i',
)

/**
 * Beschreiben die Zuordnungs-Beschreibungen den TEXT statt die Begriffe?
 *
 * Beobachtetes Fehlmuster bei zu schmalem Auszug: findet der Generator zu den Begriffen keine
 * Definitionen, weicht er auf ihre Rolle im Dokument aus — „Im Text konkret genannte Beispiele
 * fuer solche Mittel", „Bereich, zu dem im Text nach den wichtigsten Einnahmequellen gefragt wird".
 * Das ist formal quellentreu und besteht deshalb den Quellenabgleich, misst aber nichts: wer das
 * zuordnet, hat den Aufbau des Auszugs erraten, nicht den Begriff verstanden.
 *
 * Reine Textheuristik, kein inhaltliches Urteil. Ein Fehltreffer kostet hoechstens einen
 * zusaetzlichen Generator-Aufruf (siehe `generateTask.ts`), nie eine Ablehnung.
 */
export function descriptionsDescribeTheText(descriptions: string[]): boolean {
  return descriptions.some((description) => TEXT_SELF_REFERENCE.test(description))
}

/**
 * Fragt der Aufgabentext nach dem DOKUMENT statt nach der Sache?
 *
 * Dasselbe Fehlmuster wie bei `descriptionsDescribeTheText`, nur eine Ebene hoeher: „Im Dossier
 * wird genannt, dass …", „Welche der im Material aufgefuehrten Steuern …". Der Auszug ist die
 * Grundlage der Aufgabe, nicht ihr Gegenstand — er darf im Fragetext gar nicht vorkommen. Solche
 * Fragen bestehen den Quellenabgleich muehelos (sie handeln ja vom Auszug) und messen trotzdem
 * nichts: beantworten kann sie nur, wer das Dokument daneben liegen hat, und wer es daneben liegen
 * hat, hat nachgeschlagen statt gewusst. Ausserdem laufen sie der Pruefungslage zuwider — geprueft
 * wird spaeter die Sache, nicht die Fundstelle.
 *
 * Gilt fuer JEDES Format, denn der Mangel haengt nicht am Format, sondern an der Blickrichtung
 * der Frage. Reine Textheuristik wie oben: ein Fehltreffer kostet hoechstens einen zusaetzlichen
 * Generator-Aufruf, nie eine Ablehnung.
 */
export function promptReferencesTheSource(prompt: string): boolean {
  return TEXT_SELF_REFERENCE.test(prompt)
}

/**
 * Kennzeichnung eines Aufzaehlungspunkts: Buchstabe A-E oder Ziffer 1-5, gefolgt von ")" oder ".",
 * gefolgt von mindestens einem Leerzeichen. Das Leerzeichen ist Pflicht (nicht "\s*") — sonst
 * traefe "." auch mitten in einer Zahl wie "1.500" oder "1.5" (in Schweizer Notation ein
 * gebraeuchliches Tausender- bzw. Dezimaltrennzeichen, in einem Finanz-/Steuertext keine
 * Seltenheit).
 */
const MATCH_LABEL = /(?:^|\s)([A-E]|[1-5])[).]\s+/g

const LETTER_SEQUENCE = ['A', 'B', 'C', 'D', 'E'] as const
const DIGIT_SEQUENCE = ['1', '2', '3', '4', '5'] as const

type MatchMarkerKind = 'letter' | 'digit'
type MatchMarker = { kind: MatchMarkerKind; symbol: string; start: number; end: number }

/**
 * Aus den rohen Fundstellen einer Art (Buchstabe oder Ziffer) die tatsaechliche Aufzaehlung
 * herausfiltern: eine strikt aufsteigende Folge A, B, C, … (bzw. 1, 2, 3, …), die bei der ersten
 * Luecke abbricht.
 *
 * Warum streng statt "alle Treffer dieser Art nehmen": ein roher Treffer kann eine zufaellige
 * Fundstelle sein, keine echte Aufzaehlung — allen voran die deutsche Abkuerzung "z. B.", die
 * wortwoertlich "Leerzeichen, Grossbuchstabe B, Punkt, Leerzeichen" ist und in einer Beschreibung
 * mitten im Fliesstext auftauchen kann, weit hinter dem echten "B)". Weil hier von vorne nach dem
 * jeweils naechsten erwarteten Symbol gesucht wird (erst A, danach erst B ab dessen Fundstelle,
 * …), faellt ein spaeter liegender Zufallstreffer fuer ein bereits verbrauchtes Symbol nicht mehr
 * ins Gewicht — er wird schlicht nie wieder gesucht.
 */
function cleanMatchSequence(markers: readonly MatchMarker[], kind: MatchMarkerKind, order: readonly string[]): MatchMarker[] {
  const pool = markers.filter((marker) => marker.kind === kind)
  const sequence: MatchMarker[] = []
  let searchFrom = 0
  for (const symbol of order) {
    const next = pool.find((marker) => marker.symbol === symbol && marker.start >= searchFrom)
    if (!next) {
      break
    }
    sequence.push(next)
    searchFrom = next.end
  }
  return sequence
}

/**
 * Nachlese: matchTerms/matchDescriptions aus dem Aufgabentext selbst gewinnen, wenn der Generator
 * sie nicht als eigene Felder mitliefert (`agents/prompts.ts` verlangt es zwar, ein Sprachmodell
 * haelt eine Pflicht in einem redundanten Zweitfeld erfahrungsgemaess nicht zuverlaessig ein) —
 * und, in `generateTask.ts` Schicht 1, um eine als multipleChoice ausgegebene, tatsaechlich aber
 * als Zuordnung geschriebene Aufgabe zu erkennen.
 *
 * Reiner Nachlese-Parser auf dem Aufgabentext, den der Kontrolleur bereits gegen die Quelle
 * geprueft hat bzw. gleich prueft (`generateTask.ts` uebergibt genau `task.prompt`) — es entsteht
 * dadurch keine neue, ungeprüfte Behauptung, nur eine zweite Ansicht auf denselben Text.
 *
 * Verlangt zwei zusammenhaengende Bloecke derselben Kennzeichnungsart — erst durchgehend
 * Buchstaben oder durchgehend Ziffern, dann die jeweils andere Art, in EINER der beiden
 * Reihenfolgen. Welche Art welche Rolle traegt (Begriffe oder Beschreibungen) UND welche der
 * beiden zuerst kommt, ist bewusst nicht vorgeschrieben: die verbindliche Konvention aus
 * `agents/prompts.ts` (Buchstaben=Begriffe zuerst, dann Ziffern=Beschreibungen) gilt nur, wenn der
 * Generator wusste, dass er eine Zuordnung schreibt. Schreibt er sie versehentlich unter dem
 * Auftrag "multipleChoice", kennt er diese Konvention nicht und kann Reihenfolge wie Rollen frei
 * vertauschen (siehe Test unten) — die Rolle wird deshalb NICHT am Symbol festgemacht, sondern an
 * der Textlaenge: Begriffe sind kurze Nennungen, Beschreibungen ausformulierte Saetze, die
 * kuerzere Gruppe im Schnitt sind also die Begriffe.
 *
 * Weicht der Text von diesem Muster ab, liefert die Funktion `null` statt zu raten — der
 * bestehende Fliesstext-Fallback in `BrainSession.tsx` bleibt dann unveraendert die sichere
 * Anzeige.
 */
export function extractMatchPairsFromPrompt(prompt: string): { terms: string[]; descriptions: string[] } | null {
  const markers: MatchMarker[] = []

  MATCH_LABEL.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MATCH_LABEL.exec(prompt)) !== null) {
    markers.push({
      kind: /[A-E]/.test(match[1]) ? 'letter' : 'digit',
      symbol: match[1],
      start: match.index,
      end: match.index + match[0].length,
    })
  }

  const letters = cleanMatchSequence(markers, 'letter', LETTER_SEQUENCE)
  const digits = cleanMatchSequence(markers, 'digit', DIGIT_SEQUENCE)
  if (letters.length < 2 || letters.length !== digits.length) {
    return null
  }

  // Zwei zusammenhaengende Bloecke, keine Verzahnung: die eine Gruppe muss vollstaendig vor der
  // anderen liegen.
  const lettersFirst = letters[letters.length - 1].end <= digits[0].start
  const digitsFirst = digits[digits.length - 1].end <= letters[0].start
  if (!lettersFirst && !digitsFirst) {
    return null
  }
  const ordered = lettersFirst ? [...letters, ...digits] : [...digits, ...letters]

  const segments: string[] = []
  for (let i = 0; i < ordered.length; i += 1) {
    const marker = ordered[i]
    const rawEnd = i + 1 < ordered.length ? ordered[i + 1].start : prompt.length
    // Nur die erste Zeile des Abschnitts: trennt einen echten Absatzwechsel (z. B. eine
    // "Beschreibungen:"-Ueberschrift vor dem zweiten Block) vom eigentlichen Text ab, ohne eigene
    // Sprachkenntnis dieser Ueberschrift zu brauchen.
    const segment = prompt.slice(marker.end, rawEnd).split('\n')[0].trim()
    if (segment.length === 0 || segment.length > 400) {
      return null
    }
    segments.push(segment)
  }

  const firstGroup = segments.slice(0, letters.length)
  const secondGroup = segments.slice(letters.length)
  const avgLength = (group: string[]) => group.reduce((sum, entry) => sum + entry.length, 0) / group.length
  const [terms, descriptions] = avgLength(firstGroup) <= avgLength(secondGroup) ? [firstGroup, secondGroup] : [secondGroup, firstGroup]

  // Begriffe bleiben kurze Nennungen, keine ausformulierten Saetze — sonst war die Laengen-
  // Zuordnung selbst schon ein Zeichen, dass der Text nicht dem erwarteten Muster folgt.
  if (terms.some((term) => term.length > 200)) {
    return null
  }
  return { terms, descriptions }
}
