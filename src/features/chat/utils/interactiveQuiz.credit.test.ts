import { describe, it, expect } from 'vitest'
import { computeStructuredCredit, type InteractiveQuizQuestion } from './interactiveQuiz'

function matchQuestion(n: number): InteractiveQuizQuestion {
  return {
    id: 'm',
    prompt: 'Ordne zu',
    questionType: 'match',
    matchLeft: Array.from({ length: n }, (_, i) => `L${i}`),
    matchRight: Array.from({ length: n }, (_, i) => `R${i}`),
    expectedAnswer: '',
    acceptableAnswers: [],
    evaluation: 'exact',
  }
}

function categorizeQuestion(expected: string, itemCount: number, categoryCount: number): InteractiveQuizQuestion {
  return {
    id: 'c',
    prompt: 'Sortiere ein',
    questionType: 'categorize',
    categories: Array.from({ length: categoryCount }, (_, i) => `K${i}`),
    items: Array.from({ length: itemCount }, (_, i) => `B${i}`),
    expectedAnswer: expected,
    acceptableAnswers: [],
    evaluation: 'exact',
  }
}

describe('computeStructuredCredit — match', () => {
  it('voll korrekt → 1', () => {
    expect(computeStructuredCredit('0,1,2', matchQuestion(3))).toBe(1)
  })
  it('teilweise korrekt → Anteil', () => {
    // index0=0 ✓, index1=2 ✗, index2=1 ✗ → 1/3
    expect(computeStructuredCredit('0,2,1', matchQuestion(3))).toBeCloseTo(1 / 3, 10)
  })
  it('unvollstaendig/ungueltig → null (bleibt binaer)', () => {
    expect(computeStructuredCredit('0,1', matchQuestion(3))).toBeNull()
    expect(computeStructuredCredit('0,1,9', matchQuestion(3))).toBeNull()
  })
})

describe('computeStructuredCredit — categorize', () => {
  it('teilweise korrekt → Anteil', () => {
    // erwartet 0,1,0 ; Antwort 0,1,1 → 2/3
    expect(computeStructuredCredit('0,1,1', categorizeQuestion('0,1,0', 3, 2))).toBeCloseTo(2 / 3, 10)
  })
  it('voll korrekt → 1', () => {
    expect(computeStructuredCredit('0,1,0', categorizeQuestion('0,1,0', 3, 2))).toBe(1)
  })
})

describe('computeStructuredCredit — sonstige Typen', () => {
  it('text/mcq → null', () => {
    const text: InteractiveQuizQuestion = {
      id: 't',
      prompt: 'Frage',
      questionType: 'text',
      expectedAnswer: 'x',
      acceptableAnswers: [],
      evaluation: 'exact',
    }
    expect(computeStructuredCredit('irgendwas', text)).toBeNull()
  })
})
