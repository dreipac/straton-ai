/**
 * Schicht 0 — Aufbereitung: aus einem Arbeitsheft wird Lehrstoff.
 *
 * Das Problem, das diese Schicht loest, steckt in der Natur des Materials. Ein Dossier, ein
 * Uebungsblatt, ein Arbeitsheft STELLT die Fragen, die gekonnt werden muessen, und beantwortet
 * sie nicht — die Antworten stehen im Unterricht, in einem Lehrmittel, in einem Film. Fuer das
 * Gehirn ist ein solches Material eine THEMENQUELLE, keine Wahrheitsquelle.
 *
 * Bis es diese Schicht gab, fiel das erst bei der Aufgabenerzeugung auf, und zwar jedes Mal neu:
 * der Zweig `posesQuestionOnly` in `production/generateTask.ts` suchte dann im Web oder griff auf
 * das Fachwissen des Modells zurueck und senkte den Pruefmassstab auf `consistency`. Unsichtbar,
 * bei jeder Aufgabe erneut, mit potenziell jedes Mal anderer Antwort, und nirgends stand
 * hinterher, was das Modell eigentlich als wahr angenommen hatte.
 *
 * Hier geschieht dasselbe EINMAL, im Voraus, und das Ergebnis ist ein Text, den man lesen und
 * korrigieren kann. Der Gewinn ist nicht nur Sparsamkeit: danach gilt Invariante I5 wieder in
 * voller Schaerfe. Geprueft wird gegen einen Lehrtext, der vorher da war — statt gegen etwas, das
 * im Moment der Pruefung erst erfunden wurde.
 *
 * Die reinen Teile (`composeDerivedText`, `derivationSummary`, `researchQueriesFor`) sind ohne
 * Netz pruefbar; nur `deriveFromMaterial` ruft Modelle auf.
 */

import { callWithEscalation } from '../agents/client'
import { parseAufbereiterResult, type WorkbookItem } from '../agents/contracts'
import { sectionMaterials } from '../../utils/materialSectioning'
import type { UploadedMaterial } from '../../services/learn.persistence'

/** Zuschnitt der Abschnitte. Gross genug, dass eine Aufgabe samt ihrem Umfeld zusammenbleibt. */
const SECTION_TARGET_CHARS = 6000
const MAX_SECTIONS = 12
/** Zwei gleichzeitig — dieselbe Zurueckhaltung wie bei der Konzeptbildung, gegen Rate-Limits. */
const CONCURRENCY = 2

/**
 * Namenszusatz des abgeleiteten Materials.
 *
 * Der Name ist nicht Kosmetik: die Materialsuche schreibt ihn in JEDEN Auszug („Quelle 1
 * (<name>): …"). Damit reist die Herkunftsangabe kostenlos bis zum Generator und zum Kontrolleur
 * mit, ohne dass ein Markierungssatz in den Lehrtext selbst muss — der wuerde dort mitgelernt und
 * spaeter abgefragt.
 */
export const DERIVED_NAME_SUFFIX = ' — ergaenzter Lehrstoff'

export function derivedMaterialName(sourceName: string): string {
  return `${sourceName}${DERIVED_NAME_SUFFIX}`
}

export type DerivationSummary = {
  wissensfragen: number
  arbeitsauftraege: number
  reflexionen: number
  /** Wie viele Antworten NICHT aus dem Material stammen, sondern ergaenzt wurden. */
  ergaenzt: number
  /** Wie viele der Aufbereiter selbst als unsicher gemeldet hat. */
  unsicher: number
}

export function derivationSummary(items: WorkbookItem[]): DerivationSummary {
  const knowledge = items.filter((item) => item.kind === 'wissensfrage')
  return {
    wissensfragen: knowledge.length,
    arbeitsauftraege: items.filter((item) => item.kind === 'arbeitsauftrag').length,
    reflexionen: items.filter((item) => item.kind === 'reflexion').length,
    ergaenzt: knowledge.filter((item) => item.answerSource !== 'material').length,
    unsicher: knowledge.filter((item) => item.needsResearch).length,
  }
}

/**
 * Aus den erkannten Punkten den Lehrtext giessen.
 *
 * Nur `wissensfrage` wird Text. Arbeitsauftraege („Setzen Sie sich in Gruppen zusammen") tragen
 * kein Wissen, und Reflexionsfragen („Wie stellen Sie sich Ihr Zusammenleben vor?") haben keine
 * richtige Antwort — beide wuerden spaeter zu Konzepten, zu denen der Generator eine pruefbare
 * Frage bauen soll. Genau daraus entstehen Aufgaben, auf die niemand richtig antworten kann.
 *
 * Die Herkunftsangabe steht bewusst NICHT im Text. Sie haengt am Namen des Materials und an den
 * gespeicherten Punkten; ein Markierungssatz mitten im Lehrstoff wuerde mitgelernt und
 * anschliessend abgefragt.
 *
 * Frage und Antwort bleiben zusammen, weil die Materialsuche den Text in Fenster schneidet: eine
 * Antwort ohne ihre Frage ist ein Absatz ohne Bezug, und ein Auszug daraus belegt nichts.
 */
export function composeDerivedText(items: WorkbookItem[], sourceName: string): string {
  const knowledge = items.filter((item) => item.kind === 'wissensfrage' && item.answer.trim())
  if (knowledge.length === 0) {
    return ''
  }

  const blocks = knowledge.map((item) => `${item.question.trim()}\n${item.answer.trim()}`)
  return [`Lehrstoff zu den Fragen aus „${sourceName}".`, '', ...blocks].join('\n\n').trim()
}

/**
 * Wonach nachrecherchiert werden soll.
 *
 * Zwei Faelle, ein Grund: es liegt keine belegte Antwort vor. Entweder hat der Aufbereiter selbst
 * Unsicherheit gemeldet, oder ein Arbeitsauftrag verweist auf ein Thema, dessen Inhalt gar nicht
 * im Material steht („Schauen Sie sich den Filmbeitrag zu den Mosuo an") — dort ist die Luecke
 * offensichtlich, denn der Film liegt nicht vor.
 *
 * Antworten, die der Aufbereiter sicher aus dem Material gezogen hat, werden NICHT nachrecherchiert.
 * Das Material der Person hat Vorrang vor dem Netz: es ist das, woran sie geprueft wird.
 */
export function researchQueriesFor(items: WorkbookItem[]): string[] {
  const queries: string[] = []
  for (const item of items) {
    if (item.kind === 'wissensfrage' && item.needsResearch) {
      queries.push(item.question)
      continue
    }
    if (item.kind === 'arbeitsauftrag' && item.topic.trim()) {
      queries.push(item.topic.trim())
    }
  }
  return [...new Set(queries.map((q) => q.trim()).filter(Boolean))]
}

export type DerivationResult = {
  /** Der abgeleitete Lehrtext. Leer, wenn das Material keine einzige Wissensfrage enthielt. */
  text: string
  items: WorkbookItem[]
  summary: DerivationSummary
}

export type DeriveArgs = {
  material: UploadedMaterial
  /** Websuche. Fehlt sie, bleibt es beim Fachwissen des Modells. */
  searchWeb?: (query: string) => Promise<string>
  signal?: AbortSignal
  /** Fortschritt fuer die Oberflaeche: abgearbeitete von insgesamt so vielen Abschnitten. */
  onProgress?: (done: number, total: number) => void
}

/**
 * Ein Material aufbereiten.
 *
 * Zwei Durchgaenge, und die Reihenfolge ist die Aussage: Erst liest der Aufbereiter das Material
 * ohne fremde Hilfe — was darin steht, hat Vorrang. Erst dort, wo er selbst Unsicherheit meldet
 * oder ein Auftrag auf nicht vorliegendes Material verweist, wird recherchiert und der betroffene
 * Abschnitt EIN zweites Mal vorgelegt. Ohne diese Reihenfolge wuerde Recherche das Material
 * ueberschreiben statt es zu ergaenzen.
 *
 * Faellt ein Abschnitt aus (Modellfehler, Abbruch), tragen die uebrigen weiter. Ein unvollstaendig
 * aufbereitetes Material ist besser als gar keines — die Luecke faellt spaeter als fehlendes
 * Konzept auf, nicht als falsche Behauptung.
 */
export async function deriveFromMaterial(args: DeriveArgs): Promise<DerivationResult> {
  const sections = sectionMaterials([args.material], {
    targetChars: SECTION_TARGET_CHARS,
    maxSections: MAX_SECTIONS,
  })

  if (sections.length === 0) {
    return { text: '', items: [], summary: derivationSummary([]) }
  }

  async function prepare(chunk: string, webContext: string | null): Promise<WorkbookItem[]> {
    try {
      const result = await callWithEscalation({
        role: 'aufbereiter',
        payload: {
          materialChunk: chunk,
          materialName: args.material.name,
          webContext,
        },
        parse: parseAufbereiterResult,
        // Eskaliert wird, wenn der Aufbereiter selbst Unsicherheit meldet — genau der Fall, fuer
        // den Kapitel 5.3 das staerkere Modell vorsieht.
        needsEscalation: (parsed) => parsed.items.some((item) => item.needsResearch),
        ...(args.signal ? { signal: args.signal } : {}),
      })
      return result.data.items
    } catch {
      return []
    }
  }

  const collected: WorkbookItem[] = []
  let done = 0

  for (let index = 0; index < sections.length; index += CONCURRENCY) {
    if (args.signal?.aborted) {
      break
    }
    const batch = sections.slice(index, index + CONCURRENCY)
    const results = await Promise.all(batch.map((section) => prepare(section.text, null)))

    for (let offset = 0; offset < batch.length; offset += 1) {
      const items = results[offset] ?? []
      const queries = args.searchWeb ? researchQueriesFor(items) : []

      if (queries.length === 0) {
        collected.push(...items)
        continue
      }

      const findings = await Promise.all(
        queries.slice(0, 4).map((query) => args.searchWeb!(query).catch(() => '')),
      )
      const webContext = findings.filter((entry) => entry.trim()).join('\n\n')
      if (!webContext) {
        collected.push(...items)
        continue
      }

      const second = await prepare(batch[offset].text, webContext)
      // Der zweite Durchgang ersetzt den ersten nur, wenn er etwas geliefert hat.
      collected.push(...(second.length > 0 ? second : items))
    }

    done += batch.length
    args.onProgress?.(Math.min(done, sections.length), sections.length)
  }

  return {
    text: composeDerivedText(collected, args.material.name),
    items: collected,
    summary: derivationSummary(collected),
  }
}
