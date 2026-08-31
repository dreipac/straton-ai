import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export class SshSession {
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
  runRemote(label, remoteCmd) {
    this.run(label, 'ssh', [...this.sshBaseArgs, this.sshTarget, remoteCmd])
  }

  /**
   * Wie `runRemote`, aber mit `-t` (Pseudo-TTY) — nötig, wenn der Remote-Befehl interaktiv
   * `sudo` nach einem Passwort fragen könnte (z.B. solange NOPASSWD noch nicht eingerichtet ist).
   * Schlägt bei Fehler NICHT mit `process.exit` ab, sondern gibt `{ ok }` zurück — der Aufrufer
   * entscheidet, ob das fatal ist (z.B. Restart-Schritt soll den Rest des Deploys nicht blockieren).
   */
  runRemoteInteractiveSoft(label, remoteCmd) {
    console.log(`\n→ ${label}`)
    const result = spawnSync(
      'ssh',
      [...this.sshBaseArgs, '-t', this.sshTarget, remoteCmd],
      { stdio: 'inherit' },
    )
    return { ok: result.status === 0 }
  }
}

/** @param {string} sshTarget @param {(session: SshSession) => void} fn */
export function withSshSession(sshTarget, fn) {
  const session = new SshSession(sshTarget)
  try {
    session.connect()
    fn(session)
  } finally {
    session.close()
  }
}
