/**
 * Materialsuche — die beiden Betriebsarten (`RetrievalPurpose`).
 *
 * Hintergrund: Bis diese Unterscheidung existierte, benutzte der Torwaechter des Gehirns (I5)
 * denselben Abruf wie der Chat. Was fuer eine Antwort hilfreich ist — freie Plaetze mit weiteren
 * Dateien auffuellen, den Dateinamen mitgewichten —, ist fuer einen BELEG schaedlich: der
 * Kontrolleur prueft dann gegen Material, das mit der Sache nichts zu tun hat.
 */

import { describe, expect, it } from 'vitest'
import { formatRelevantMaterialContext } from './ragLite'
import type { UploadedMaterial } from '../services/learn.persistence'

function material(name: string, excerpt: string): UploadedMaterial {
  return { id: name, name, size: excerpt.length, excerpt }
}

const VERLOEBNIS = material(
  'Verloebnis.pdf',
  'Verlöbnis. Das Verlöbnis ist das gegenseitige Versprechen zweier Personen, einander zu ' +
    'heiraten. Die Auflösung eines Verlöbnisses begründet keinen Anspruch auf Heirat. ' +
    'Geschenke koennen zurueckgefordert werden, und wer Kosten im Vertrauen auf die Heirat ' +
    'getragen hat, kann unter Umstaenden Ersatz verlangen.',
)

const FREMD = [
  material(
    'Flirt_und_Kompliment.pdf',
    'Vom Flirt zum Kompliment. Setzen Sie sich in Gruppen zusammen und tauschen Sie sich ueber ' +
      'eigene Erfahrungen aus. Wie macht man echte Komplimente, ohne anbiedernd zu wirken?',
  ),
  material(
    'Rollenbilder.pdf',
    'Rollenbilder. Betrachten Sie die Bilder und besprechen Sie zu zweit, was Ihnen auffaellt. ' +
      'Tragen Sie zusammen, was sich an den Rollenbildern von Mann und Frau veraendert hat.',
  ),
  material(
    'Mosuo.pdf',
    'Das Volk der Mosuo lebte schon lange vor den 50er-Jahren ganz andere Rollenbilder. ' +
      'Schauen Sie sich den Filmbeitrag an und machen Sie sich Notizen zu den Stichworten.',
  ),
  material(
    'Gueterrecht.pdf',
    'Gueterrecht. Die drei Gueterstaende sind Errungenschaftsbeteiligung, Guetergemeinschaft ' +
      'und Guetertrennung. Ein Ehevertrag kann sinnvoll sein.',
  ),
]

const QUERY = 'Verlöbnis Auflösung Rechtsfolgen'

function sourcesOf(context: string): string[] {
  return [...context.matchAll(/Quelle \d+ \(([^)]+)\):/g)].map((match) => match[1])
}

describe('Beleg-Betriebsart fuellt nicht mit fremdem Material auf', () => {
  it('liefert bei einer Datei in beiden Betriebsarten dasselbe', () => {
    const nur = [VERLOEBNIS]
    expect(sourcesOf(formatRelevantMaterialContext(QUERY, nur, { purpose: 'grounding' }))).toEqual([
      'Verloebnis.pdf',
    ])
    expect(sourcesOf(formatRelevantMaterialContext(QUERY, nur, { purpose: 'answer' }))).toEqual([
      'Verloebnis.pdf',
    ])
  })

  /*
   * Der gemessene Kern: Beim Beantworten sind die zusaetzlichen Dateien ein Gewinn an Abdeckung,
   * beim Belegen sind sie Material, gegen das faelschlich geprueft wird.
   */
  it('nimmt beim Belegen nur, was zur Sache passt — beim Beantworten weiterhin mehr', () => {
    const bestand = [VERLOEBNIS, ...FREMD]

    const beleg = sourcesOf(formatRelevantMaterialContext(QUERY, bestand, { purpose: 'grounding' }))
    expect(beleg).toContain('Verloebnis.pdf')
    expect(beleg).not.toContain('Flirt_und_Kompliment.pdf')
    expect(beleg).not.toContain('Mosuo.pdf')

    const antwort = sourcesOf(formatRelevantMaterialContext(QUERY, bestand, { purpose: 'answer' }))
    expect(antwort.length).toBeGreaterThan(beleg.length)
  })

  it('behaelt das bisherige Verhalten, wenn keine Betriebsart angegeben ist', () => {
    const bestand = [VERLOEBNIS, ...FREMD]
    expect(sourcesOf(formatRelevantMaterialContext(QUERY, bestand))).toEqual(
      sourcesOf(formatRelevantMaterialContext(QUERY, bestand, { purpose: 'answer' })),
    )
  })

  /*
   * Lieber gar kein Auszug als ein irrefuehrender: `generateTask.ts` behandelt den leeren Auszug
   * ausdruecklich und bricht mit benannter Begruendung ab, statt drei Versuche gegen fremdes
   * Material zu verbrennen.
   */
  it('liefert beim Belegen lieber nichts als Fremdmaterial', () => {
    const context = formatRelevantMaterialContext('Photosynthese Chloroplast', FREMD, {
      purpose: 'grounding',
    })
    expect(context).toBe('')
  })
})

describe('Beleg-Betriebsart gewichtet den Dateinamen nicht', () => {
  /*
   * Gemessen: eine Datei, die bloss passend HEISST, holte sich 5 von 6 Plaetzen. Ein Dateiname
   * ist eine Absichtserklaerung des Nutzers, keine Aussage ueber den Inhalt — als Beleg wertlos.
   */
  const koeder = material(
    'Verloebnis_Aufloesung_Rechtsfolgen.pdf',
    'Vom Flirt zum Kompliment. Setzen Sie sich in Gruppen zusammen und tauschen Sie sich aus. ' +
      'Wie macht man echte Komplimente? Notieren Sie ein Kompliment fuer eine Person aus Ihrer Klasse.',
  )

  it('laesst den Koeder beim Belegen nicht gewinnen', () => {
    const beleg = sourcesOf(
      formatRelevantMaterialContext(QUERY, [VERLOEBNIS, koeder], { purpose: 'grounding' }),
    )
    expect(beleg[0]).toBe('Verloebnis.pdf')
    expect(beleg).not.toContain(koeder.name)
  })

  it('beruecksichtigt den Namen beim Beantworten weiterhin', () => {
    const antwort = sourcesOf(
      formatRelevantMaterialContext(QUERY, [VERLOEBNIS, koeder], { purpose: 'answer' }),
    )
    expect(antwort).toContain(koeder.name)
  })
})
