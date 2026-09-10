import 'dotenv/config'
import app from './app.js'
import { getCorsOrigins, getPublicAppUrl } from './lib/appUrl.js'
import { startTaskScheduler } from './lib/taskScheduler.js'
import { ensureSchemaPatches } from './lib/runSchemaPatches.js'

const configuredPort = Number(process.env.PORT) || 5050
const PORT = configuredPort === 5000 ? 5050 : configuredPort
const HOST = process.env.HOST || '0.0.0.0'
const isDev = process.env.NODE_ENV !== 'production'
const allowedOrigins = getCorsOrigins()

if (configuredPort === 5000) {
  console.warn(
    'PORT=5000 conflicts with macOS AirPlay Receiver — starting on 5050 instead. Set PORT=5050 in server/.env to silence this.'
  )
}

async function main() {
  await ensureSchemaPatches()

  const server = app.listen(PORT, HOST, () => {
    console.log(`MMSPro server running on http://${HOST}:${PORT}`)
    if (isDev) {
      console.log('Dev CORS: allowing localhost and private-network origins on ports 5173/4173/3000')
    }
    if (allowedOrigins.length) {
      console.log(`Configured CLIENT_URL origins: ${allowedOrigins.join(', ')}`)
    }
    const publicAppUrl = getPublicAppUrl()
    console.log(`Email/auth redirect base URL: ${publicAppUrl}`)
    console.log(`Swagger UI: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/api/docs`)
    if (!process.env.APP_PUBLIC_URL?.trim() && publicAppUrl.includes('localhost')) {
      console.warn(
        'APP_PUBLIC_URL is not set — password/invite links use localhost and will not work from email on other devices. Set APP_PUBLIC_URL in server/.env to your public domain, ngrok URL, or LAN IP.'
      )
    }
    startTaskScheduler()
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the other process or set PORT to a free port (5050 recommended) in server/.env`)
      process.exit(1)
    }
    throw err
  })
}

main().catch((err) => {
  console.error('[schema] Failed to start server:', err.message)
  process.exit(1)
})
