export type ChatEmptyGreeting = {
  greet: string
  ask: string
}

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

const GREET_BY_TIME: Record<TimeOfDay, readonly string[]> = {
  morning: ['Guten Morgen, {name}!', 'Morgen, {name}!', 'Hi {name}!'],
  afternoon: ['Hey {name}!', 'Hallo {name}!', 'Hi {name}!'],
  evening: ['Guten Abend, {name}!', 'Hey {name}!', 'Abend, {name}!'],
  night: ['Hey {name}!', 'Hallo {name}!', 'Noch wach, {name}?'],
}

const ASK_LINES: readonly string[] = [
  'Womit kann ich helfen?',
  'Was steht an?',
  'Woran arbeitest du?',
  'Was kann ich für dich tun?',
  'Womit starten wir?',
  'Was brauchst du?',
]

function hashSeed(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function pickFrom<T>(items: readonly T[], seed: string): T {
  return items[hashSeed(seed) % items.length]!
}

function getTimeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) {
    return 'morning'
  }
  if (hour >= 12 && hour < 17) {
    return 'afternoon'
  }
  if (hour >= 17 && hour < 22) {
    return 'evening'
  }
  return 'night'
}

function formatGreetingName(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    return 'du'
  }
  const first = trimmed.split(/\s+/)[0] ?? trimmed
  if (!first) {
    return 'du'
  }
  return first.charAt(0).toUpperCase() + first.slice(1)
}

/** Kurze, persönliche Leer-Chat-Begrüßung — pro Tag stabil, tageszeitabhängig. */
export function getChatEmptyGreeting(firstName: string, now: Date = new Date()): ChatEmptyGreeting {
  const name = formatGreetingName(firstName)
  const dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  const timeOfDay = getTimeOfDay(now)
  const greetTpl = pickFrom(GREET_BY_TIME[timeOfDay], `${dayKey}:greet:${name}:${timeOfDay}`)
  const ask = pickFrom(ASK_LINES, `${dayKey}:ask:${name}`)

  return {
    greet: greetTpl.replaceAll('{name}', name),
    ask,
  }
}
