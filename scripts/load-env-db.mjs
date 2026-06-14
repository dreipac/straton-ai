import { existsSync, readFileSync } from 'node:fs'

const ENV_DB_FILES = ['.env.db', '.env']

function parseEnvFile(path) {
  const text = readFileSync(path, 'utf8')
  const values = new Map()

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const eq = trimmed.indexOf('=')
    if (eq === -1) {
      continue
    }
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values.set(key, value)
  }

  return values
}

export function loadEnvDb() {
  const merged = new Map()

  for (const path of ENV_DB_FILES) {
    if (!existsSync(path)) {
      continue
    }
    for (const [key, value] of parseEnvFile(path)) {
      merged.set(key, value)
    }
  }

  return merged
}

export function requireEnvKey(config, key) {
  const value = config.get(key)?.trim()
  if (!value) {
    console.error(`Fehlt in .env.db: ${key}`)
    process.exit(1)
  }
  return value
}

export function ensureEnvDbExists() {
  if (!existsSync('.env.db')) {
    console.error('Fehlt: .env.db — kopiere .env.db.example und trage SSH-Ziel ein.')
    process.exit(1)
  }
}
