import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Rough import: extract DEFAULT interactive_quiz from ts file
const defaults = readFileSync(join(root, 'src/config/systemPromptDefaults.ts'), 'utf8')
const quizMatch = defaults.match(/interactive_quiz:\s*\[([\s\S]*?)\]\s*\.join\('\\n'\)/)
let quizText = ''
if (quizMatch) {
  quizText = quizMatch[1]
    .split('\n')
    .map((line) => {
      const m = line.trim().match(/^'(.+)',\s*$/) || line.trim().match(/^'(.+)'\s*$/)
      return m ? m[1] : ''
    })
    .filter(Boolean)
    .join('\n')
}

const style = readFileSync(join(root, 'src/features/chat/constants/chatAssistantStyle.ts'), 'utf8')
const extractFn = (name) => {
  const re = new RegExp(`export function ${name}[\\s\\S]*?return \\[([\\s\\S]*?)\\]\\.join\\('\\\\n'\\)`)
  const m = style.match(re)
  if (!m) return ''
  return m[1]
    .split('\n')
    .map((line) => {
      const t = line.trim()
      if (t.startsWith("'") && t.endsWith("',")) return t.slice(1, -2)
      if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1)
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

const blocks = [
  quizText,
  extractFn('getAssistantMainChatThreadContinuityInstruction'),
  extractFn('getAssistantMarkdownFormattingInstruction').slice(0, 500) + '...',
  'safety+swiss (approx 400 chars)',
]

const totalChars = quizText.length + 4000 // rough for other blocks
console.log('interactive_quiz chars:', quizText.length, 'est tokens:', Math.ceil(quizText.length / 4))
console.log('rough total stable system est tokens:', Math.ceil(totalChars / 4))
