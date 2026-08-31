import { describe, it, expect } from 'vitest'
import { buildTableClipboardHtml, buildTableClipboardPlainText } from './tableClipboard'

describe('buildTableClipboardHtml', () => {
  it('baut eine echte <table> mit Kopf- und Datenzeilen', () => {
    const html = buildTableClipboardHtml([
      ['Netto', 'Brutto'],
      ['100 €', '119 €'],
    ])
    expect(html).toContain('<table')
    expect(html).toContain('<thead>')
    expect(html).toContain('<th')
    expect(html).toContain('Netto')
    expect(html).toContain('<tbody>')
    expect(html).toContain('<td')
    expect(html).toContain('119 €')
  })

  it('leere Zeilen ergeben keine <table>', () => {
    expect(buildTableClipboardHtml([])).toBe('')
    expect(buildTableClipboardHtml([[]])).toBe('')
  })

  it('escaped HTML-Sonderzeichen in Zellen', () => {
    const html = buildTableClipboardHtml([['A & B'], ['<script>']])
    expect(html).toContain('A &amp; B')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('buildTableClipboardPlainText', () => {
  it('trennt Zellen mit Tab, Zeilen mit Zeilenumbruch', () => {
    const text = buildTableClipboardPlainText([
      ['Netto', 'Brutto'],
      ['100 €', '119 €'],
    ])
    expect(text).toBe('Netto\tBrutto\n100 €\t119 €')
  })
})
