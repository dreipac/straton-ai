import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ensureEnvDbExists, loadEnvDb, requireEnvKey } from './load-env-db.mjs'
import { withSshSession } from './ssh-session.mjs'

const DEFAULT_FUNCTIONS_DIR = '~/supabase/docker/volumes/functions'
const DEFAULT_DOCKER_DIR = '~/supabase/docker'

/** ~ expandiert per $HOME — in SSH-Single-Quotes würde ~ literal bleiben. */
function remoteShellPath(dir) {
  const expanded = dir.startsWith('~/') ? `$HOME/${dir.slice(2)}` : dir
  return `"${expanded.replace(/"/g, '\\"')}"`
}

function listLocalFunctions() {
  const root = 'supabase/functions'
  if (!existsSync(root)) {
    return []
  }

  return readdirSync(root)
    .filter((name) => {
      if (name.startsWith('.')) {
        return false
      }
      const indexPath = join(root, name, 'index.ts')
      return existsSync(indexPath)
    })
    .sort()
}

function printSuccess(deployed) {
  if (deployed.length === 1) {
    console.log(`\n\x1b[32mEdge Function «${deployed[0]}» erfolgreich deployed\x1b[0m`)
    return
  }
  console.log(`\n\x1b[32m${deployed.length} Edge Functions erfolgreich deployed\x1b[0m`)
  console.log(deployed.map((name) => `  • ${name}`).join('\n'))
}

function printHelp(available) {
  console.log('Usage:')
  console.log('  npm run functions:deploy:server                 # alle Functions')
  console.log('  npm run functions:deploy:server -- chat-completion')
  console.log('  npm run functions:deploy:server -- chat-completion tavily-search')
  console.log('  npm run functions:deploy:server -- --list')
  console.log('')
  console.log('Verfügbare Functions:')
  for (const name of available) {
    console.log(`  • ${name}`)
  }
}

function resolveTargets(args, available) {
  if (args.includes('--list') || args.includes('-h') || args.includes('--help')) {
    printHelp(available)
    process.exit(0)
  }

  if (args.includes('--all') || args.length === 0) {
    return available
  }

  const unknown = args.filter((name) => !available.includes(name))
  if (unknown.length > 0) {
    console.error(`Unbekannte Function(s): ${unknown.join(', ')}`)
    console.error('')
    printHelp(available)
    process.exit(1)
  }

  return args
}

function deployMainRouter(session, remoteFunctionsDir) {
  session.run(
    'Main-Router (main/) hochladen',
    'rsync',
    [
      '-avz',
      '-e',
      session.rsyncShell,
      'supabase/self-hosted/main/',
      `${session.sshTarget}:${remoteFunctionsDir}/main/`,
    ],
  )
}

function deployFunctions(session, targets, remoteFunctionsDir) {
  for (const name of targets) {
    session.run(
      `Function «${name}» hochladen`,
      'rsync',
      [
        '-avz',
        '--delete',
        '-e',
        session.rsyncShell,
        `supabase/functions/${name}/`,
        `${session.sshTarget}:${remoteFunctionsDir}/${name}/`,
      ],
    )
  }
}

function restartFunctionsService(session, dockerDir) {
  session.runRemote(
    'Edge Runtime neu starten',
    `cd ${remoteShellPath(dockerDir)} && docker compose restart functions --no-deps`,
  )
}

function main() {
  ensureEnvDbExists()

  const config = loadEnvDb()
  const sshTarget = requireEnvKey(config, 'DB_SSH_TARGET')
  const remoteFunctionsDir = config.get('DB_SSH_FUNCTIONS_DIR')?.trim() || DEFAULT_FUNCTIONS_DIR
  const dockerDir = config.get('DB_SSH_DOCKER_DIR')?.trim() || DEFAULT_DOCKER_DIR
  const available = listLocalFunctions()

  if (available.length === 0) {
    console.error('Keine Edge Functions in supabase/functions/ gefunden.')
    process.exit(1)
  }

  const targets = resolveTargets(process.argv.slice(2), available)

  console.log(`Edge Functions deploy via SSH → ${sshTarget}`)
  console.log(`Ziel: ${remoteFunctionsDir}`)
  console.log(`Docker: ${dockerDir}`)
  console.log(`Deploy: ${targets.join(', ')}`)

  withSshSession(sshTarget, (session) => {
    session.runRemote(
      'Remote-Functions-Verzeichnis anlegen',
      `mkdir -p ${remoteShellPath(remoteFunctionsDir)}`,
    )
    deployMainRouter(session, remoteFunctionsDir)
    deployFunctions(session, targets, remoteFunctionsDir)
    restartFunctionsService(session, dockerDir)
    printSuccess(targets)
  })
}

main()
