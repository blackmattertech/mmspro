import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import apiRoutes from './routes/api/index.js'
import adminRoutes from './routes/admin/index.js'
import notificationRoutes from './routes/api/notifications.js'
import authRoutes from './routes/api/auth.js'

const app = express()
const PORT = Number(process.env.PORT) || 5050
const HOST = process.env.HOST || '0.0.0.0'
const isDev = process.env.NODE_ENV !== 'production'

if (PORT === 5000) {
  console.warn(
    'WARNING: PORT=5000 conflicts with macOS AirPlay Receiver. Use PORT=5050 in server/.env'
  )
}

const allowedOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const DEV_PORTS = new Set(['5173', '4173', '3000'])

function isAllowedOrigin(origin) {
  if (!origin) return true
  if (allowedOrigins.includes(origin)) return true

  if (!isDev) return false

  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    // Dev: allow any host on Vite/common dev ports (localhost, LAN IP, etc.)
    return DEV_PORTS.has(url.port)
  } catch {
    return false
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, origin || true)
      } else {
        console.warn(`CORS blocked origin: ${origin}`)
        callback(null, false)
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)
app.use(express.json())

app.use('/api', apiRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/admin-api', adminRoutes)

app.get('/health', (_, res) => res.json({ status: 'ok' }))

app.listen(PORT, HOST, () => {
  console.log(`MMSPro server running on http://${HOST}:${PORT}`)
  if (isDev) {
    console.log('Dev CORS: allowing localhost and private-network origins on ports 5173/4173/3000')
  }
  if (allowedOrigins.length) {
    console.log(`Configured CLIENT_URL origins: ${allowedOrigins.join(', ')}`)
  }
})
