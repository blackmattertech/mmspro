import test from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeHtml, plainTextFromRich } from './richText.js'

test('server plainTextFromRich strips HTML for PDF/CSV', () => {
  assert.equal(looksLikeHtml('<p>Hi</p>'), true)
  assert.equal(plainTextFromRich('<p>Root <em>cause</em></p>'), 'Root cause')
  assert.equal(plainTextFromRich('Already plain'), 'Already plain')
})
