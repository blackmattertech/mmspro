/**
 * Copy repo `/shared` into `/server/shared` so Vercel (Root Directory = server)
 * can resolve relative imports. Without this, serverless boot fails with
 * ERR_MODULE_NOT_FOUND and browsers report a false CORS error.
 */
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(serverRoot, '..', 'shared')
const dest = join(serverRoot, 'shared')

if (!existsSync(source)) {
  if (existsSync(dest)) {
    console.log('[vendor-shared] using existing server/shared (source ../shared missing)')
    process.exit(0)
  }
  console.error('[vendor-shared] missing ../shared — cannot vendor')
  process.exit(1)
}

rmSync(dest, { recursive: true, force: true })
cpSync(source, dest, { recursive: true })
console.log('[vendor-shared] copied ../shared → ./shared')
