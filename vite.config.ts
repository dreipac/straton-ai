import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Legt bei jedem Build eine `version.json` an (Deploy-Erkennung ohne Service Worker). */
function deployVersionPlugin(): Plugin {
  const devBuildId = 'development'
  return {
    name: 'straton-deploy-version',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0]
        if (path === '/version.json' || path?.endsWith('/version.json')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify({ buildId: devBuildId }))
          return
        }
        next()
      })
    },
    generateBundle() {
      const buildId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), deployVersionPlugin()],
})
