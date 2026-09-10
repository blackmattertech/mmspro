import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ADVISORY_LOCK = 7277001

let inflight = null

function patchesDirectory() {
  if (process.env.SCHEMA_PATCHES_DIR) return process.env.SCHEMA_PATCHES_DIR
  const candidates = [
    join(__dirname, '../../supabase-patches'),
    join(__dirname, '../supabase-patches'),
    join(process.cwd(), 'supabase-patches'),
    join(process.cwd(), '../supabase-patches'),
  ]
  return candidates.find((dir) => existsSync(dir)) || null
}

function projectRefFromUrl(url = process.env.SUPABASE_URL) {
  if (!url) return null
  try {
    const host = new URL(url).hostname
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i)
    return match?.[1] || null
  } catch {
    return null
  }
}

function decodeMaybe(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function poolerHostVariants(host) {
  if (!host) return [host]
  const regionHost = host.replace(/^aws-\d+-/, '')
  if (!/^[a-z0-9-]+\.pooler\.supabase\.com$/i.test(regionHost)) return [host]
  const preferred = host.startsWith('aws-') ? [host] : []
  return [...new Set([...preferred, `aws-0-${regionHost}`, `aws-1-${regionHost}`, `aws-2-${regionHost}`])]
}

function replaceUrlHost(url, host) {
  const at = url.lastIndexOf('@')
  if (at === -1) return url
  const after = url.slice(at + 1)
  return `${url.slice(0, at + 1)}${after.replace(/^[^:/]+/, host)}`
}

/** Encode user/password so characters like @ in the DB password are not treated as the host separator. */
export function encodeDatabaseUrl(url) {
  if (!url) return url
  const match = url.match(/^(postgres(?:ql)?):\/\/([^/]+)@(.+)$/i)
  if (!match) return url
  const [, protocol, creds, rest] = match
  const colon = creds.indexOf(':')
  if (colon === -1) return url
  const user = decodeMaybe(creds.slice(0, colon))
  const password = decodeMaybe(creds.slice(colon + 1))
  return `${protocol}://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${rest}`
}

function resolveDatabaseUrl() {
  const password = process.env.SUPABASE_DB_PASSWORD
  const ref = projectRefFromUrl()

  if (password && ref) {
    const host = process.env.SUPABASE_DB_HOST || `db.${ref}.supabase.co`
    const port = process.env.SUPABASE_DB_PORT || '5432'
    const isPooler = /pooler\.supabase/i.test(host)
    const user = process.env.SUPABASE_DB_USER || (isPooler ? `postgres.${ref}` : 'postgres')
    const database = process.env.SUPABASE_DB_NAME || 'postgres'
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`
  }

  const direct = process.env.DATABASE_URL
    || process.env.SUPABASE_DB_URL
    || process.env.SUPABASE_DATABASE_URL
  return encodeDatabaseUrl(direct)
}

function needsSsl(databaseUrl) {
  if (process.env.SUPABASE_DB_SSL === 'false') return false
  if (process.env.SUPABASE_DB_SSL === 'true') return true
  return /supabase\.(co|com)|pooler\.supabase/i.test(databaseUrl)
}

export function splitSqlStatements(sql) {
  const statements = []
  let current = ''
  let i = 0
  let inSingle = false
  let inLineComment = false
  let inBlockComment = false
  let dollarTag = null

  while (i < sql.length) {
    const ch = sql[i]
    const next = sql[i + 1]

    if (inLineComment) {
      current += ch
      if (ch === '\n') inLineComment = false
      i += 1
      continue
    }
    if (inBlockComment) {
      current += ch
      if (ch === '*' && next === '/') {
        current += '/'
        i += 2
        inBlockComment = false
        continue
      }
      i += 1
      continue
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag
        i += dollarTag.length
        dollarTag = null
        continue
      }
      current += ch
      i += 1
      continue
    }
    if (inSingle) {
      current += ch
      if (ch === "'" && next === "'") {
        current += "'"
        i += 2
        continue
      }
      if (ch === "'") inSingle = false
      i += 1
      continue
    }
    if (ch === '-' && next === '-') {
      inLineComment = true
      current += ch
      i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      current += ch
      i += 1
      continue
    }
    if (ch === "'") {
      inSingle = true
      current += ch
      i += 1
      continue
    }
    if (ch === '$') {
      const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
      if (match) {
        dollarTag = match[0]
        current += dollarTag
        i += dollarTag.length
        continue
      }
    }
    if (ch === ';') {
      const stmt = current.trim()
      if (stmt && !isCommentOnly(stmt)) statements.push(stmt)
      current = ''
      i += 1
      continue
    }
    current += ch
    i += 1
  }

  const tail = current.trim()
  if (tail && !isCommentOnly(tail)) statements.push(tail)
  return statements
}

function isCommentOnly(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
    .trim() === ''
}

function checksum(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

function listPatchFiles(dir) {
  return readdirSync(dir)
    .filter((name) => (
      name.endsWith('.sql')
      && !name.startsWith('_')
      && !name.startsWith('99-wipe')
      && /^\d{2,}-/.test(name)
    ))
    .sort((a, b) => {
      const na = parseInt(a, 10)
      const nb = parseInt(b, 10)
      if (na !== nb) return na - nb
      return a.localeCompare(b)
    })
}

async function managementQuery(ref, token, query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = body?.message || body?.error || body?.msg || JSON.stringify(body)
    throw new Error(detail || `Management API ${response.status}`)
  }
  return Array.isArray(body) ? body : (body?.data || body)
}

function postgresExecutor(databaseUrl) {
  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: needsSsl(databaseUrl) ? 'require' : false,
    idle_timeout: 5,
    connect_timeout: 20,
    onnotice: () => {},
  })
  return {
    kind: 'postgres',
    async exec(text) {
      return sql.unsafe(text).simple()
    },
    async end() {
      await sql.end({ timeout: 5 })
    },
  }
}

function isUnknownPoolerTenant(err) {
  const message = String(err?.message || err)
  return /tenant\/user .+ not found/i.test(message) || /no tenant identifier/i.test(message)
}

async function createExecutor() {
  const databaseUrl = resolveDatabaseUrl()
  if (databaseUrl) {
    const hostMatch = databaseUrl.match(/@([^:/]+)/)
    const hosts = poolerHostVariants(hostMatch?.[1] || '')
    let lastError = null
    for (const host of hosts) {
      const url = replaceUrlHost(databaseUrl, host)
      const executor = postgresExecutor(url)
      try {
        await executor.exec('select 1')
        if (host !== hostMatch?.[1]) {
          console.log(`[schema] connected via pooler host ${host}`)
        }
        return executor
      } catch (err) {
        lastError = err
        await executor.end().catch(() => {})
        if (!isUnknownPoolerTenant(err)) throw err
      }
    }
    throw lastError || new Error('Could not connect to Postgres')
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN
  const ref = projectRefFromUrl()
  if (token && ref) {
    return {
      kind: 'management-api',
      async exec(text) {
        return managementQuery(ref, token, text)
      },
      async end() {},
    }
  }

  return null
}

async function execSql(executor, sql, filename) {
  try {
    await executor.exec(sql)
    return
  } catch (err) {
    const statements = splitSqlStatements(sql)
    if (statements.length <= 1) {
      throw new Error(`${filename}: ${err.message}`)
    }
    for (const stmt of statements) {
      try {
        await executor.exec(stmt)
      } catch (inner) {
        throw new Error(`${filename}: ${inner.message}\n${stmt.slice(0, 280)}`)
      }
    }
  }
}

async function runSchemaPatchesOnce() {
  if (process.env.AUTO_MIGRATE === 'false') {
    console.log('[schema] auto-migrate disabled (AUTO_MIGRATE=false)')
    return { skipped: true, applied: [] }
  }

  const dir = patchesDirectory()
  if (!dir) {
    console.warn('[schema] supabase-patches directory not found — skipping auto-migrate')
    return { skipped: true, applied: [] }
  }

  const executor = await createExecutor()
  if (!executor) {
    console.warn(
      '[schema] Skipping auto-migrate. Set DATABASE_URL or SUPABASE_DB_PASSWORD (Project Settings → Database) so numbered supabase-patches apply on startup.'
    )
    return { skipped: true, applied: [] }
  }

  const files = listPatchFiles(dir)
  const applied = []

  try {
    await executor.exec(`
      create table if not exists public.schema_patches (
        filename text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `)
    await executor.exec(`select pg_advisory_lock(${ADVISORY_LOCK})`)

    const listed = await executor.exec('select filename, checksum from public.schema_patches')
    const existing = new Map(
      (Array.isArray(listed) ? listed : []).map((row) => [row.filename, row.checksum]),
    )

    for (const filename of files) {
      const contents = readFileSync(join(dir, filename), 'utf8')
      const hash = checksum(contents)
      if (existing.get(filename) === hash) continue

      const started = Date.now()
      await execSql(executor, contents, filename)
      await executor.exec(`
        insert into public.schema_patches (filename, checksum, applied_at)
        values ('${filename.replace(/'/g, "''")}', '${hash}', now())
        on conflict (filename) do update
          set checksum = excluded.checksum,
              applied_at = excluded.applied_at
      `)
      applied.push(filename)
      console.log(`[schema] applied ${filename} (${Date.now() - started}ms)`)
    }

    if (!applied.length) {
      console.log(`[schema] up to date (${files.length} patches)`)
    } else {
      console.log(`[schema] applied ${applied.length} patch(es)`)
    }
    return { skipped: false, applied }
  } finally {
    try {
      await executor.exec(`select pg_advisory_unlock(${ADVISORY_LOCK})`)
    } catch {
      // ignore unlock errors on a failed connection
    }
    await executor.end()
  }
}

export function ensureSchemaPatches() {
  if (!inflight) {
    inflight = runSchemaPatchesOnce().catch((err) => {
      inflight = null
      throw err
    })
  }
  return inflight
}
