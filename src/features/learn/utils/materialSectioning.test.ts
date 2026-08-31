import { describe, it, expect } from 'vitest'
import { sectionMaterials } from './materialSectioning'

function makeText(chars: number, marker: string): string {
  // Absätze aus Sätzen, damit Bruchstellen existieren.
  const sentence = `${marker} satz mit etwas inhalt. `
  let out = ''
  while (out.length < chars) {
    out += sentence
    if (out.length % 400 < sentence.length) {
      out += '\n\n'
    }
  }
  return out.slice(0, chars)
}

describe('sectionMaterials', () => {
  it('leere Eingabe → leer', () => {
    expect(sectionMaterials([])).toEqual([])
    expect(sectionMaterials([{ name: 'a', excerpt: '   ' }])).toEqual([])
  })

  it('kurzes Material → ein Abschnitt ohne Teil-Label', () => {
    const secs = sectionMaterials([{ name: 'kurz.txt', excerpt: 'nur ein kurzer text' }])
    expect(secs).toHaveLength(1)
    expect(secs[0].label).toBe('kurz.txt')
    expect(secs[0].text).toBe('nur ein kurzer text')
  })

  it('deckt langen Text vollständig ab (keine Lücken)', () => {
    const excerpt = makeText(30000, 'alpha')
    const secs = sectionMaterials([{ name: 'lang.pdf', excerpt }], { targetChars: 5000, maxSections: 16 })
    expect(secs.length).toBeGreaterThan(1)
    // Jeder Abschnitt trägt Quelle + Teil-Label.
    expect(secs.every((s) => s.materialName === 'lang.pdf')).toBe(true)
    expect(secs[0].label).toMatch(/Teil 1\//)
    // Voll-Abdeckung: die Vereinigung enthält alle nicht-Whitespace-Zeichen des Originals.
    const joinedCompact = secs.map((s) => s.text).join('').replace(/\s+/g, '')
    const originalCompact = excerpt.replace(/\s+/g, '')
    for (let i = 0; i < originalCompact.length; i += 997) {
      expect(joinedCompact).toContain(originalCompact.slice(i, i + 40))
    }
  })

  it('hält die maxSections-Grenze ein, indem Abschnitte wachsen', () => {
    const excerpt = makeText(80000, 'beta')
    const secs = sectionMaterials([{ name: 'riesig.pdf', excerpt }], { targetChars: 3000, maxSections: 10 })
    expect(secs.length).toBeLessThanOrEqual(10)
    // trotzdem Voll-Abdeckung
    const compact = secs.map((s) => s.text).join('').replace(/\s+/g, '')
    expect(compact.length).toBeGreaterThanOrEqual(excerpt.replace(/\s+/g, '').length - 5)
  })

  it('verteilt Abschnitte über mehrere Materialien', () => {
    const secs = sectionMaterials(
      [
        { name: 'a.pdf', excerpt: makeText(12000, 'aaa') },
        { name: 'b.docx', excerpt: makeText(12000, 'bbb') },
      ],
      { targetChars: 5000, maxSections: 16 },
    )
    expect(secs.some((s) => s.materialName === 'a.pdf')).toBe(true)
    expect(secs.some((s) => s.materialName === 'b.docx')).toBe(true)
  })
})
