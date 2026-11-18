import test from 'node:test'
import assert from 'node:assert/strict'
import { wantsBlobExport } from './exportResponse.js'

test('wantsBlobExport is true for X-MMS-Response blob', () => {
  assert.equal(wantsBlobExport({ headers: { 'x-mms-response': 'blob' } }), true)
  assert.equal(wantsBlobExport({ headers: { 'x-mms-response': 'binary' } }), true)
})

test('wantsBlobExport is false for explicit json/base64', () => {
  assert.equal(wantsBlobExport({ headers: { 'x-mms-response': 'json' } }), false)
  assert.equal(wantsBlobExport({ body: { response_format: 'base64' } }), false)
})

test('wantsBlobExport follows Accept pdf/csv over default', () => {
  assert.equal(wantsBlobExport({ headers: { accept: 'application/pdf' } }), true)
  assert.equal(wantsBlobExport({ headers: { accept: 'text/csv' } }), true)
  assert.equal(wantsBlobExport({ headers: { accept: 'application/json' } }), false)
})

test('wantsBlobExport defaults to legacy JSON for old clients', () => {
  assert.equal(wantsBlobExport({ headers: {} }), false)
  assert.equal(wantsBlobExport({ headers: { accept: '*/*' } }), false)
})
