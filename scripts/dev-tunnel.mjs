#!/usr/bin/env node
/**
 * Public HTTPS URL for local Vite without ngrok's first-visit warning page.
 *
 * Free ngrok always shows an interstitial on the first browser visit; the skip
 * header cannot be sent on a normal link click. Cloudflare quick tunnels do not.
 *
 * Usage: npm run tunnel
 *        npm run tunnel -- 5173
 */
import { spawn, spawnSync } from 'node:child_process'
import process from 'node:process'

const port = process.argv[2] || '5173'
const target = `http://127.0.0.1:${port}`
const urlRe = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i

function hasBinary(name) {
  return spawnSync('which', [name], { encoding: 'utf8' }).status === 0
}

const useNpx = !hasBinary('cloudflared')
const child = useNpx
  ? spawn('npx', ['--yes', 'cloudflared', 'tunnel', '--url', target], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
  : spawn('cloudflared', ['tunnel', '--url', target], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

console.log(`Tunneling ${target}${useNpx ? ' via npx cloudflared' : ''} …`)

const onData = (buf) => {
  const text = buf.toString()
  process.stderr.write(text)
  const match = text.match(urlRe)
  if (match) {
    console.log('\nShare this URL (opens the app, no ngrok warning page):')
    console.log(`  ${match[0]}\n`)
    console.log(`Set APP_PUBLIC_URL=${match[0]} in server/.env for password-reset / invite emails.\n`)
  }
}

child.stdout.on('data', onData)
child.stderr.on('data', onData)
child.on('error', (err) => {
  console.error('Failed to start tunnel:', err.message)
  if (useNpx) {
    console.error('Install Cloudflare’s tunnel client: brew install cloudflared')
  }
  process.exit(1)
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
