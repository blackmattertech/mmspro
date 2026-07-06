import express from 'express'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import 'dotenv/config'
import { getCorsOrigins } from './lib/appUrl.js'
import { loadOpenApiSpec } from './openapi/loadSpec.js'
import apiRoutes from './routes/api/index.js'
import adminRoutes from './routes/admin/index.js'
import notificationRoutes from './routes/api/notifications.js'
import authRoutes from './routes/api/auth.js'
import companyRoutes from './routes/api/company.js'
import assetsRoutes from './routes/api/assets.js'
import workOrdersRoutes from './routes/api/workOrders.js'
import profileRoutes from './routes/api/profile.js'

const app = express()
const isDev = process.env.NODE_ENV !== 'production'
const allowedOrigins = getCorsOrigins()
const DEV_PORTS = new Set(['5173', '4173', '3000'])

function isAllowedOrigin(origin) {
  if (!origin) return true
  if (allowedOrigins.includes(origin)) return true

  if (!isDev) return false

  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
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

const openApiSpec = loadOpenApiSpec()
app.get('/api/docs/openapi.json', (_req, res) => res.json(openApiSpec))
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec))

app.use('/api/auth', authRoutes)
app.use('/api/company', companyRoutes)
app.use('/api/assets', assetsRoutes)
app.use('/api/work-orders', workOrdersRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api', apiRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/admin-api', adminRoutes)

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

export default app
