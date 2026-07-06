import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function resolveServers() {
  const servers = [{ url: 'http://localhost:5050', description: 'Local development' }]

  const explicit = process.env.API_PUBLIC_URL?.trim()
  if (explicit) {
    servers.unshift({
      url: explicit.replace(/\/$/, ''),
      description: 'Production API',
    })
    return servers
  }

  const vercelUrl = process.env.VERCEL_URL?.trim()
  if (vercelUrl) {
    servers.unshift({
      url: `https://${vercelUrl.replace(/\/$/, '')}`,
      description: 'Vercel deployment',
    })
  }

  return servers
}

let cachedSpec = null

export function loadOpenApiSpec() {
  if (cachedSpec) return cachedSpec

  const bundlePath = join(__dirname, 'spec.bundle.json')
  const spec = JSON.parse(readFileSync(bundlePath, 'utf8'))
  spec.servers = resolveServers()
  cachedSpec = spec
  return spec
}
