import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { createSyncMiddleware } from './server/devSync.ts'

function moneyTrackerApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'money-tracker-api',
    configureServer(server) {
      server.middlewares.use(createSyncMiddleware(env))
    },
    configurePreviewServer(server) {
      server.middlewares.use(createSyncMiddleware(env))
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: env.VITE_BASE || '/',
    plugins: [react(), tailwindcss(), moneyTrackerApiPlugin(env)],
    server: {
      port: 7687,
      strictPort: true,
    },
    preview: {
      port: 7687,
      strictPort: true,
    },
  }
})
