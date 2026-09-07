import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { CHAT_COMPOSER_MODELS, CHAT_COMPOSER_VISION_MODEL_IDS } from './chatComposerModels'

/**
 * Die Edge Function kann aus `src/` nicht importieren und hält deshalb eine eigene Kopie der
 * Vision-Whitelist. Läuft die auseinander, kippt ein Chat mit Bild wieder still auf gpt-4o (Client
 * schickt die Kette des gewählten Modells, Edge überschreibt sie trotzdem) — genau der Fehler, den
 * die Whitelist verhindern soll. Deshalb hier ein Abgleich statt blossem Vertrauen auf den Kommentar.
 */
const EDGE_INDEX_PATH = fileURLToPath(
  new URL('../../../../supabase/functions/chat-completion/index.ts', import.meta.url),
)

function readEdgeVisionModelIds(): string[] {
  const source = readFileSync(EDGE_INDEX_PATH, 'utf8')
  const block = source.match(
    /const CHAT_COMPOSER_VISION_MODEL_IDS: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\)/,
  )
  if (!block?.[1]) {
    throw new Error('CHAT_COMPOSER_VISION_MODEL_IDS in der Edge Function nicht gefunden')
  }
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]!)
}

describe('Vision-Whitelist der Composer-Modelle', () => {
  it('kennt für jedes Composer-Modell eine explizite Entscheidung', () => {
    for (const model of CHAT_COMPOSER_MODELS) {
      expect(typeof model.supportsVision, `${model.id} ohne supportsVision`).toBe('boolean')
    }
  })

  it('hält Client- und Edge-Liste deckungsgleich', () => {
    expect([...readEdgeVisionModelIds()].sort()).toEqual([...CHAT_COMPOSER_VISION_MODEL_IDS].sort())
  })
})
