import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import { getCorsOrigins, getPublicAppUrl } from './lib/appUrl.js'
import apiRoutes from './routes/api/index.js'
import adminRoutes from './routes/admin/index.js'
import notificationRoutes from './routes/api/notifications.js'
import authRoutes from './routes/api/auth.js'
import companyRoutes from './routes/api/company.js'
import assetsRoutes from './routes/api/assets.js'
import workOrdersRoutes from './routes/api/workOrders.js'
import profileRoutes from './routes/api/profile.js'

const app = express()
const configuredPort = Number(process.env.PORT) || 5050
// macOS AirPlay Receiver binds to 5000; client Vite proxy targets 5050 by default.
const PORT = configuredPort === 5000 ? 5050 : configuredPort
const HOST = process.env.HOST || '0.0.0.0'
const isDev = process.env.NODE_ENV !== 'production'

if (configuredPort === 5000) {
  console.warn(
    'PORT=5000 conflicts with macOS AirPlay Receiver — starting on 5050 instead. Set PORT=5050 in server/.env to silence this.'
  )
}

const allowedOrigins = getCorsOrigins()

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

app.use('/api/auth', authRoutes)
app.use('/api/company', companyRoutes)
app.use('/api/assets', assetsRoutes)
app.use('/api/work-orders', workOrdersRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api', apiRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/admin-api', adminRoutes)

app.get('/health', (_, res) => res.json({ status: 'ok' }))

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
  if (!process.env.APP_PUBLIC_URL?.trim() && publicAppUrl.includes('localhost')) {
    console.warn(
      'APP_PUBLIC_URL is not set — password/invite links use localhost and will not work from email on other devices. Set APP_PUBLIC_URL in server/.env to your public domain, ngrok URL, or LAN IP.'
    )
  }
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other process or set PORT to a free port (5050 recommended) in server/.env`)
    process.exit(1)
  }
  throw err
})
