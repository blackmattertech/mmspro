import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const SW_TEMPLATE = resolve(__dirname, 'public/firebase-messaging-sw.template.js')
const SW_OUTPUT = resolve(__dirname, 'public/firebase-messaging-sw.js')

function buildFirebaseServiceWorker(env) {
  const replacements = {
    __VITE_FIREBASE_API_KEY__: env.VITE_FIREBASE_API_KEY ?? '',
    __VITE_FIREBASE_AUTH_DOMAIN__: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    __VITE_FIREBASE_PROJECT_ID__: env.VITE_FIREBASE_PROJECT_ID ?? '',
    __VITE_FIREBASE_STORAGE_BUCKET__: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
    __VITE_FIREBASE_MESSAGING_SENDER_ID__: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    __VITE_FIREBASE_APP_ID__: env.VITE_FIREBASE_APP_ID ?? '',
  }

  let content = readFileSync(SW_TEMPLATE, 'utf8')
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(key, value)
  }

  writeFileSync(SW_OUTPUT, content)
  return content
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const serviceWorkerContent = buildFirebaseServiceWorker(env)

  return {
    plugins: [
      react(),
      {
        name: 'firebase-sw-dist',
        writeBundle() {
          writeFileSync(resolve(__dirname, 'dist/firebase-messaging-sw.js'), serviceWorkerContent)
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        strategies: 'injectManifest',
        srcDir: 'public',
        filename: 'firebase-messaging-sw.js',
        manifest: false,
        injectManifest: {
          injectionPoint: undefined,
        },
      }),
    ],
    server: {
      host: true,
      port: 5173,
      // Allow ngrok / tunnel hostnames when testing password-reset emails
      allowedHosts: mode === 'development' ? true : undefined,
      proxy: {
        '/api': 'http://127.0.0.1:5050',
        '/admin-api': 'http://127.0.0.1:5050',
      },
    },
  }
})
