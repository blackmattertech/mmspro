import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isRichTextEmpty,
  looksLikeHtml,
  plainTextFromRich,
  richTextLength,
  sanitizeRichText,
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

test('sanitizeRichText keeps bold/italic/underline; strips link highlight and size', () => {
  const input = [
    '<p>',
    '<strong>Bold</strong> ',
    '<em>Italic</em> ',
    '<u>Under</u> ',
    '<a href="https://example.com">Link</a> ',
    '<mark>Highlight</mark> ',
    '<span style="font-size: 22px">Large</span>',
    '</p>',
  ].join('')
  const cleaned = sanitizeRichText(input)
  assert.match(cleaned, /<(strong|b)>Bold<\/(strong|b)>/i)
  assert.match(cleaned, /<em>Italic<\/em>/)
  assert.match(cleaned, /<u>Under<\/u>/)
  assert.doesNotMatch(cleaned, /<a\b/i)
  assert.doesNotMatch(cleaned, /<mark\b/i)
  assert.doesNotMatch(cleaned, /font-size/i)
  assert.doesNotMatch(cleaned, /<span\b/i)
  assert.match(cleaned, /Link/)
  assert.match(cleaned, /Highlight/)
  assert.match(cleaned, /Large/)
})
