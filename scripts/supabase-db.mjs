import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

function loadEnvDb() {
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

function requireKey(config, key) {
  const value = config.get(key)?.trim()
  if (!value) {
    console.error(`Fehlt in .env.db: ${key}`)
    process.exit(1)
  }
  if (value.includes('DEIN_DB_PASS') || value.includes('your-db-password')) {
    console.error(`${key} in .env.db enthält noch den Platzhalter — echtes Postgres-Passwort eintragen.`)
    process.exit(1)
  }
  return value
}

function shellEscapeSingleQuotes(value) {
  return value.replace(/'/g, `'\\''`)
}

function printSuccessDbPush() {
  console.log('\n\x1b[32mDatenbank erfolgreich gepusht\x1b[0m')
}

function printDatabaseUpToDate() {
  console.log('\n\x1b[32mDatenbank bereits aktuell\x1b[0m')
}

class SshSession {
  /** @param {string} sshTarget */
  constructor(sshTarget) {
    this.sshTarget = sshTarget
    this.controlPath = join(tmpdir(), `straton-ssh-${process.pid}-${Date.now()}`)
    this.open = false
  }

  get sshBaseArgs() {
    return [
      '-o',
      `ControlPath=${this.controlPath}`,
      '-o',
      'ControlMaster=auto',
      '-o',
      'ControlPersist=300',
    ]
  }

  get rsyncShell() {
    return `ssh -o ControlPath=${this.controlPath} -o ControlMaster=no`
  }

  connect() {
    console.log('\n→ SSH-Verbindung öffnen (Passwort nur einmal nötig)')
    const result = spawnSync(
      'ssh',
      [
        ...this.sshBaseArgs,
        '-o',
        'ControlMaster=yes',
        '-f',
        '-N',
        this.sshTarget,
      ],
      { stdio: 'inherit' },
    )

    if (result.error) {
      console.error(`\nFehler: ssh konnte nicht gestartet werden (${result.error.message})`)
      process.exit(1)
    }

    if (result.status !== 0) {
      console.error('\nSSH-Verbindung fehlgeschlagen.')
      process.exit(result.status ?? 1)
    }

    this.open = true
  }

  close() {
    if (!this.open) {
      return
    }
    spawnSync(
      'ssh',
      [...this.sshBaseArgs, '-O', 'exit', this.sshTarget],
      { stdio: 'ignore' },
    )
    this.open = false
  }

  /** @param {string} label @param {string} command @param {string[]} args */
  run(label, command, args) {
    console.log(`\n→ ${label}`)
    console.log(`  ${command} ${args.join(' ')}`)

    const result = spawnSync(command, args, { stdio: 'inherit' })

    if (result.error) {
      console.error(`\nFehler: ${command} konnte nicht gestartet werden (${result.error.message})`)
      this.close()
      process.exit(1)
    }

    if (result.status !== 0) {
      console.error(`\n${label} fehlgeschlagen (Exit ${result.status ?? 'unknown'})`)
      this.close()
      process.exit(result.status ?? 1)
    }
  }

  /** @param {string} label @param {string} remoteCmd */
  runCapture(label, remoteCmd) {
    console.log(`\n→ ${label}`)
    const result = spawnSync(
      'ssh',
      [...this.sshBaseArgs, this.sshTarget, remoteCmd],
      { encoding: 'utf8' },
    )

    if (result.error) {
      console.error(`\nFehler: ssh konnte nicht gestartet werden (${result.error.message})`)
      this.close()
      process.exit(1)
    }

    return result
  }

  /** @param {string} remoteCmd */
  runRemote(label, remoteCmd) {
    this.run(label, 'ssh', [...this.sshBaseArgs, this.sshTarget, remoteCmd])
  }

  ensureRemoteDir(remoteDir) {
    this.runRemote(
      'Remote-Verzeichnis anlegen',
      `mkdir -p '${shellEscapeSingleQuotes(remoteDir)}/supabase/migrations'`,
    )
  }

  syncSupabaseFiles(remoteDir) {
    this.ensureRemoteDir(remoteDir)
    this.run(
      'Migrationen hochladen',
      'rsync',
      [
        '-avz',
        '--delete',
        '-e',
        this.rsyncShell,
        'supabase/migrations/',
        `${this.sshTarget}:${remoteDir}/supabase/migrations/`,
      ],
    )
    this.run(
      'config.toml hochladen',
      'rsync',
      [
        '-avz',
        '-e',
        this.rsyncShell,
        'supabase/config.toml',
        `${this.sshTarget}:${remoteDir}/supabase/config.toml`,
      ],
    )
  }
}

function buildRemoteSupabaseCmd(remoteDir, supabaseArgs, { autoYes = false } = {}) {
  const cli = autoYes ? 'npx supabase --yes' : 'npx supabase'
  return [
    `mkdir -p '${shellEscapeSingleQuotes(remoteDir)}/supabase'`,
    `cd '${shellEscapeSingleQuotes(remoteDir)}'`,
    `${cli} ${supabaseArgs.map((part) => `'${shellEscapeSingleQuotes(part)}'`).join(' ')}`,
  ].join(' && ')
}

function listLocalMigrationVersions(except = new Set()) {
  if (!existsSync('supabase/migrations')) {
    return []
  }

  return readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('.sql'))
    .map((name) => name.split('_')[0])
    .filter((version) => version && !except.has(version))
    .sort()
}

/** @param {string[]} args */
function parseExceptFlags(args) {
  const except = new Set()
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--except' && args[i + 1]) {
      except.add(args[i + 1])
      i++
    }
  }
  return except
}

function printRepairSuccess(count) {
  console.log(`\n\x1b[32m${count} Migrationen als «applied» markiert\x1b[0m`)
  console.log('Danach: npm run db:push:server')
}

/** @param {string} output */
function hasPendingMigrations(output) {
  const text = `${output ?? ''}`

  if (/remote database is up to date/i.test(text)) {
    return false
  }

  for (const line of text.split('\n')) {
    if (!line.includes('|')) {
      continue
    }
    if (/local|remote|---/i.test(line)) {
      continue
    }

    const parts = line.split('|').map((part) => part.trim())
    if (parts.length < 2) {
      continue
    }

    const local = parts[0]
    const remote = parts[1]
    if (local && !remote) {
      return true
    }
  }

  if (/applying migration|do you want to push|found local migration/i.test(text)) {
    return true
  }

  return false
}

/** @param {SshSession} session */
function checkRemoteDatabaseUpToDate(session, remoteDir, dbUrl) {
  const listCmd = buildRemoteSupabaseCmd(remoteDir, [
    'migration',
    'list',
    '--db-url',
    dbUrl,
  ])
  const listResult = session.runCapture('Migrations-Status prüfen', listCmd)

  if (listResult.status !== 0) {
    console.error('\nStatus prüfen fehlgeschlagen — versuche trotzdem db push.')
    return false
  }

  return !hasPendingMigrations(listResult.stdout ?? '')
}

function runSupabase(args) {
  runCommand('Supabase CLI', 'npx', ['supabase', ...args])
  const isPush = args[0] === 'db' && args[1] === 'push' && !args.includes('--dry-run')
  if (isPush) {
    printSuccessDbPush()
  } else {
    console.log('\nFertig.')
  }
  process.exit(0)
}

function runCommand(label, command, args) {
  console.log(`\n→ ${label}`)
  console.log(`  ${command} ${args.join(' ')}`)

  const result = spawnSync(command, args, { stdio: 'inherit' })

  if (result.error) {
    console.error(`\nFehler: ${command} konnte nicht gestartet werden (${result.error.message})`)
    process.exit(1)
  }

  if (result.status !== 0) {
    console.error(`\n${label} fehlgeschlagen (Exit ${result.status ?? 'unknown'})`)
    process.exit(result.status ?? 1)
  }
}

function withSshSession(sshTarget, fn) {
  const session = new SshSession(sshTarget)
  try {
    session.connect()
    fn(session)
  } finally {
    session.close()
  }
}

function runRemote(subcommand, config, extraArgs) {
  const dbUrl = requireKey(config, 'SUPABASE_DB_URL')
  const sshTarget = requireKey(config, 'DB_SSH_TARGET')
  const remoteDir = config.get('DB_SSH_REMOTE_DIR')?.trim() || '/tmp/straton-supabase-push'
  const dryRun = subcommand === 'push:remote:dry-run'

  console.log(`Self-Hosted DB push via SSH → ${sshTarget}`)
  console.log(`Remote-Verzeichnis: ${remoteDir}`)
  if (dryRun) {
    console.log('Modus: DRY RUN (keine Änderungen an der DB)')
  }

  withSshSession(sshTarget, (session) => {
    session.syncSupabaseFiles(remoteDir)

    if (!dryRun && checkRemoteDatabaseUpToDate(session, remoteDir, dbUrl)) {
      printDatabaseUpToDate()
      return
    }

    if (!dryRun) {
      console.log(
        '\nHinweis: Fehler «relation already exists»? Einmalig: npm run db:repair:server -- --except <neue-migration>',
      )
    }

    const pushArgs = ['db', 'push', '--db-url', dbUrl]
    if (dryRun) {
      pushArgs.push('--dry-run')
    }
    if (extraArgs.length > 0) {
      pushArgs.push(...extraArgs)
    }

    session.runRemote(
      'db push auf dem Server',
      buildRemoteSupabaseCmd(remoteDir, pushArgs, { autoYes: !dryRun }),
    )

    if (dryRun) {
      console.log('\nDry run abgeschlossen.')
    } else {
      printSuccessDbPush()
    }
  })
}

function runRemoteRepair(config, extraArgs) {
  const dbUrl = requireKey(config, 'SUPABASE_DB_URL')
  const sshTarget = requireKey(config, 'DB_SSH_TARGET')
  const remoteDir = config.get('DB_SSH_REMOTE_DIR')?.trim() || '/tmp/straton-supabase-push'
  const except = parseExceptFlags(extraArgs)
  const versions = listLocalMigrationVersions(except)

  if (versions.length === 0) {
    console.error('Keine Migrationen zum Reparieren gefunden.')
    process.exit(1)
  }

  console.log(`Migration-Historie reparieren via SSH → ${sshTarget}`)
  console.log(`Markiere ${versions.length} Migration(en) als «applied» (SQL wird nicht erneut ausgeführt).`)
  if (except.size > 0) {
    console.log(`Ausgenommen: ${[...except].join(', ')}`)
  }

  withSshSession(sshTarget, (session) => {
    session.syncSupabaseFiles(remoteDir)

    const versionArgs = versions.map((version) => `'${shellEscapeSingleQuotes(version)}'`).join(' ')
    const remoteCmd = [
      `cd '${shellEscapeSingleQuotes(remoteDir)}'`,
      `for v in ${versionArgs}; do npx supabase migration repair --status applied "$v" --db-url '${shellEscapeSingleQuotes(dbUrl)}' || exit 1; done`,
    ].join(' && ')

    session.runRemote('Migration-Historie synchronisieren', remoteCmd)
    printRepairSuccess(versions.length)
  })
}

function runRemoteStatus(config) {
  const dbUrl = requireKey(config, 'SUPABASE_DB_URL')
  const sshTarget = requireKey(config, 'DB_SSH_TARGET')
  const remoteDir = config.get('DB_SSH_REMOTE_DIR')?.trim() || '/tmp/straton-supabase-push'

  console.log(`Migration-Status via SSH → ${sshTarget}`)

  withSshSession(sshTarget, (session) => {
    session.syncSupabaseFiles(remoteDir)
    session.runRemote(
      'migration list auf dem Server',
      buildRemoteSupabaseCmd(remoteDir, ['migration', 'list', '--db-url', dbUrl]),
    )
  })
}

const subcommand = process.argv[2]
const extraArgs = process.argv.slice(3)
const config = loadEnvDb()

if (!existsSync('.env.db')) {
  console.error('Fehlt: .env.db — kopiere .env.db.example und trage Passwort + SSH-Ziel ein.')
  process.exit(1)
}

if (subcommand === 'push:remote' || subcommand === 'push:remote:dry-run') {
  runRemote(subcommand, config, extraArgs)
}

if (subcommand === 'repair:remote') {
  runRemoteRepair(config, extraArgs)
}

if (subcommand === 'status:remote') {
  runRemoteStatus(config)
}

const dbUrl = requireKey(config, 'SUPABASE_DB_URL')

const argsBySubcommand = {
  push: ['db', 'push', '--db-url', dbUrl, ...extraArgs],
  'push:dry-run': ['db', 'push', '--db-url', dbUrl, '--dry-run', ...extraArgs],
  status: ['migration', 'list', '--db-url', dbUrl, ...extraArgs],
}

const args = argsBySubcommand[subcommand]
if (!args) {
  console.error(`Unbekannter Befehl: ${subcommand}`)
  console.error('Lokal (mit Tunnel): push | push:dry-run | status')
  console.error('Auf Server per SSH:   push:remote | push:remote:dry-run | status:remote | repair:remote')
  process.exit(1)
}

runSupabase(args)
