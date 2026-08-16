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
        name: 'dev-ngrok-skip-warning',
        transformIndexHtml(html, ctx) {
          if (ctx.server?.config?.command !== 'serve') return html
          const script = `<script>
      (function skipNgrokWarning() {
        var SKIP = 'ngrok-skip-browser-warning'
        if (!/ngrok/i.test(location.hostname)) return

        var nativeFetch = window.fetch
        window.fetch = function (input, init) {
          var headers
          if (init && init.headers) headers = new Headers(init.headers)
          else if (typeof Request !== 'undefined' && input instanceof Request) headers = new Headers(input.headers)
          else headers = new Headers()
          if (!headers.has(SKIP)) headers.set(SKIP, '1')
          if (typeof Request !== 'undefined' && input instanceof Request) {
            return nativeFetch.call(this, new Request(input, Object.assign({}, init, { headers: headers })))
          }
          return nativeFetch.call(this, input, Object.assign({}, init || {}, { headers: headers }))
        }

        var xhrOpen = XMLHttpRequest.prototype.open
        var xhrSend = XMLHttpRequest.prototype.send
        XMLHttpRequest.prototype.open = function () {
          this.__ngrokSkip = true
          return xhrOpen.apply(this, arguments)
        }
        XMLHttpRequest.prototype.send = function () {
          if (this.__ngrokSkip) {
            try { this.setRequestHeader(SKIP, '1') } catch (e) {}
          }
          return xhrSend.apply(this, arguments)
        }

        var candidates = ['/favicon.svg', '/favicon-32x32.png', '/favicon.ico']
        function apply(href, type) {
          var link = document.querySelector('link[data-app-favicon]') || document.createElement('link')
          link.rel = 'icon'
          link.type = type
          link.href = href
          link.setAttribute('data-app-favicon', '1')
          if (!link.parentNode) document.head.appendChild(link)
        }
        function tryNext(i) {
          if (i >= candidates.length) return
          var href = candidates[i]
          fetch(href, { cache: 'no-store' })
            .then(function (res) {
              if (!res.ok) throw new Error('favicon failed')
              var type = res.headers.get('content-type') || ''
              if (type.indexOf('text/html') !== -1) throw new Error('got html')
              return res.blob().then(function (blob) {
                if (blob.type && blob.type.indexOf('text/html') !== -1) throw new Error('got html blob')
                apply(URL.createObjectURL(blob), blob.type || type || 'image/svg+xml')
              })
            })
            .catch(function () { tryNext(i + 1) })
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', function () { tryNext(0) })
        } else {
          tryNext(0)
        }
      })()
    </script>`
          return html.replace('</head>', `${script}\n  </head>`)
        },
      },
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
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('firebase')) return 'vendor-firebase'
              if (id.includes('@supabase')) return 'vendor-supabase'
              if (
                id.includes('react-dom')
                || id.includes('react-router')
                || id.includes('/react/')
              ) return 'vendor-react'
              if (id.includes('@lottiefiles')) return 'vendor-lottie'
            }
          },
        },
      },
    },
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
