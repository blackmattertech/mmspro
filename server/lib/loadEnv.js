import dotenv from 'dotenv'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = resolve(serverRoot, '.env')

/** Load server/.env regardless of process.cwd() (tests, scripts, monorepo roots). */
export function loadServerEnv() {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false })
  } else {
    dotenv.config({ override: false })
  }
  return envPath
}

loadServerEnv()
