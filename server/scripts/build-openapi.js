import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const openapiDir = join(__dirname, '..', 'openapi')

function readYaml(relativePath) {
  const absolutePath = join(openapiDir, relativePath)
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

function buildSpec() {
  const spec = readYaml('openapi.yaml')
  const schemas = readYaml('components/schemas.yaml')
  const securitySchemes = readYaml('components/security.yaml')

  spec.components = spec.components || {}
  deepMerge(spec.components, { schemas, securitySchemes })

  spec.paths = spec.paths || {}
  const pathsDir = join(openapiDir, 'paths')
  for (const file of readdirSync(pathsDir).filter((f) => f.endsWith('.yaml')).sort()) {
    const paths = readYaml(`paths/${file}`)
    deepMerge(spec.paths, paths)
  }

  return spec
}

const spec = buildSpec()
const outPath = join(openapiDir, 'spec.bundle.json')
writeFileSync(outPath, JSON.stringify(spec, null, 2))
console.log(`OpenAPI spec bundled to ${outPath} (${Object.keys(spec.paths).length} paths)`)
