import type { ChatMessage } from '../../types'

export type ChatLearnProficiency = 'low' | 'medium' | 'high'

export type ChatLearnDraftStep = 'proficiency' | 'name'

export type ChatLearnDraftContext = {
  fileNames: string[]
  imageCount: number
  topTerms: string[]
  focusText: string
  excerpt: string
}

export function summarizeChatForLearningPath(messages: ChatMessage[]): ChatLearnDraftContext {
  const fileNamesSet = new Set<string>()
  let imageCount = 0
  const contentParts: string[] = []
  const dateiRe = /\[Datei:\s*([^\]]+)\]/g
  const bildRe = /\[Bild:[^\]]*\][\s\S]*?\[\/Bild\]/g
  const bildDataRe = /\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/g
  for (const msg of messages) {
    const raw = typeof msg.content === 'string' ? msg.content : ''
    if (!raw.trim()) {
      continue
    }
    let m: RegExpExecArray | null
    while ((m = dateiRe.exec(raw)) !== null) {
      const name = String(m[1] ?? '').trim()
      if (name) {
        fileNamesSet.add(name)
      }
    }
    const stripped = raw
      .replace(bildDataRe, () => {
        imageCount += 1
        return ' '
      })
      .replace(bildRe, () => {
        imageCount += 1
        return ' '
      })
      .replace(/\[Datei:[^\]]*\][\s\S]*?\[\/Datei\]/g, ' ')
      .replace(/\[\[STRATON_[A-Z_]+\]\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!stripped) {
      continue
    }
    const prefix = msg.role === 'user' ? 'Nutzer' : 'KI'
    contentParts.push(`${prefix}: ${stripped}`)
  }
  const fileNames = [...fileNamesSet]
  const latestUser = [...messages].reverse().find((m) => m.role === 'user')
  const latestUserText = (latestUser?.content ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\[Datei:[^\]]*\][\s\S]*?\[\/Datei\]/g, '')
    .replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/g, '')
    .replace(/\[Bild:[^\]]*\][\s\S]*?\[\/Bild\]/g, '')
    .trim()
    .slice(0, 180)
  const corpus = contentParts.join(' ').toLowerCase()
  const stopwords = new Set([
    'der',
    'die',
    'das',
    'und',
    'oder',
    'ein',
    'eine',
    'einer',
    'eines',
    'mit',
    'für',
    'von',
    'ist',
    'sind',
    'auf',
    'im',
    'in',
    'zu',
    'den',
    'dem',
    'des',
    'als',
    'auch',
    'wie',
    'dass',
    'wenn',
    'dann',
    'noch',
    'mehr',
    'wird',
    'werden',
    'kann',
    'können',
    'bitte',
    'nutzer',
    'ki',
  ])
  const words = corpus.match(/[a-zA-ZäöüÄÖÜß0-9-]{4,}/g) ?? []
  const freq = new Map<string, number>()
  for (const w of words) {
    if (stopwords.has(w)) {
      continue
    }
    freq.set(w, (freq.get(w) ?? 0) + 1)
  }
  const topTerms = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([term]) => term)
  const focusText = latestUserText || 'Kein klarer Fokus aus letzter Nachricht erkennbar.'
  const excerpt = contentParts.slice(-6).join('\n').slice(0, 1200)
  return { fileNames, imageCount, topTerms, focusText, excerpt }
}
