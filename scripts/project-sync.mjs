import { createInterface } from 'node:readline/promises'
import { ensureEnvDbExists, loadEnvDb, requireEnvKey } from './load-env-db.mjs'
import { withSshSession } from './ssh-session.mjs'

const DEFAULT_PROJECT_DIR = '~/dev-mirror/straton'

/** ~ expandiert per $HOME — in SSH-Single-Quotes würde ~ literal bleiben. */
function remoteShellPath(dir) {
  const expanded = dir.startsWith('~/') ? `$HOME/${dir.slice(2)}` : dir
  return `"${expanded.replace(/"/g, '\\"')}"`
}

function syncDirs(session, remoteDir, direction) {
  const source = direction === 'push' ? './' : `${session.sshTarget}:${remoteDir}/`
  const dest = direction === 'push' ? `${session.sshTarget}:${remoteDir}/` : './'
  const label = direction === 'push' ? 'Projekt hochladen (lokal → Server)' : 'Projekt runterladen (Server → lokal)'

  session.run(label, 'rsync', ['-avz', '--delete', '-e', session.rsyncShell, source, dest])
}

async function confirmPull() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(
    '\nWARNUNG: "pull" überschreibt den lokalen Projektordner komplett mit dem Serverstand\n' +
      'und LÖSCHT lokale Dateien, die auf dem Server nicht existieren.\n' +
      'Fortfahren? [y/N] ',
  )
  rl.close()
  return answer.trim().toLowerCase() === 'y'
}

async function main() {
  const direction = process.argv[2]
  const skipConfirm = process.argv.slice(3).some((arg) => arg === '--yes' || arg === '-y')

  if (direction !== 'push' && direction !== 'pull') {
    console.error('Nutzung: node scripts/project-sync.mjs <push|pull> [--yes]')
    process.exit(1)
  }

  ensureEnvDbExists()
  const config = loadEnvDb()
  const sshTarget = requireEnvKey(config, 'DB_SSH_TARGET')
  const remoteDir = config.get('DB_SSH_PROJECT_DIR')?.trim() || DEFAULT_PROJECT_DIR

  if (direction === 'pull' && !skipConfirm) {
    const ok = await confirmPull()
    if (!ok) {
      console.log('Abgebrochen.')
      return
    }
  }

  console.log(`Projekt-Sync (${direction}) via SSH → ${sshTarget}`)
  console.log(`Server-Verzeichnis: ${remoteDir}`)

  withSshSession(sshTarget, (session) => {
    if (direction === 'push') {
      session.runRemote('Server-Verzeichnis anlegen', `mkdir -p ${remoteShellPath(remoteDir)}`)
    }
    syncDirs(session, remoteDir, direction)
    console.log(`\n\x1b[32mProjekt-${direction} abgeschlossen\x1b[0m`)
  })
}

main()
