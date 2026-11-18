import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isRichTextEmpty,
  looksLikeHtml,
  plainTextFromRich,
  richTextLength,
} from './richText.js'

test('looksLikeHtml detects markup', () => {
  assert.equal(looksLikeHtml('<p>Hello</p>'), true)
  assert.equal(looksLikeHtml('Hello world'), false)
})

test('plainTextFromRich strips tags and keeps readable text', () => {
  assert.equal(plainTextFromRich('<p>Hello <strong>world</strong></p>'), 'Hello world')
  assert.equal(plainTextFromRich('Plain notes'), 'Plain notes')
  assert.equal(plainTextFromRich('<ul><li>One</li><li>Two</li></ul>'), 'One\nTwo')
})

test('rich text emptiness and length ignore markup', () => {
  assert.equal(isRichTextEmpty('<p></p>'), true)
  assert.equal(isRichTextEmpty('<p><br></p>'), true)
  assert.equal(richTextLength('<p>abc</p>'), 3)
})
