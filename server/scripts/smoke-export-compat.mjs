#!/usr/bin/env node
/**
 * Smoke-check export response negotiation + optional live /health.
 * Usage:
 *   node scripts/smoke-export-compat.mjs
 *   SMOKE_API_URL=https://mmspro-server.vercel.app node scripts/smoke-export-compat.mjs
 */
import assert from 'node:assert/strict'
import { wantsBlobExport } from '../lib/exportResponse.js'

function checkNegotiation() {
  assert.equal(wantsBlobExport({ headers: { 'x-mms-response': 'blob' } }), true)
  assert.equal(wantsBlobExport({ headers: { accept: 'application/pdf' } }), true)
  assert.equal(wantsBlobExport({ headers: { accept: 'application/json' } }), false)
  assert.equal(wantsBlobExport({ headers: {} }), false)
  console.log('ok  export negotiation (blob + legacy json)')
}

async function checkLiveHealth(baseUrl) {
  const url = `${baseUrl.replace(/\/$/, '')}/health`
  const res = await fetch(url, { method: 'GET' })
  assert.equal(res.ok, true, `health not ok: ${res.status}`)
  const body = await res.json().catch(() => ({}))
  assert.equal(body.status, 'ok', `unexpected health body: ${JSON.stringify(body)}`)
  console.log(`ok  live health ${url}`)
}

async function checkLiveCors(baseUrl, origin) {
  const url = `${baseUrl.replace(/\/$/, '')}/health`
  const res = await fetch(url, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type,x-mms-response,accept',
    },
  })
  // Some hosts answer GET only; treat CORS preflight best-effort.
  const allowHeaders = res.headers.get('access-control-allow-headers') || ''
  const allowOrigin = res.headers.get('access-control-allow-origin') || ''
  console.log(`ok  cors probe status=${res.status} allow-origin=${allowOrigin || '(none)'} allow-headers=${allowHeaders || '(none)'}`)
  // Blob mode primarily uses CORS-safelisted Accept: application/pdf|text/csv.
  // X-MMS-Response is optional and only needed after server redeploy allows it.
}

checkNegotiation()

const smokeUrl = process.env.SMOKE_API_URL || process.env.API_PUBLIC_URL || ''
const smokeOrigin = process.env.SMOKE_ORIGIN || process.env.CLIENT_URL?.split(',')[0] || 'https://mmspro.vercel.app'

if (!smokeUrl) {
  console.log('skip live API smoke (set SMOKE_API_URL to enable)')
  process.exit(0)
}

await checkLiveHealth(smokeUrl)
await checkLiveCors(smokeUrl, smokeOrigin)
console.log('smoke complete')
