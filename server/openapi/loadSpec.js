import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readYaml(relativePath) {
  const absolutePath = join(__dirname, relativePath)
  return parseYaml(readFileSync(absolutePath, 'utf8'))
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      deepMerge(target[key], value)
    } else {
      target[key] = value
    }
  }
  return target
}

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

  const spec = readYaml('openapi.yaml')
  const schemas = readYaml('components/schemas.yaml')
  const securitySchemes = readYaml('components/security.yaml')

  spec.components = spec.components || {}
  deepMerge(spec.components, { schemas, securitySchemes })

  spec.paths = spec.paths || {}
  const pathsDir = join(__dirname, 'paths')
  for (const file of readdirSync(pathsDir).filter((f) => f.endsWith('.yaml')).sort()) {
    const paths = readYaml(`paths/${file}`)
    deepMerge(spec.paths, paths)
  }

  spec.servers = resolveServers()
  cachedSpec = spec
  return spec
}
