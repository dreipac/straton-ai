/**
 * Bilderfassung in PDFs — der Abgleich zwischen Textlayer und Texterkennung.
 *
 * Der Rest von `parsePdf` braucht einen Browser (Canvas, Worker) und ist hier nicht pruefbar;
 * diese Funktion ist der Teil, an dem sich entscheidet, ob der Auszug doppelt oder vollstaendig
 * wird, und sie ist rein.
 */

import { describe, expect, it } from 'vitest'
import { ocrLinesBeyondTextLayer } from './documentParser'

const SEITENTEXT =
  'b) Lesen Sie sich den folgenden Text "Das Handbuch für die gute Ehefrau" aus dem Jahr 1955 ' +
  'aufmerksam durch.\nc) Schreiben Sie zu jedem Abschnitt ein Schlüsselwort.'

describe('Was die Texterkennung ueber den Textlayer hinaus beitraegt', () => {
  it('behaelt den Bildinhalt', () => {
    const erkannt =
      'Handbuch für die gute Ehefrau\n' +
      'Halten Sie das Abendessen bereit. Planen Sie vorausschauend, damit die Mahlzeit fertig ist.\n' +
      'Vermeiden Sie jeden Lärm. Wenn er nach Hause kommt, schalten Sie die Spülmaschine aus.'
    const extra = ocrLinesBeyondTextLayer(erkannt, SEITENTEXT)
    expect(extra).toContain('Halten Sie das Abendessen bereit')
    expect(extra).toContain('Vermeiden Sie jeden Lärm')
  })

  /*
   * Der eigentliche Zweck: Die Erkennung liest den vorhandenen Text noch einmal mit. Ohne diesen
   * Abgleich stuende der halbe Auszug doppelt da — und die Materialsuche zaehlt Begriffe, jede
   * Verdopplung verschiebt also die Gewichtung.
   */
  it('wiederholt nicht, was schon im Textlayer steht', () => {
    const erkannt =
      'b) Lesen Sie sich den folgenden Text "Das Handbuch für die gute Ehefrau" aus dem Jahr 1955 aufmerksam durch.\n' +
      'Halten Sie das Abendessen bereit.'
    const extra = ocrLinesBeyondTextLayer(erkannt, SEITENTEXT)
    expect(extra).not.toContain('aufmerksam durch')
    expect(extra).toContain('Halten Sie das Abendessen bereit')
  })

  it('uebersieht dabei keine abweichende Zeichensetzung', () => {
    // Die Erkennung setzt regelmaessig andere Anfuehrungszeichen und Bindestriche.
    const erkannt = 'c) Schreiben Sie zu jedem Abschnitt ein Schlüsselwort'
    expect(ocrLinesBeyondTextLayer(erkannt, SEITENTEXT)).toBe('')
  })

  it('verwirft Erkennungsrauschen', () => {
    const erkannt = '7\n—\n|||\nab\nEine wirklich vorhandene Aussage im Bild.'
    const extra = ocrLinesBeyondTextLayer(erkannt, SEITENTEXT)
    expect(extra).toBe('Eine wirklich vorhandene Aussage im Bild.')
  })

  it('liefert leer, wenn die Erkennung nichts Neues bringt', () => {
    expect(ocrLinesBeyondTextLayer('', SEITENTEXT)).toBe('')
  })
})
