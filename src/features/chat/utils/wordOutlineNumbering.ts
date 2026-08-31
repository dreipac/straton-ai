import type { WordOutlineV1 } from '../types'

/**
 * Dezimalgliederung wie 1 / 1.1 / 1.1.1 aus `heading.level`-Hierarchie.
 * Nur Blockindizes mit `heading` erhalten Einträge.
 */
export function assignOutlineNumberLabels(blocks: WordOutlineV1['blocks']): Map<number, string> {
  const counters = [0, 0, 0, 0, 0, 0]
  const map = new Map<number, string>()
  blocks.forEach((b, i) => {
    if (b.type !== 'heading') {
      return
    }
    const L = b.level
    counters[L - 1]++
    for (let j = L; j < 6; j++) {
      counters[j] = 0
    }
    map.set(i, counters.slice(0, L).join('.'))
  })
  return map
}
