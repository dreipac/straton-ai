import { ensureEnvDbExists, loadEnvDb, requireEnvKey } from './load-env-db.mjs'
import { withSshSession } from './ssh-session.mjs'

const DEFAULT_RENDERER_DIR = '~/pptx-renderer'

/** ~ expandiert per $HOME — in SSH-Single-Quotes würde ~ literal bleiben. */
function remoteShellPath(dir) {
  const expanded = dir.startsWith('~/') ? `$HOME/${dir.slice(2)}` : dir
  return `"${expanded.replace(/"/g, '\\"')}"`
}

function deployCode(session, remoteDir) {
  session.run(
    'PPTX-Renderer-Code hochladen',
    'rsync',
    [
      '-avz',
      '--delete',
      '--exclude=.env',
      '--exclude=venv',
      '--exclude=__pycache__',
      '-e',
      session.rsyncShell,
      'services/pptx-renderer/',
      `${session.sshTarget}:${remoteDir}/`,
    ],
  )
}

function installDependencies(session, remoteDir) {
  const dir = remoteShellPath(remoteDir)
  session.runRemote(
    'Python-Venv sicherstellen + Abhängigkeiten installieren',
    `cd ${dir} && (test -d venv || python3 -m venv venv) && venv/bin/pip install -q -r requirements.txt`,
  )
}

function restartService(session) {
  const { ok } = session.runRemoteInteractiveSoft(
    'pptx-renderer neu starten',
    'sudo systemctl restart pptx-renderer',
  )
  if (ok) {
    return
  }
  console.warn(
    '\n\x1b[33mHinweis: Neustart fehlgeschlagen oder Passwort nicht eingegeben — Code/Abhängigkeiten\n' +
      'wurden trotzdem hochgeladen, der Service läuft aber ggf. noch mit dem alten Code, bis du\n' +
      'manuell neu startest: ssh <ziel> sudo systemctl restart pptx-renderer\x1b[0m',
  )
  console.warn(
    'Für automatische, passwortlose Neustarts bei künftigen Deploys einmalig auf dem Server:\n' +
      '  echo "$(whoami) ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart pptx-renderer" | sudo tee /etc/sudoers.d/pptx-renderer\n' +
      '  sudo chmod 440 /etc/sudoers.d/pptx-renderer',
  )
}

function main() {
  ensureEnvDbExists()

  const config = loadEnvDb()
  const sshTarget = requireEnvKey(config, 'DB_SSH_TARGET')
  const remoteDir = config.get('DB_SSH_PPTX_RENDERER_DIR')?.trim() || DEFAULT_RENDERER_DIR

  console.log(`PPTX-Renderer deploy via SSH → ${sshTarget}`)
  console.log(`Ziel: ${remoteDir}`)

  withSshSession(sshTarget, (session) => {
    session.runRemote('Remote-Verzeichnis anlegen', `mkdir -p ${remoteShellPath(remoteDir)}`)
    deployCode(session, remoteDir)
    installDependencies(session, remoteDir)
    restartService(session)
    console.log('\n\x1b[32mPPTX-Renderer erfolgreich deployed\x1b[0m')
    console.log(
      'Hinweis: Beim allerersten Deploy zusätzlich manuell einrichten — services/pptx-renderer/pptx-renderer.service\n' +
        `nach /etc/systemd/system/ kopieren (Pfade ggf. an ${remoteDir} anpassen), .env mit\n` +
        'PPTX_RENDER_SERVICE_TOKEN auf dem Server anlegen (siehe .env.example), dann:\n' +
        '  sudo systemctl daemon-reload && sudo systemctl enable --now pptx-renderer\n' +
        'Danach in den Supabase Edge Function Secrets PPTX_RENDER_SERVICE_URL (z.B. http://127.0.0.1:8800)\n' +
        'und PPTX_RENDER_SERVICE_TOKEN (gleicher Wert wie oben) hinterlegen.',
    )
  })
}

main()
