import { describe, it, expect } from 'vitest'
import { buildAssistantRichContentClipboardHtml } from './assistantRichContentHtml'

describe('buildAssistantRichContentClipboardHtml', () => {
  it('baut aus einer GFM-Pipe-Tabelle eine echte <table> statt sichtbarer | Zeichen', () => {
    const html = buildAssistantRichContentClipboardHtml(
      '| Netto | Brutto |\n| --- | --- |\n| 100 € | 119 € |\n| 200 € | 238 € |',
    )
    expect(html).toContain('<table')
    expect(html).toContain('<th')
    expect(html).toContain('Netto')
    expect(html).toContain('Brutto')
    expect(html).toContain('<td')
    expect(html).toContain('119 €')
    expect(html).not.toContain('|')
  })

  it('reiner Fliesstext wird zu einem einzelnen <p>', () => {
    const html = buildAssistantRichContentClipboardHtml('Hallo Welt.')
    expect(html).toBe('<p>Hallo Welt.</p>')
  })

  it('Aufzählungen werden zu <ul><li>', () => {
    const html = buildAssistantRichContentClipboardHtml('- Punkt A\n- Punkt B')
    expect(html).toBe('<ul><li>Punkt A</li><li>Punkt B</li></ul>')
  })

  it('escaped HTML-Sonderzeichen in Zellen/Text', () => {
    const html = buildAssistantRichContentClipboardHtml('A < B & C > D')
    expect(html).toContain('A &lt; B &amp; C &gt; D')
  })
})
