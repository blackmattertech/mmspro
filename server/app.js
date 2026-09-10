import express from 'express'
import cors from 'cors'
import compression from 'compression'
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
import equipmentRoutes from './routes/api/equipment.js'
import equipmentFieldsRoutes from './routes/api/equipmentFields.js'
import workOrdersRoutes from './routes/api/workOrders.js'
import pmRoutes from './routes/api/pm.js'
import workRequestsRoutes from './routes/api/workRequests.js'
import warrantiesRoutes from './routes/api/warranties.js'
import vendorsRoutes from './routes/api/vendors.js'
import orgStatusesRoutes from './routes/api/orgStatuses.js'
import tasksRoutes from './routes/api/tasks.js'
import profileRoutes from './routes/api/profile.js'
import rolesRoutes from './routes/api/roles.js'
import internalRoutes from './routes/api/internal.js'
import reportsRoutes from './routes/api/reports.js'

const app = express()
const isDev = process.env.NODE_ENV !== 'production'
const allowedOrigins = getCorsOrigins()
const DEV_PORTS = new Set(['5173', '4173', '3000'])

app.use(compression())

function isDevTunnelHost(hostname) {
  return (
    /(?:^|\.)ngrok(?:-free)?\.(?:dev|app|io)$/i.test(hostname) ||
    /ngrok/i.test(hostname) ||
    hostname.endsWith('.trycloudflare.com') ||
    hostname.endsWith('.loca.lt')
  )
}

function isAllowedOrigin(origin) {
  if (!origin) return true
  if (allowedOrigins.includes(origin)) return true

  if (!isDev) return false

  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    if (DEV_PORTS.has(url.port)) return true
    return url.protocol === 'https:' && isDevTunnelHost(url.hostname)
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
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  })
)
app.use(express.json({ limit: '4mb' }))

try {
  const openApiSpec = loadOpenApiSpec()
  app.get('/api/docs/openapi.json', (_req, res) => res.json(openApiSpec))
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec))
} catch (err) {
  console.warn('Swagger UI disabled:', err.message)
  app.get('/api/docs', (_req, res) => {
    res.status(503).json({ error: 'API docs unavailable', detail: err.message })
  })
}

app.use('/api/auth', authRoutes)
app.use('/api/internal', internalRoutes)
app.use('/api/company', companyRoutes)
app.use('/api/roles', rolesRoutes)
app.use('/api/assets', assetsRoutes)
app.use('/api/equipment', equipmentRoutes)
app.use('/api/equipment-fields', equipmentFieldsRoutes)
app.use('/api/work-orders', workOrdersRoutes)
app.use('/api/pm', pmRoutes)
app.use('/api/work-requests', workRequestsRoutes)
app.use('/api/warranties', warrantiesRoutes)
app.use('/api/vendors', vendorsRoutes)
app.use('/api/org-statuses', orgStatusesRoutes)
app.use('/api/tasks', tasksRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api', apiRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/admin-api', adminRoutes)

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

export default app
