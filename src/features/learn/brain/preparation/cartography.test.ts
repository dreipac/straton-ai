/**
 * Der Kartograf als Konzeptquelle — die Uebersetzung in die Ingestion-Form.
 *
 * Die Rolle war bis hierher tot; die Konzeptbildung lief ueber den allgemeinen Chatweg und umging
 * damit die Vermittlungsschicht aus Kapitel 12. Geprueft wird hier die Bruecke, nicht der Aufruf.
 */

import { describe, expect, it } from 'vitest'
import { toIngestedGraph } from './cartography'
import { materialsAwaitingPreparation } from '../hooks/useMaterialPreparation'
import type { CartographerResult } from '../agents/contracts'
import type { UploadedMaterial } from '../../services/learn.persistence'

function result(overrides: Partial<CartographerResult> = {}): CartographerResult {
  return {
    concepts: [
      {
        slug: 'verloebnis',
        name: 'Verlöbnis',
        description: 'Gegenseitiges Heiratsversprechen.',
        difficulty: 2,
        origin: 'material',
        sourceQuote: 'Das Verlöbnis ist das gegenseitige Versprechen',
        section: 'Kapitel 9.2',
      },
    ],
    edges: [],
    rejected: [],
    ...overrides,
  }
}

describe('Kartografenergebnis in die Ingestion-Form bringen', () => {
  it('uebernimmt Konzept samt Herkunft und Beleg (I4)', () => {
    const graph = toIngestedGraph(result())
    expect(graph.concepts[0]).toMatchObject({
      slug: 'verloebnis',
      origin: 'material',
      sourceQuote: 'Das Verlöbnis ist das gegenseitige Versprechen',
      sourceRef: { section: 'Kapitel 9.2' },
    })
  })

  it('uebersetzt eine Ergaenzung als solche', () => {
    const graph = toIngestedGraph(
      result({
        concepts: [
          {
            slug: 'x',
            name: 'X',
            description: '',
            difficulty: 3,
            origin: 'aiSupplement',
            sourceQuote: '',
            section: '',
          },
        ],
      }),
    )
    expect(graph.concepts[0].origin).toBe('ai_supplement')
    expect(graph.concepts[0].sourceRef).toEqual({})
  })

  /*
   * Der Kartografenauftrag fragt nach gerichteten VORAUSSETZUNGEN. Einen anderen Kantentyp hier
   * zu erfinden hiesse, eine Beziehung zu behaupten, die niemand geprueft hat.
   */
  it('fuehrt jede Kante als Voraussetzung', () => {
    const graph = toIngestedGraph(result({ edges: [{ from: 'a', to: 'b' }] }))
    expect(graph.edges).toEqual([{ fromSlug: 'a', toSlug: 'b', type: 'prerequisite' }])
  })
})

describe('Welche Materialien noch aufbereitet werden muessen', () => {
  function material(overrides: Partial<UploadedMaterial> = {}): UploadedMaterial {
    return { id: 'm1', name: 'Dossier.pdf', size: 10, excerpt: 'Inhalt', origin: 'upload', ...overrides }
  }

  it('nimmt ein frisch hochgeladenes Material', () => {
    expect(materialsAwaitingPreparation([material()]).map((m) => m.id)).toEqual(['m1'])
  })

  /*
   * Ohne diese Sperre liefe die Aufbereitung bei jedem Oeffnen des Pfads erneut — teuer, langsam,
   * und das Ergebnis waere jedes Mal ein anderer Text.
   */
  it('laesst ein bereits aufbereitetes Material in Ruhe', () => {
    const list = [
      material(),
      material({ id: 'derived-m1', origin: 'derived', derivedFrom: 'm1', name: 'Dossier.pdf — ergaenzt' }),
    ]
    expect(materialsAwaitingPreparation(list)).toEqual([])
  })

  it('bereitet abgeleitete Materialien nie selbst auf', () => {
    const list = [material({ id: 'd', origin: 'derived', derivedFrom: 'weg' })]
    expect(materialsAwaitingPreparation(list)).toEqual([])
  })

  it('uebergeht Material ohne Text', () => {
    expect(materialsAwaitingPreparation([material({ excerpt: '   ' })])).toEqual([])
  })

  it('behandelt Material ohne Herkunftsangabe wie einen Upload', () => {
    const legacy = { id: 'alt', name: 'Alt.pdf', size: 5, excerpt: 'Text' } as UploadedMaterial
    expect(materialsAwaitingPreparation([legacy]).map((m) => m.id)).toEqual(['alt'])
  })
})
